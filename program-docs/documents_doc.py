"""Every word a member reads that has not had legal eyes on it, in one document.

Built from the LIVE system. The consent bodies come from consent_documents, the
screening table and the safety replies from the modules that actually serve them,
so nothing here is a copy that can drift from what a member is shown.

Each document carries its version, whether it is required, and the sha256 of the
body that is stored. That hash is what makes an approval mean something: it fixes
exactly which words were approved, so a later edit is visibly a different
document rather than a quiet substitution.
"""
import html, os, re, subprocess, sys
from datetime import date
from weasyprint import HTML

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "public", "fonts")
INK, MUTED, RULE, COPPER, AMBER = "#1A1714", "#6E655C", "#E4DED2", "#7A4A2E", "#B0741F"
NAVY, PAPER, RED = "#0E1424", "#FBF9F5", "#A32E22"

def q(sql):
    out = subprocess.run(["psql", os.environ["SUPABASE_DB_URL"], "-At", "-F", "\x1f", "-c", sql],
                         capture_output=True, text=True)
    if out.returncode != 0:
        print("QUERY FAILED:", out.stderr.strip()[:300], file=sys.stderr); sys.exit(1)
    return [l.split("\x1f") for l in out.stdout.strip().split("\n") if l.strip()]

def node(expr):
    """Read a value out of the module that actually serves it, rather than a copy."""
    out = subprocess.run(["node", "-e", expr], capture_output=True, text=True, cwd=ROOT)
    if out.returncode != 0:
        print("NODE FAILED:", out.stderr.strip()[:300], file=sys.stderr); sys.exit(1)
    return out.stdout

e = lambda s: html.escape(str(s or ""))

def yes(v):
    """True for every shape psql returns for a boolean. `::text` gives "true",
    an uncast boolean column gives "t", and picking the wrong one inverts the
    sentence rather than failing."""
    return str(v).strip().lower() in ("t", "true", "yes", "on", "1")
TODAY = date.today().isoformat()

# The consent documents. Fetched ONE AT A TIME because every body contains blank
# lines, and splitting a multi row result on the newline tears each document into
# fragments. The first version did exactly that and unpacked four fields where
# eight were expected, which is the good failure: a silent one would have printed
# a document made of pieces of other documents.
order = q("""select kind from consent_documents where retired_at is null
  order by case kind when 'participation' then 1 when 'uploads' then 2
                     when 'terms' then 3 when 'privacy' then 4 else 5 end""")
docs = []
for (kind,) in order:
    meta = q(f"""select version, title, is_required::text, effective_from::date::text,
           body_sha256, (body_sha256 = encode(sha256(body::bytea),'hex'))::text
      from consent_documents where kind = '{kind}' and retired_at is null""")[0]
    body = subprocess.run(
        ["psql", os.environ["SUPABASE_DB_URL"], "-At", "-c",
         f"select body from consent_documents where kind = '{kind}' and retired_at is null"],
        capture_output=True, text=True).stdout
    version, title, required, eff, sha, hash_ok = meta
    docs.append((kind, version, title, body, required, eff, sha, hash_ok))

screening = node("""import('./functions/api/_medical.js').then(m=>{
  console.log(m.SCREENING_ROWS.map(r=>r.on+'\\x1f'+r.flag).join('\\n'));
  console.log('\\x1e'+m.URGENT_REPLY);
  console.log('\\x1e'+m.prescriberReply([]));});""")
parts = screening.split("\x1e")
screen_rows = [l.split("\x1f") for l in parts[0].strip().split("\n") if "\x1f" in l]
urgent = parts[1].strip()
prescriber = parts[2].strip()

evidence = node("""import('./functions/api/_evidence.js').then(m=>{
  console.log(m.SCORE_DISCLAIMER);
  console.log('\\x1e'+Object.entries(m.TIER_WORDING).map(([k,v])=>k+'\\x1f'+v).join('\\n'));});""")
disclaimer = evidence.split("\x1e")[0].strip()
tiers = [l.split("\x1f") for l in evidence.split("\x1e")[1].strip().split("\n") if "\x1f" in l]

def body_html(text, title=""):
    """Render a consent body as written.

    Two heading styles exist in these five documents and both have to survive.
    The two new ones SHOUT their headings and put the paragraph on the very next
    line. The three older ones use Title Case headings separated by blank lines,
    and also carry bullet lists whose items start with a dash, which a naive
    "short line is a heading" rule would promote into headings.

    Nothing is reworded or reordered. Reformatting a document somebody is about
    to approve would mean approving something they did not read.
    """
    out, bullets = [], []

    def flush():
        if bullets:
            out.append("<ul>" + "".join(f"<li>{e(b)}</li>" for b in bullets) + "</ul>")
            bullets.clear()

    for block in re.split(r"\n\s*\n", text.strip()):
        b = block.strip()
        if not b:
            continue
        # The stored body repeats its own title as the first line. The page
        # already carries it as the heading.
        if title and b.strip().lower() == title.strip().lower():
            continue
        if b.startswith("-"):
            flush_needed = False
            for line in b.split("\n"):
                line = line.strip()
                if line.startswith("-"):
                    bullets.append(line.lstrip("- ").strip())
                elif line:
                    bullets.append(line)
            continue
        flush()
        lines = [l.strip() for l in b.split("\n") if l.strip()]
        head = lines[0]
        shouted = head.isupper() and len(head) < 70
        titled = (len(head) < 60 and not head.endswith(".")
                  and not head.endswith(":") and len(lines) == 1)
        if shouted or titled:
            out.append(f'<p class="sec">{e(head)}</p>')
            rest = " ".join(lines[1:]).strip()
            if rest:
                out.append("<p>" + e(rest) + "</p>")
        else:
            out.append("<p>" + e(" ".join(lines)) + "</p>")
    flush()
    return "".join(out)

CSS = f"""
@font-face{{font-family:'Michroma';src:url('michroma.woff2') format('woff2')}}
@font-face{{font-family:'Newsreader';src:url('newsreader.woff2') format('woff2');font-weight:200 800}}
@page{{size:letter;margin:0;
  @bottom-center{{content:counter(page);font-family:'Newsreader';font-size:8pt;color:{MUTED};margin-bottom:11mm}}}}
@page cover{{size:letter;margin:0;@bottom-center{{content:none}}}}
*{{box-sizing:border-box}}
body{{margin:0;font-family:'Newsreader';color:{INK};background:{PAPER};font-size:10pt;line-height:1.58}}
.page{{width:215.9mm;min-height:279.4mm;padding:20mm 22mm 22mm;page-break-after:always}}
.page:last-child{{page-break-after:auto}}
.cover{{page:cover;background:{NAVY};color:#F6F1E7;display:flex;flex-direction:column;
  justify-content:space-between;width:215.9mm;height:279.4mm;padding:24mm 20mm;margin:0}}
.cover .s{{font-family:'Michroma';font-size:7.4pt;letter-spacing:.24em;color:{COPPER}}}
.cover h1{{font-family:'Michroma';font-size:19pt;line-height:1.3;margin:6mm 0 0;color:#F6F1E7;font-weight:400}}
.cover .d{{font-size:11.5pt;color:#A8A096;margin-top:6mm;max-width:132mm;line-height:1.5}}
.cover .meta{{font-family:'Michroma';font-size:6.6pt;letter-spacing:.14em;color:#A8A096;line-height:2}}
h1{{font-family:'Michroma';font-size:12.5pt;font-weight:400;margin:0 0 2mm;line-height:1.3}}
h2{{font-family:'Michroma';font-size:8.2pt;font-weight:400;letter-spacing:.1em;text-transform:uppercase;
  margin:8mm 0 3mm;padding-bottom:1.6mm;border-bottom:.4pt solid {RULE}}}
.kicker{{font-family:'Michroma';font-size:6.2pt;letter-spacing:.22em;color:{MUTED};margin:0 0 3mm}}
p{{margin:0 0 3mm}}
.sec{{font-family:'Michroma';font-size:6.8pt;letter-spacing:.12em;color:{COPPER};
  margin:5mm 0 2mm;page-break-after:avoid}}
.tiny{{font-size:8.2pt;line-height:1.45;color:{MUTED}}}
.lead{{font-size:10.6pt;color:{INK};margin-bottom:5mm}}
.stamp{{border:.4pt solid {RULE};border-radius:1.4mm;padding:3mm 4mm;margin:0 0 5mm;
  font-size:8.2pt;line-height:1.6;color:{MUTED};page-break-inside:avoid}}
.stamp b{{color:{INK};font-family:'Michroma';font-size:6.2pt;letter-spacing:.06em}}
.stamp .hash{{font-family:'Michroma';font-size:5.6pt;letter-spacing:.04em;word-break:break-all;color:{MUTED}}}
.unreviewed{{color:{AMBER}}}
.box{{border:.4pt solid {RULE};border-left:2.4mm solid {COPPER};border-radius:1.4mm;
  padding:3.4mm 4mm;margin:3mm 0;page-break-inside:avoid}}
.box.warn{{border-left-color:{AMBER}}}
.box.gap{{border-left-color:{RED}}}
.box h3{{font-family:'Michroma';font-size:7.2pt;font-weight:400;letter-spacing:.05em;margin:0 0 1.8mm}}
.box p{{margin:0 0 1.4mm;font-size:9pt;line-height:1.48}}
.box p:last-child{{margin-bottom:0}}
table{{width:100%;border-collapse:collapse;margin:2.5mm 0 4mm;font-size:8.8pt}}
th{{font-family:'Michroma';font-size:6.1pt;letter-spacing:.06em;color:{MUTED};text-align:left;
  padding:0 3mm 1.6mm 0;border-bottom:.4pt solid {RULE};vertical-align:bottom}}
td{{padding:2mm 3mm 2mm 0;border-bottom:.35pt solid {RULE};vertical-align:top;line-height:1.45}}
tr{{page-break-inside:avoid}}
.quote{{border-left:1.6pt solid {RULE};padding-left:4mm;margin:2mm 0 4mm;font-size:9.6pt;line-height:1.55}}
.sign{{border-top:.4pt solid {RULE};margin-top:6mm;padding-top:3.5mm;display:flex;gap:6mm;
  page-break-inside:avoid}}
.sign div{{flex:1}}
.sign .line{{border-bottom:.4pt solid {MUTED};height:9mm}}
.sign .lab{{font-family:'Michroma';font-size:5.9pt;letter-spacing:.08em;color:{MUTED};margin-top:1.4mm}}
ul{{margin:0 0 3mm;padding-left:5mm}} li{{margin-bottom:1.6mm;line-height:1.48}}
"""

def sign_block(what):
    return (f'<div class="sign"><div><div class="line"></div>'
            f'<div class="lab">APPROVED, {e(what)}</div></div>'
            f'<div><div class="line"></div><div class="lab">DATE</div></div></div>')

pages = []
for (kind, version, title, body, required, eff, sha, hash_ok) in docs:
    unreviewed = "unreviewed" in version
    pages.append(f"""<div class="page">
  <p class="kicker">DOCUMENT {e(kind).upper().replace('_',' ')}</p>
  <h1>{e(title)}</h1>
  <div class="stamp">
    <b>VERSION</b> {e(version)}
    {'<span class="unreviewed">, which says on its face that no lawyer has read it</span>' if unreviewed else ''}<br>
    <b>REQUIRED</b> {'yes, nobody can start without agreeing to it' if yes(required) else 'no, a member can decline it and still take part'}<br>
    <b>IN FORCE FROM</b> {e(eff)}<br>
    <b>SHA256 OF THE TEXT BELOW</b> <span class="hash">{e(sha)}</span><br>
    <b>MATCHES WHAT IS STORED</b> {'yes' if yes(hash_ok) else 'NO, THE STORED HASH DOES NOT MATCH THE STORED TEXT'}
  </div>
  {body_html(body, title)}
  {sign_block(kind)}
</div>""")

screen_rows_html = "".join(
    f"<tr><td><b>{e(a)}</b></td><td>{e(b)}</td></tr>" for a, b in screen_rows)
tier_rows = "".join(f"<tr><td>{e(k)}</td><td>{e(v)}</td></tr>" for k, v in tiers)

DOC = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>{CSS}</style></head><body>

<div class="page cover">
  <div><div class="s">THE HUMAN BATTERY PROJECT</div>
  <h1>Every word a member<br>has to agree to</h1>
  <div class="d">The five consent documents in full, the medication screening
  table, and the sentences the software says when something is wrong. Read from
  the live system, not from notes. Nothing here has had legal review.</div></div>
  <div class="meta">BUILT {e(TODAY)}<br>{len(docs)} DOCUMENTS<br>NONE LEGALLY REVIEWED</div>
</div>

<div class="page">
  <p class="kicker">BEFORE YOU START</p>
  <h1>What this is, and what to do with it</h1>
  <p class="lead">Everything in here is text a member reads and, in most cases,
  has to agree to before they can use the program. None of it has been seen by a
  lawyer. That is the single largest thing standing between this and taking money
  from a stranger.</p>

  <div class="box warn">
    <h3>Two of the five say so on their face</h3>
    <p>The participation consent and the uploads consent are versioned
    <b>v1-unreviewed</b> on purpose. When reviewed wording arrives they become v2
    and every member is asked again, rather than the words changing underneath a
    signature that was already given.</p>
    <p>The other three, terms, privacy and consumer health data, are versioned v1
    and are live on the site now. They have not been reviewed either. The version
    number does not say so, and it should.</p>
  </div>

  <div class="box">
    <h3>Why each one carries a hash</h3>
    <p>The sha256 under each title is of the exact text on that page. Approving a
    document means approving those words, and a later edit produces a different
    hash, so a quiet substitution is visible rather than invisible.</p>
  </div>

  <div class="box gap">
    <h3>What is missing, and cannot be approved because it does not exist</h3>
    <p><b>A refund and cancellation policy.</b> The terms page carries three
    sentences about refunds during the ninety days. There is nothing at all about
    cancelling the continuing membership, what happens to access when somebody
    cancels, or how a failed payment is handled in words a member reads. The
    mechanisms are built and tested; the words are not written.</p>
    <p><b>A subscription consent.</b> D9 requires explicit consent to a recurring
    charge, showing the price, the effective date and the renewal date. It is not
    written.</p>
  </div>

  <div class="box">
    <h3>What to do</h3>
    <p>Read each document. Sign the block at its end if the words are right, or
    mark them up if they are not. Then send the whole thing to a lawyer in your
    jurisdiction, along with the question of whether a wellness program holding
    laboratory results needs anything these do not have.</p>
  </div>
</div>

<div class="page">
  <p class="kicker">READ THIS BEFORE THE DOCUMENTS</p>
  <h1>Six sentences that are now wrong</h1>
  <p class="lead">These are in the stored consent text, which is what a member
  legally agrees to. They were true when written and were overtaken by later
  decisions. The public pages on the site were updated; these were not, and that
  is a miss rather than a difference of opinion.</p>

  <div class="box gap">
    <h3>Terms of service, the program and payment</h3>
    <p>Says: <i>"Cohorts run for ninety days with thirty participants, all
    starting on the same date and following the same protocol."</i></p>
    <p>There are no cohorts. Every participant is an N of 1, there is no group
    size, and people start individually on the 1st or the 15th.</p>
  </div>

  <div class="box gap">
    <h3>Terms of service, the payment schedule</h3>
    <p>Says: <i>"in two payments of $500 at enrollment and at day thirty, or in
    three payments of approximately $333 at enrollment, day thirty and day
    sixty."</i></p>
    <p>Both schedules are wrong and the amounts are not approximate. Two payments
    fall on Day 1 and Day 45. Three fall on Day 1, Day 31 and Day 61, at $333.33,
    $333.33 and $333.34, which is what the software will actually charge.</p>
  </div>

  <div class="box gap">
    <h3>Terms of service, refunds and materials</h3>
    <p>Says: <i>"no refund, because the cohort seat, the panel, and the coaching
    schedule are committed"</i> and <i>"Do not share program materials outside
    your cohort."</i></p>
    <p>There is no seat and no cohort to be outside of.</p>
  </div>

  <div class="box gap">
    <h3>Privacy policy, why we collect it</h3>
    <p>Says: <i>"To send you cohort dates, the protocol, and the blood panel."</i></p>
    <p>A participant has a start date, not a cohort date.</p>
  </div>

  <div class="box">
    <h3>What I have not done, and why</h3>
    <p>I have not edited these. Changing what a member agrees to is your decision,
    and the version discipline says a change makes it v2 with a new hash, not a
    quiet correction to v1.</p>
    <p>The cost of fixing it is currently near zero. Four of the five have been
    agreed to exactly once, by the internal test account, during a test of the
    consent flow. No real participant has agreed to anything. That stops being
    true the day somebody enrolls.</p>
  </div>
</div>

{''.join(pages)}

<div class="page">
  <p class="kicker">NOT A CONSENT, BUT A MEMBER READS IT</p>
  <h1>The medication screening table</h1>
  <p class="lead">These eight rows are the only thing standing between an approved
  action and a participant it is unsafe for. A member who reports one of these has
  the affected actions withheld automatically, and is shown the wording in the
  right hand column.</p>
  <table><tr><th>If they report</th><th>What is withheld, and what they are told</th></tr>
  {screen_rows_html}</table>
  <p class="tiny">This table lives in two places on purpose: in the protocol
  document a member is given, and in the code, so that the boundary still works
  when the database is unreachable. A check compares the two and fails the build
  if they drift.</p>
  {sign_block("screening table")}
</div>

<div class="page">
  <p class="kicker">WHAT THE SOFTWARE SAYS WHEN SOMETHING IS WRONG</p>
  <h1>Three sentences that matter more than the rest</h1>
  <p class="lead">These are not in any consent document and no lawyer has seen
  them. They are what a member reads at the worst moment, and they are the place
  where a wrong word does the most damage.</p>

  <h2>When somebody describes an emergency</h2>
  <div class="quote">{e(urgent)}</div>
  <p class="tiny">The last two sentences were added deliberately. Telling somebody
  to seek care, without them, reads as though writing it here counts as raising it
  with someone. It does not.</p>

  <h2>When somebody asks the coach to practise medicine</h2>
  <div class="quote">{e(prescriber)}</div>
  <p class="tiny">This fires before retrieval, so the model never sees the
  question. A classifier cannot be argued out of it; a system prompt can.</p>

  <h2>Whenever the Score is shown or discussed</h2>
  <div class="quote">{e(disclaimer)}</div>
  <p class="tiny">Verbatim, visible, never a tooltip. Pinned by a test so it cannot
  be softened by accident.</p>

  <h2>How certainty is described to a member</h2>
  <table><tr><th>Internal tier</th><th>What a member reads</th></tr>{tier_rows}</table>
  <p class="tiny">A sixth tier, unsupported, has no wording at all, so it cannot
  reach a member even by accident.</p>

  {sign_block("safety wording")}
</div>

</body></html>"""

out = os.path.join(ROOT, "program-docs", "out", "HBP-Documents-For-Approval.pdf")
os.makedirs(os.path.dirname(out), exist_ok=True)
HTML(string=DOC, base_url=FONTS + os.sep).write_pdf(out)
print("  wrote", out)


# Verify, every build, that every word of every stored consent body actually
# reached the page. A document presented for approval that is quietly missing
# its last two sections is worse than no document, and "Limitation of liability"
# and "Governing law" are the first two clauses anybody would look for.
#
# The extraction has one trap, and it cost me a false alarm before it cost me a
# real one. Section headings carry letter-spacing, so pdftotext returns them one
# glyph at a time: "G o ve r n i n g l a w". Word-splitting that yields single
# letters, which get filtered as noise, and the checker then reports a heading
# missing from a document that renders it perfectly. So each word is looked for
# twice: as a word, and failing that, inside the page with every space removed.
# The second form is weaker, and it is a fallback rather than the rule.
def verify(out_path):
    """Compare the rendered page against what the DATABASE stores, not against
    the bodies this script happens to be holding.

    The distinction is the whole point. Checking against the in-memory bodies
    looks equivalent and is not: anything that shortens a body before it is
    rendered shortens the expectation with it, and the check passes on a
    truncated document. Proved by seeding exactly that, which the in-memory
    version reported as complete. The database is what a member agreed to, so
    the database is the thing the page has to match.

    Bodies are fetched one at a time because every one of them contains blank
    lines, which tears a multi-row result into fragments.

    One extraction trap, and it produced a false alarm before it produced a real
    one. Section headings carry letter-spacing, so pdftotext returns them a glyph
    at a time: "G o ve r n i n g l a w". Splitting that yields single letters,
    which get filtered as noise, and the checker then calls a heading missing
    from a document that renders it perfectly. So each word is looked for twice:
    as a word, and failing that, inside the page with every space removed. The
    second form is weaker and is a fallback, not the rule.
    """
    import re as _re
    txt = subprocess.run(["pdftotext", out_path, "-"],
                         capture_output=True, text=True, check=True).stdout.lower()
    on_page = set(w for w in _re.findall(r"[a-z]+", txt) if len(w) > 1)
    despaced = _re.sub(r"[^a-z]", "", txt)

    total = absent = 0
    for (kind,) in q("select kind::text from consent_documents "
                     "where retired_at is null order by kind"):
        stored = subprocess.run(
            ["psql", os.environ["SUPABASE_DB_URL"], "-At", "-c",
             "select body from consent_documents "
             "where retired_at is null and kind = '%s'" % kind],
            capture_output=True, text=True, check=True).stdout.lower()
        want = set(w for w in _re.findall(r"[a-z]+", stored) if len(w) > 1)
        gone = sorted(w for w in want if w not in on_page and w not in despaced)
        total += len(want); absent += len(gone)
        print("  %-14s %3d distinct words stored, %d absent from the page %s"
              % (kind, len(want), len(gone), gone[:5] if gone else ""))

    print("  %d distinct words checked against the database, %d absent" % (total, absent))
    if absent:
        raise SystemExit("  REFUSING TO SHIP: the rendered document is missing %d "
                         "word(s) of text somebody is being asked to approve." % absent)

verify(out)
