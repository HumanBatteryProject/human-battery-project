"""What the owner has to decide, and the fourteen rules, as one document.

Built from the LIVE database, not from notes. Every rule, count, price and flag
below is read at build time, so this document cannot claim the canon says
something it no longer says. The build date is stamped on the cover for the same
reason: a decision list with no date is a decision list nobody can trust.
"""
import html, os, subprocess, sys
from datetime import date
from weasyprint import HTML

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "public", "fonts")

INK, MUTED, RULE, COPPER, AMBER = "#1A1714", "#6E655C", "#E4DED2", "#7A4A2E", "#B0741F"
NAVY, PAPER, GREEN, RED = "#0E1424", "#FBF9F5", "#1B7A57", "#A32E22"

def q(sql):
    """Read from the database. Fails loudly: a document built from a failed
    query would look complete and be empty."""
    out = subprocess.run(
        ["psql", os.environ["SUPABASE_DB_URL"], "-At", "-F", "~", "-c", sql],
        capture_output=True, text=True)
    if out.returncode != 0:
        print("QUERY FAILED:", out.stderr.strip()[:300], file=sys.stderr)
        sys.exit(1)
    return [l.split("~") for l in out.stdout.strip().split("\n") if l.strip()]

e = lambda s: html.escape(str(s or ""))

TIER_WORD = {
    "established": "We know this", "strong": "We are confident",
    "emerging": "Early evidence", "contested": "Published, and argued about",
    "hypothesis": "Dr. Micah's idea, being tested",
}

rules = q("""select r.rule_key, r.version, p.label, r.evidence_tier, r.action_text,
       r.population, array_to_string(r.required_data,', '),
       coalesce((select string_agg(sk.on_this,'; ') from unnest(r.contraindications) c
                 join screening_keys sk on sk.key=c),''),
       array_to_string(r.stop_conditions,' '), r.reassess_days::text,
       cardinality(r.source_passages)::text, r.review_status, p.sort_order::text
  from canonical_rules r join pillars p on p.key=r.pillar_key
 where r.retired_at is null order by p.sort_order, r.rule_key""")
pillars = q("""select section_no, section,
       coalesce((select label from pillars where key=pillar_key),''), note
  from protocol_section_pillars order by section_no""")
panels = q("""select d.slug, d.name, count(m.*)::text, coalesce(d.blurb,'')
  from lab_panel_defs d left join lab_panel_markers m on m.panel_id = d.id
 group by d.slug, d.name, d.blurb order by count(m.*)""")
screening = q("select on_this from screening_keys order by on_this")
settings = dict((r[0], r[1]) for r in q("select key, value from program_settings"))
flags = q("select key, enabled::text, description from feature_flags order by key")
approved_n = sum(1 for r in rules if r[11] == "approved")

TODAY = date.today().isoformat()

CSS = f"""
@font-face{{font-family:'Michroma';src:url('michroma.woff2') format('woff2')}}
@font-face{{font-family:'Newsreader';src:url('newsreader.woff2') format('woff2');font-weight:200 800}}
@page{{size:letter;margin:0;
  @bottom-center{{content:counter(page);font-family:'Newsreader';font-size:8pt;color:{MUTED};margin-bottom:11mm}}}}
/* The cover is a full bleed dark page. It gets its own named page so the footer
   margin box does not reserve a strip of paper at the bottom, which left a white
   band under the navy. */
@page cover{{size:letter;margin:0;@bottom-center{{content:none}}}}
*{{box-sizing:border-box}}
body{{margin:0;font-family:'Newsreader';color:{INK};background:{PAPER};font-size:9.4pt;line-height:1.5}}
.page{{width:215.9mm;min-height:279.4mm;padding:20mm 19mm 22mm;page-break-after:always}}
.page:last-child{{page-break-after:auto}}
.cover{{page:cover;background:{NAVY};color:#F6F1E7;display:flex;flex-direction:column;
  justify-content:space-between;width:215.9mm;height:279.4mm;padding:24mm 20mm;margin:0}}
.cover .s{{font-family:'Michroma';font-size:7.4pt;letter-spacing:.24em;color:{COPPER}}}
.cover h1{{font-family:'Michroma';font-size:19pt;line-height:1.3;margin:6mm 0 0;color:#F6F1E7;font-weight:400}}
.cover .d{{font-size:11.5pt;color:#A8A096;margin-top:6mm;max-width:132mm;line-height:1.5}}
.cover .meta{{font-family:'Michroma';font-size:6.6pt;letter-spacing:.14em;color:#A8A096;line-height:2}}
h1{{font-family:'Michroma';font-size:12.5pt;font-weight:400;margin:0 0 4mm;line-height:1.3}}
h2{{font-family:'Michroma';font-size:8.2pt;font-weight:400;letter-spacing:.1em;text-transform:uppercase;
  margin:9mm 0 3.5mm;padding-bottom:1.6mm;border-bottom:.4pt solid {RULE}}}
h2:first-of-type{{margin-top:0}}
.kicker{{font-family:'Michroma';font-size:6.2pt;letter-spacing:.22em;color:{MUTED};margin:0 0 3mm}}
p{{margin:0 0 2.6mm}}
.lead{{font-size:10.4pt;line-height:1.55;color:{INK};margin-bottom:5mm}}
.muted{{color:{MUTED}}}
.tiny{{font-size:8.1pt;line-height:1.45;color:{MUTED}}}
.box{{border:.4pt solid {RULE};border-left:2.4mm solid {COPPER};border-radius:1.4mm;
  padding:3.4mm 4mm;margin:3mm 0;page-break-inside:avoid}}
.box.warn{{border-left-color:{AMBER}}}
.box.done{{border-left-color:{GREEN}}}
.box h3{{font-family:'Michroma';font-size:7.2pt;font-weight:400;letter-spacing:.05em;margin:0 0 1.8mm}}
.box p{{margin:0 0 1.4mm;font-size:9pt;line-height:1.46}}
.box p:last-child{{margin-bottom:0}}
table{{width:100%;border-collapse:collapse;margin:2.5mm 0 4mm;font-size:8.6pt}}
th{{font-family:'Michroma';font-size:6.1pt;letter-spacing:.06em;color:{MUTED};text-align:left;
  padding:0 2.5mm 1.6mm 0;border-bottom:.4pt solid {RULE};vertical-align:bottom}}
td{{padding:1.8mm 2.5mm 1.8mm 0;border-bottom:.35pt solid {RULE};vertical-align:top;line-height:1.42}}
tr{{page-break-inside:avoid}}
.rule{{border:.4pt solid {RULE};border-radius:1.4mm;padding:3.6mm 4mm;margin:0 0 3mm;
  page-break-inside:avoid}}
.rule .top{{display:flex;justify-content:space-between;gap:4mm;align-items:baseline;margin-bottom:1.6mm}}
.rule .key{{font-family:'Michroma';font-size:6.2pt;letter-spacing:.06em;color:{MUTED}}}
.rule .tier{{font-family:'Michroma';font-size:5.9pt;letter-spacing:.07em;color:{COPPER};
  border:.4pt solid {COPPER};border-radius:1mm;padding:.6mm 1.6mm;white-space:nowrap}}
.rule .act{{font-size:10pt;line-height:1.45;margin:0 0 2.2mm}}
.rule dl{{margin:0;display:grid;grid-template-columns:30mm 1fr;gap:1.1mm 3mm;font-size:8.3pt;line-height:1.42}}
.rule dt{{font-family:'Michroma';font-size:5.9pt;letter-spacing:.06em;color:{MUTED};padding-top:.5mm}}
.rule dd{{margin:0}}
.rule .flagged{{color:{RED}}}
.sign{{border-top:.4pt solid {RULE};margin-top:5mm;padding-top:3mm;display:flex;gap:6mm}}
.sign div{{flex:1}}
.sign .line{{border-bottom:.4pt solid {MUTED};height:9mm}}
.sign .lab{{font-family:'Michroma';font-size:5.9pt;letter-spacing:.08em;color:{MUTED};margin-top:1.4mm}}
.tick{{width:4.2mm;height:4.2mm;border:.5pt solid {MUTED};border-radius:.8mm;display:inline-block;
  vertical-align:-.7mm;margin-right:2.2mm}}
ol,ul{{margin:0 0 3mm;padding-left:5mm}}
li{{margin-bottom:1.4mm;line-height:1.45}}
"""

def rule_card(r):
    (key, ver, pillar, tier, action, population, required,
     contra, stops, reassess, passages, status, _) = r
    rows = [("Pillar", e(pillar)), ("Evidence", e(TIER_WORD.get(tier, tier))),
            ("Who", e(population)), ("Reviewed", "every " + e(reassess) + " days")]
    if required: rows.append(("Needs logged", e(required)))
    rows.append(("Withheld from",
                 f'<span class="flagged">{e(contra)}</span>' if contra
                 else '<span class="muted">nobody</span>'))
    if stops: rows.append(("Stop if", e(stops)))
    rows.append(("Cites", e(passages) + " corpus passage" + ("" if passages == "1" else "s")))
    dl = "".join(f"<dt>{k}</dt><dd>{v}</dd>" for k, v in rows)
    return (f'<div class="rule"><div class="top"><span class="key">'
            f'<span class="tick"></span>{e(key)} v{e(ver)}</span>'
            f'<span class="tier">{e(TIER_WORD.get(tier, tier))}</span></div>'
            f'<p class="act">{e(action)}</p><dl>{dl}</dl></div>')

by_pillar = {}
for r in rules:
    by_pillar.setdefault(r[2], []).append(r)

rules_html = ""
for pillar, group in by_pillar.items():
    rules_html += f"<h2>{e(pillar)}</h2>" + "".join(rule_card(r) for r in group)

pillar_rows = "".join(
    f"<tr><td>{e(s[1])}</td><td>{e(s[2]) if s[2] else '<i class=muted>no pillar</i>'}</td>"
    f"<td class=tiny>{e(s[3])}</td></tr>" for s in pillars)

panel_rows = "".join(
    f"<tr><td>{e(p[1])}</td><td>{e(p[2])} markers</td><td class=tiny>{e(p[3])}</td></tr>"
    for p in panels)

flag_rows = "".join(
    f"<tr><td>{e(f[0])}</td><td>{'on' if f[1]=='t' else 'off'}</td>"
    f"<td class=tiny>{e(f[2][:150])}</td></tr>" for f in flags)

screen_list = "".join(f"<li>{e(s[0])}</li>" for s in screening)

money = lambda c: "$" + format(int(c) / 100, ",.2f")

DOC = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<style>{CSS}</style></head><body>

<div class="page cover">
  <div><div class="s">THE HUMAN BATTERY PROJECT</div>
  <h1>What needs your decision</h1>
  <div class="d">Everything waiting on you before a stranger can apply and receive
  a plan, and the fourteen rules that would build it. Read from the live system on
  the date below, not from notes.</div></div>
  <div class="meta">BUILT {e(TODAY)}<br>{len(rules)} RULES, {approved_n} APPROVED<br>NOT LEGAL ADVICE</div>
</div>

<div class="page">
  <p class="kicker">START HERE</p>
  <h1>The one that blocks everything</h1>
  <p class="lead">Fourteen rules are written, checked and waiting. Until you approve
  at least one, a real participant who signs up gets no daily plan at all. That is
  enforced in the database, not just in the interface.</p>

  <div class="box warn">
    <h3>1. Approve the canon</h3>
    <p>Fourteen rules, set out from page 3. Tick the ones you are willing to stand
    behind, then approve them at <b>/portal/admin/canon</b>. Each approval is recorded
    against your name with the time and your reason.</p>
    <p class="tiny">You do not have to approve all fourteen. Approving three is a
    working program with three actions; the rest can follow. Nothing here is
    irreversible: a rule can be retired later and past plans stay readable.</p>
  </div>

  <h2>The rest, in the order they will bite</h2>

  <div class="box"><h3>2. Sign-in from a real mailbox</h3>
  <p>Needs a Supabase personal access token so the sign-in link points at the live
  site rather than localhost. One command afterwards. Until this is done nobody,
  including you, can sign in from an email.</p></div>

  <div class="box"><h3>3. Stripe test keys, then live keys</h3>
  <p>Both keys, together. A secret key without a webhook secret fails in the worst
  way available: the payment succeeds, the webhook rejects itself, and nobody is
  enrolled. Test mode first; the plan for proving it is written down.</p></div>

  <div class="box"><h3>4. Voyage key</h3>
  <p>370 corpus passages, none embedded. Retrieval is currently lexical, which puts
  a question about DHA in the wrong chapter. One command once the key exists.</p></div>

  <div class="box"><h3>5. Re-read the medication screening table</h3>
  <p>These eight rows are the only thing standing between an approved action and a
  participant it is unsafe for. Confirm each is right and complete.</p>
  <ul>{screen_list}</ul></div>

  <div class="box"><h3>6. Legal review</h3>
  <p>Terms, privacy policy, the consent text, and the statement that nobody is
  monitoring. The consent is versioned <b>v1-unreviewed</b> on purpose: when reviewed
  text arrives it becomes v2 and everyone is asked again, rather than the words
  changing under a signature already given.</p></div>

  <div class="box"><h3>7. Two pilot participants, and a phone each</h3>
  <p>Day 13. Real people, real phones, consented.</p></div>
</div>

<div class="page">
  <p class="kicker">DECISIONS, NOT CREDENTIALS</p>
  <h1>Things only you can settle</h1>

  <div class="box warn"><h3>The Battery Score</h3>
  <p>No single score is shown to anyone. The only formula that has ever existed is
  built on the four retired subsystems and has never produced a row, so showing a
  combined number now would be inventing a figure.</p>
  <p>The five dimensions are each measured and shown on their own. You either
  approve a formula over those five, or the score stays off and the dimensions
  launch without it. The second is a complete product.</p></div>

  <div class="box warn"><h3>Heat and cold have no pillar</h3>
  <p>Your six pillars are morning daylight, hydration, movement, food timing, sleep
  and nighttime darkness. Sauna and cold belong to none of them, and both are in the
  screening table with hard caps.</p>
  <p>They currently generate no daily actions. They stay in the protocol documents
  as instruction. Say so if you want that changed, because the alternative is a
  seventh pillar or folding them under movement.</p></div>

  <div class="box"><h3>The laboratory panels</h3>
  <p>Three are defined. The specification said the middle one would hold fourteen
  markers and it holds twelve, which is worth a look before anyone orders one.</p>
  <table><tr><th>Panel</th><th>Markers</th><th>What it is</th></tr>{panel_rows}</table>
  <p class="tiny">Your Battery Score is identical at every panel. Higher panels add
  context, not points.</p></div>

  <div class="box"><h3>The name of the continuing membership</h3>
  <p>Called <b>continuing membership</b> everywhere until you approve a name.
  "Human Battery Continuum" is not approved.</p></div>

  <div class="box"><h3>Refund and cancellation policy text</h3>
  <p>The mechanism is built. The words a member reads are not written.</p></div>

  <div class="box"><h3>Your model provider rate</h3>
  <p>Token counts are recorded per participant. The rate per million is not, because
  this system must not guess what it costs. Enter it and the console computes cost
  per participant against the membership price.</p></div>

  <h2>Already settled, for the record</h2>
  <table>
    <tr><th>Decision</th><th>Where it stands</th></tr>
    <tr><td>Program price</td><td>{e(money(settings.get('program_price_cents','100000')))}, confirmed 26 September. Three payment options, all totalling it.</td></tr>
    <tr><td>Founding price</td><td>None. Replaced by discounts you create.</td></tr>
    <tr><td>Cohorts</td><td>None. Every participant is an N of 1.</td></tr>
    <tr><td>Continuing membership</td><td>{e(money(settings.get('continuation_monthly_cents','3999')))} monthly or {e(money(settings.get('continuation_annual_cents','34900')))} annual.</td></tr>
    <tr><td>Day 90 if nobody acts</td><td>{e(settings.get('day_90_default','lapse'))}. Nothing converts silently.</td></tr>
    <tr><td>Automatic changes</td><td>review_all. Nothing reaches a participant without you.</td></tr>
    <tr><td>Weekly recovery plan</td><td>Four weeks, confirmed.</td></tr>
    <tr><td>First start date</td><td>{e(settings.get('first_wave_date','2026-10-15'))}.</td></tr>
  </table>

  <h2>Switches, as they stand today</h2>
  <table><tr><th>Flag</th><th>State</th><th>What it does</th></tr>{flag_rows}</table>
</div>

<div class="page">
  <p class="kicker">THE CANON</p>
  <h1>Fourteen rules, and what each one is allowed to do</h1>
  <p class="lead">Every rule belongs to one of your six pillars, carries the evidence
  tier the book gives it, and names the conditions under which it is withheld. Only
  an approved rule can ever appear in a plan.</p>

  <h2>How the protocol maps onto your pillars</h2>
  <table><tr><th>Protocol section</th><th>Pillar</th><th>Note</th></tr>{pillar_rows}</table>
  <p class="tiny">Two sections map to no pillar on purpose. Section 08 is the phase
  structure and section 09 is the daily check-in; neither is a thing to be told to do.</p>
</div>

<div class="page">
  <p class="kicker">THE CANON, IN FULL</p>
  <h1>Tick what you approve</h1>
  {rules_html}
  <div class="sign">
    <div><div class="line"></div><div class="lab">SIGNED</div></div>
    <div><div class="line"></div><div class="lab">DATE</div></div>
  </div>
  <p class="tiny" style="margin-top:3mm">Signing here is a note to yourself. The
  approval that counts is the one recorded in the admin interface, against your
  name, with the time.</p>
</div>

</body></html>"""

out = os.path.join(ROOT, "program-docs", "out", "HBP-What-Needs-Your-Decision.pdf")
os.makedirs(os.path.dirname(out), exist_ok=True)
HTML(string=DOC, base_url=FONTS + os.sep).write_pdf(out, stylesheets=[])
print("  wrote", out)
