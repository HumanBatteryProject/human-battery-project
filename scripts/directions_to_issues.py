#!/usr/bin/env python3
"""Turn a line of agents/DIRECTIONS.md into a GitHub issue for one agent.

    python3 scripts/directions_to_issues.py --list
    python3 scripts/directions_to_issues.py --line 1 --agent canon-engineer --dry-run
    python3 scripts/directions_to_issues.py --line 1 --agent canon-engineer
    python3 scripts/directions_to_issues.py --seed

WHY THIS IS A SCRIPT AND NOT PROSE IN THE CEO AGENT'S FILE.

The CEO Agent has exactly one judgement to make about a direction: which agent
owns it. Everything after that is mechanical, and two parts of it are
load-bearing:

  - the direction reaches the issue WORD FOR WORD. The one instruction the CEO
    Agent is most likely to drift on is "never rewrite his words", because
    every other instruction it has pushes toward being tidy and short. A model
    that retypes a sentence will improve it. This script copies it.
  - the agent's NEVER-ALLOWED LIST is quoted into the issue, from that agent's
    own file, so the limits travel with the work and cannot be summarised into
    something softer on the way.

So the judgement stays with the model and the copying does not. The CEO Agent
calls this; it does not reimplement it.

The line is then moved to agents/DIRECTIONS-done.md with the issue number, so a
direction cannot be raised twice and cannot be silently dropped.
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRECTIONS = os.path.join(ROOT, "agents", "DIRECTIONS.md")
DONE = os.path.join(ROOT, "agents", "DIRECTIONS-done.md")
AGENTS = os.path.join(ROOT, ".claude", "agents")


def directions():
    """The open directions, as (index, text). Everything after the rule line."""
    with open(DIRECTIONS) as f:
        body = f.read()
    if "\n---\n" in body:
        body = body.split("\n---\n", 1)[1]
    out = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.append((len(out) + 1, line))
    return out


def never_allowed(agent):
    """
    The agent's never-allowed list, quoted from its own file.

    Read from the file and never from roster.json, because the file is what the
    agent itself is given. If the two ever disagree, the issue has to carry the
    one the agent is actually holding.
    """
    path = os.path.join(AGENTS, agent + ".md")
    if not os.path.isfile(path):
        raise SystemExit("no such agent: %s (looked in %s)" % (agent, AGENTS))
    with open(path) as f:
        text = f.read()
    m = re.search(r"^##+ Never allowed\s*$(.*?)(?=^##+ |\Z)", text,
                  re.M | re.S)
    if not m:
        raise SystemExit("%s has no 'Never allowed' section. Every agent file "
                         "must carry one; that is the point of the file."
                         % os.path.relpath(path, ROOT))
    items = [ln.rstrip() for ln in m.group(1).strip().splitlines() if ln.strip()]
    if not items:
        raise SystemExit("%s has an EMPTY 'Never allowed' section." % agent)
    return "\n".join(items)


def issue_body(text, agent, index):
    return (
        "## The direction, as Micah wrote it\n\n"
        "> %s\n\n"
        "Copied word for word from `agents/DIRECTIONS.md`, line %d. "
        "Nothing in it has been reworded.\n\n"
        "## What %s may never do\n\n"
        "Quoted from `.claude/agents/%s.md`. These travel with the work.\n\n"
        "%s\n\n"
        "## The chain\n\n"
        "Report to the `lead-engineer`, never to Micah directly. The Lead runs "
        "the reviewers and the gate and opens the pull request. "
        "**Micah merges.** Nothing here is approved by anyone else.\n"
        % (text, index, agent, agent, never_allowed(agent))
    )


def gh(args, check=True):
    p = subprocess.run(["gh"] + args, capture_output=True, text=True, cwd=ROOT)
    if check and p.returncode != 0:
        raise SystemExit("gh %s failed:\n%s" % (" ".join(args), p.stderr.strip()))
    return p.stdout.strip()


def move_to_done(index, text, agent, number, date):
    with open(DIRECTIONS) as f:
        body = f.read()
    # Remove exactly the line, matched on its own text, not on its position.
    lines = body.splitlines(True)
    for i, raw in enumerate(lines):
        if raw.strip() == text:
            del lines[i]
            break
    else:
        raise SystemExit("the line was not found to remove; nothing was moved")
    with open(DIRECTIONS, "w") as f:
        f.write("".join(lines))

    row = "| %s | %s | %s | #%s |\n" % (date, text.replace("|", "\\|"), agent, number)
    with open(DONE, "a") as f:
        f.write(row)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--line", type=int)
    ap.add_argument("--agent")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--seed", action="store_true")
    a = ap.parse_args()

    if a.seed:
        return seed()

    open_ = directions()
    if a.list or not a.line:
        if not open_:
            print("  no open directions")
            return 0
        print("  %d open direction(s):" % len(open_))
        for i, t in open_:
            print("    %d. %s" % (i, t))
        return 0

    if not a.agent:
        raise SystemExit("--agent is required with --line. The CEO Agent "
                         "decides which agent owns the line; this script does "
                         "not guess.")
    match = [t for i, t in open_ if i == a.line]
    if not match:
        raise SystemExit("no open direction at line %d" % a.line)
    text = match[0]
    body = issue_body(text, a.agent, a.line)
    title = text if len(text) <= 70 else text[:67] + "..."

    if a.dry_run:
        print("  would open an issue titled:\n    %s\n" % title)
        print("  with this body:\n")
        print("\n".join("    " + ln for ln in body.splitlines()))
        return 0

    date = subprocess.run(["date", "+%Y-%m-%d"], capture_output=True,
                          text=True).stdout.strip()
    # The label IS the assignment: an issue with no label is an issue with no
    # owner. Created if missing rather than failing the run, because a missing
    # label is a repository setting and not a reason to drop a direction.
    gh(["label", "create", a.agent, "--description",
        "Owned by the %s agent" % a.agent, "--color", "5E3823", "--force"],
       check=False)
    url = gh(["issue", "create", "--title", title, "--body", body,
              "--label", a.agent])
    number = url.rstrip("/").split("/")[-1]
    move_to_done(a.line, text, a.agent, number, date)
    print("  issue #%s opened for %s and the line moved to DIRECTIONS-done.md"
          % (number, a.agent))
    print("  %s" % url)
    return 0


def seed():
    """
    Prove the two things that matter, without touching GitHub.

    The direction reaches the body unchanged, and the never-allowed list is
    really quoted from the agent's own file rather than invented here.
    """
    print("  directions_to_issues --seed\n")
    line = ("Make the coach say which evidence tier it is standing on, every "
            "time, even when the answer is hypothesis.")
    bad = 0

    body = issue_body(line, "canon-engineer", 1)
    verbatim = ("> " + line) in body
    print("    %-10s the direction appears word for word in the issue body"
          % ("ok" if verbatim else "FAILED"))
    bad += 0 if verbatim else 1

    nv = never_allowed("canon-engineer")
    in_body = nv.splitlines()[0] in body
    print("    %-10s the never-allowed list is quoted from the agent's own file"
          % ("ok" if in_body else "FAILED"))
    bad += 0 if in_body else 1

    every = []
    for fn in sorted(os.listdir(AGENTS)):
        if not fn.endswith(".md"):
            continue
        name = fn[:-3]
        try:
            never_allowed(name)
            every.append((name, True))
        except SystemExit:
            every.append((name, False))
    missing = [n for n, ok in every if not ok]
    print("    %-10s every agent file carries a never-allowed section (%d of %d)"
          % ("ok" if not missing else "FAILED",
             sum(1 for _n, ok in every if ok), len(every)))
    if missing:
        print("               missing in: %s" % ", ".join(missing))
    bad += len(missing)

    print()
    if bad:
        print("  %d check(s) failed." % bad)
        return 1
    print("  the copying is mechanical and the limits travel with the work.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
