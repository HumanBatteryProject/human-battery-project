"""Every Human Battery Project agent, as a PDF.

    python3 program-docs/agents_doc.py

WHY THE STATUS IS READ FROM THE REPOSITORY AND NOT FROM THE ROSTER.

agents/roster.json says what each agent IS: its group, its job, what it may
never do, and whether it is meant to be on. It is a declaration, and a
declaration can be aspirational without anybody noticing.

So this document does not print it. For every agent it goes and looks:

  does .claude/agents/<name>.md exist          -> is it written at all
  does .github/workflows/<name>.yml exist      -> is it actually scheduled
  what does the roster say it is meant to be   -> on, or off and why

and prints the ANSWER. An agent in the roster with no file reads NOT BUILT. One
with a file and no workflow, that is meant to run on a schedule, reads WRITTEN,
NOT SCHEDULED. That is the whole point of generating this rather than writing
it: a summary document that is typed by hand is a summary document that is
wrong three weeks later, and the way it goes wrong is always flattering.

The never-allowed lists are read from each agent's own file where that file
exists, not from the roster, for the same reason the issue text is: the file is
what the agent is actually holding.
"""
import json
import os
import re
import sys
from pathlib import Path

from weasyprint import HTML

import design as D
import build as B

ROOT = Path(__file__).resolve().parent.parent
ROSTER = ROOT / "agents" / "roster.json"
AGENT_DIR = ROOT / ".claude" / "agents"
WORKFLOW_DIR = ROOT / ".github" / "workflows"

GROUPS = {
    1: ("The CEO Agent", "The switchboard. It carries directions down and carries "
                         "what needs a decision up, unchanged."),
    2: ("The engineering team", "The Lead Engineer, six engineers and three "
                                "read-only reviewers. Nothing reaches Micah "
                                "unreviewed."),
    3: ("Operations", "They run on a schedule with no laptop open, and report "
                      "through the 7 AM ops brief."),
    4: ("The assistants", "They draft, track and prepare. None of them sends, "
                          "signs or publishes anything."),
}

# One colour per group, from the brand palette already in design.py.
GROUP_COLOUR = {1: "#2A78D6", 2: "#7A4A2E", 3: "#1BAF7A", 4: "#6E655C"}


def never_allowed(name):
    """The agent's own never-allowed list, from its own file."""
    path = AGENT_DIR / (name + ".md")
    if not path.is_file():
        return []
    text = path.read_text()
    m = re.search(r"^##+ Never allowed\s*$(.*?)(?=^##+ |\Z)", text, re.M | re.S)
    if not m:
        return []
    # A numbered item CONTINUES onto the next line, and the first version of
    # this took only the first line. The result read "Never touch
    # public/assets/wordmark*, a legal page, or a migration that" and stopped,
    # which is a worse sentence than no sentence: it is a rule that appears to
    # end where it does not.
    items = []
    for raw in m.group(1).strip().splitlines():
        line = raw.rstrip()
        if re.match(r"^\s*\d+\.", line):
            items.append(re.sub(r"^\s*\d+\.\s*", "", line).strip())
        elif line.strip() and items:
            items[-1] += " " + line.strip()

    out = []
    for item in items:
        # Backticks FIRST. `public/assets/wordmark*` carries an asterisk, and
        # stripping bold before the code span let that asterisk pair with a
        # real ** and eat half the sentence.
        item = re.sub(r"`([^`]*)`", r"\1", item)
        item = item.replace("**", "")
        out.append(re.sub(r"\s+", " ", item).strip())
    return out


def status_of(agent):
    """
    What is TRUE about this agent, read off the filesystem.

    Returns (label, colour, detail).
    """
    name = agent["name"]
    has_file = (AGENT_DIR / (name + ".md")).is_file()
    has_workflow = ((WORKFLOW_DIR / f"{name}.yml").is_file()
                    or (WORKFLOW_DIR / f"{name}.yaml").is_file())
    schedule = agent.get("schedule", "session")
    meant = bool(agent.get("meant_to_be_on"))

    if not has_file:
        return ("NOT BUILT", "#9C603C", "No file in .claude/agents.")
    if not meant:
        return ("OFF", "#6E655C",
                "Off because " + agent.get("off_because", "it is not switched on") +
                ". " + agent.get("switch", ""))
    if schedule == "session":
        return ("ON", "#1BAF7A", "Runs in sessions Micah starts.")
    if schedule in ("continuous", "on every change"):
        return ("ON", "#1BAF7A", "Runs " + schedule + ".")
    if has_workflow:
        return ("ON", "#1BAF7A", "Scheduled: " + schedule + ".")
    return ("WRITTEN, NOT SCHEDULED", "#9C603C",
            "Meant to run " + schedule + ", but no workflow file exists yet.")


def esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


CSS = B.CSS + """
/* The footer mark sits in a page margin box and the page margin is 0, so it
   renders over the bottom of the body. Every other document stops well short
   of the foot; this one has a long table that ran straight into it. Extra
   bottom padding on every page is the fix, not moving the mark. */
.page{padding-bottom:30mm}
.band{height:3mm;border-radius:2mm;margin:0 0 6mm}
.ag{border-top:.4pt solid #E4DED2;padding:3.2mm 0;page-break-inside:avoid}
.ag:first-of-type{border-top:0}
.ag .hd{display:flex;justify-content:space-between;align-items:baseline;gap:4mm}
.ag b{font-family:'Michroma';font-size:7.6pt;letter-spacing:.04em;color:#1A1714}
.ag .st{font-family:'Michroma';font-size:5.8pt;letter-spacing:.12em;white-space:nowrap}
.ag .job{margin:1.2mm 0 1.4mm;font-size:9.2pt;line-height:1.42}
.ag .det{font-size:8pt;color:#6E655C;margin:0 0 1.4mm}
.ag .nv{font-size:8.2pt;color:#6E655C;margin:0;padding-left:4mm;border-left:2px solid #7A4A2E}
.ag .nv i{font-style:normal;font-family:'Michroma';font-size:5.6pt;letter-spacing:.1em;
  display:block;margin-bottom:.8mm;color:#7A4A2E}
.tot{font-family:'Michroma';font-size:6.4pt;letter-spacing:.14em;color:#6E655C;margin-top:5mm}
.sum{width:100%;border-collapse:collapse;margin-top:3mm;font-size:9pt}
.sum th{font-family:'Michroma';font-size:6pt;letter-spacing:.12em;text-transform:uppercase;
  text-align:left;color:#6E655C;border-bottom:.4pt solid #E4DED2;padding:1.6mm 2mm}
.sum td{padding:1.6mm 2mm;border-bottom:.4pt solid #F0EAE0;vertical-align:top}
"""


def agents_doc():
    roster = json.loads(ROSTER.read_text())
    agents = roster["agents"]

    # Count what is true, so the cover can say it without anybody typing it.
    counts = {}
    for a in agents:
        label = status_of(a)[0]
        counts[label] = counts.get(label, 0) + 1
    tally = ", ".join(f"{v} {k.lower()}" for k, v in sorted(counts.items()))

    pages = []
    for gid in sorted(GROUPS):
        members = [a for a in agents if a.get("group") == gid]
        if not members:
            continue
        title, blurb = GROUPS[gid]
        colour = GROUP_COLOUR[gid]
        rows = []
        for a in sorted(members, key=lambda x: x["name"]):
            label, scol, detail = status_of(a)
            never = never_allowed(a["name"]) or a.get("never", [])
            rows.append(f"""
<div class="ag">
  <div class="hd"><b>{esc(a.get('title', a['name']))}</b>
    <span class="st" style="color:{scol}">{esc(label)}</span></div>
  <p class="job">{esc(a.get('job', ''))}</p>
  <p class="det">{esc(detail.strip())}</p>
  <p class="nv"><i>NEVER ALLOWED</i>{esc('; '.join(never)) or 'Not recorded.'}</p>
</div>""")
        pages.append(f"""
<div class="page">
  <div class="band" style="background:{colour}"></div>
  <div class="kicker" style="color:{colour}">GROUP {gid}</div>
  <h1>{esc(title)}</h1>
  <p class="lede">{esc(blurb)}</p>
  {''.join(rows)}
  <p class="tot">{len(members)} AGENT(S) IN THIS GROUP</p>
</div>""")

    summary_rows = "".join(
        f"<tr><td>{esc(a.get('title', a['name']))}</td>"
        f"<td>{a.get('group')}</td>"
        f"<td style='color:{status_of(a)[1]}'>{esc(status_of(a)[0])}</td>"
        f"<td>{esc(a.get('schedule', ''))}</td></tr>"
        for a in sorted(agents, key=lambda x: (x.get("group", 9), x["name"])))

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>{CSS}</style></head><body>

{D.footer_mark()}

<div class="page cover">
  {D.mark(D.WORDMARK_DARK, 82)}
  <div class="rule"></div>
  <div class="t">EVERY AGENT</div>
  <div class="s">WHO DOES WHAT, AND WHAT NONE OF THEM MAY DO</div>
  <div class="tag">{len(agents)} agents in four groups. {esc(tally)}.</div>
</div>

<div class="page">
  <div class="kicker">HOW TO READ THIS</div>
  <h1>The status is read from the repository</h1>
  <p class="lede">Nothing on these pages was typed by hand. Every status below was
  worked out by looking for the agent's file and its workflow, so this document
  cannot claim an agent that was never built.</p>
  <p><b>ON</b> means the file exists and the agent is meant to be running.
  <b>WRITTEN, NOT SCHEDULED</b> means the file exists and the thing that would run
  it does not. <b>OFF</b> means it is deliberately switched off, and the reason is
  printed beside it. <b>NOT BUILT</b> means the roster names it and no file exists.</p>
  <p>The never-allowed list under each agent is read from that agent's own file,
  not from a summary, because the file is what the agent is actually holding.</p>
  <div class="rule" style="margin-top:6mm">Every one of these answers to Micah
  Pittman, directly or through the CEO Agent. None of them can change the canon,
  move money, change access, publish a word a member reads, or send anything on
  its own.</div>
  <h2 style="margin-top:8mm">All {len(agents)} at a glance</h2>
  <table class="sum">
    <thead><tr><th>Agent</th><th>Group</th><th>Status</th><th>Runs</th></tr></thead>
    <tbody>{summary_rows}</tbody>
  </table>
</div>

{''.join(pages)}

<div class="page">
  <div class="kicker">WHAT STAYS WITH A PERSON</div>
  <h1>Not delegated, to anything</h1>
  <p class="lede">Supabase owner access, the Cloudflare account, Stripe once it is
  live, the domain registrar, Resend, GitHub owner access, the bank, the Zoom host
  seat, the book and the canonical positions.</p>
  <p>Every canon approval. Every change to words a member reads. Every physician
  referral decision. Micah, with two factor login, using steps the agents prepare.</p>
  <div class="rule" style="margin-top:6mm">The protected paths are enforced by a
  hook and not by good behaviour: docs, the corpus, the two parked payments files,
  the four legal pages, the mark assets, any migration that has already run, and
  the secrets file. A read-only agent may write nothing at all except its own run
  report.</div>
  <p class="small" style="margin-top:6mm">{D.PROGRAM_NAME_TM} is an educational
  wellness program, not medical treatment. It does not diagnose or treat any
  condition.</p>
</div>

</body></html>"""

    path = f"{B.OUT}/HBP-Every-Agent.pdf"
    HTML(string=html, base_url=B.BASE_URL).write_pdf(path)
    return path


if __name__ == "__main__":
    if "--status" in sys.argv:
        roster = json.loads(ROSTER.read_text())
        for a in sorted(roster["agents"], key=lambda x: (x.get("group", 9), x["name"])):
            label, _c, detail = status_of(a)
            print("  %-24s group %s  %-22s %s"
                  % (a["name"], a.get("group"), label, detail.strip()[:60]))
        sys.exit(0)
    print(agents_doc())
