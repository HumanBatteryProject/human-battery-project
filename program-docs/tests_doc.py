from weasyprint import HTML
import build as B

def svg_mito(c="#218BBE"):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<defs><clipPath id="m"><rect x="20" y="30" width="360" height="160" rx="80"/></clipPath></defs>
<rect x="20" y="30" width="360" height="160" rx="80" fill="none" stroke="{c}" stroke-width="3"/>
<rect x="38" y="48" width="324" height="124" rx="62" fill="none" stroke="{c}" stroke-width="2" opacity=".6"/>
<g clip-path="url(#m)" fill="none" stroke="{c}" stroke-width="2.5" opacity=".7">
<path d="M70 48 v50 a18 18 0 0 0 36 0 v-50"/><path d="M130 172 v-55 a18 18 0 0 1 36 0 v55"/>
<path d="M190 48 v50 a18 18 0 0 0 36 0 v-50"/><path d="M250 172 v-55 a18 18 0 0 1 36 0 v55"/><path d="M310 48 v50 a18 18 0 0 0 36 0 v-50"/></g>
<g fill="{c}"><circle cx="60" cy="40" r="4"/><circle cx="110" cy="36" r="4"/><circle cx="160" cy="40" r="4"/><circle cx="240" cy="36" r="4"/><circle cx="290" cy="40" r="4"/><circle cx="340" cy="38" r="4"/>
<circle cx="90" cy="180" r="4"/><circle cx="170" cy="184" r="4"/><circle cx="220" cy="180" r="4"/><circle cx="300" cy="184" r="4"/></g>
<g fill="{c}" opacity=".35"><circle cx="150" cy="110" r="3"/><circle cx="230" cy="120" r="3"/><circle cx="200" cy="95" r="3"/></g>
<g transform="translate(200,110)"><circle r="14" fill="none" stroke="{c}" stroke-width="3"/><path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="{c}" stroke-width="2.5"/></g>
<text x="200" y="212" text-anchor="middle" font-family="Michroma" font-size="9" fill="{c}" letter-spacing="2">PROTONS PUMPED ACROSS THE MEMBRANE</text>
</svg>"""

def svg_drain(c="#6E908C", warn="#B4653A"):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<rect x="70" y="60" width="240" height="100" rx="12" fill="none" stroke="{c}" stroke-width="3"/>
<rect x="310" y="90" width="18" height="40" rx="4" fill="{c}"/>
<rect x="82" y="72" width="140" height="76" rx="6" fill="{c}" opacity=".35"/>
<g stroke="{warn}" stroke-width="2.5" fill="none" stroke-linecap="round">
<path d="M150 165 q5 18 -4 30"/><path d="M200 165 q5 18 -4 30"/><path d="M250 165 q5 18 -4 30"/></g>
<g fill="{warn}"><circle cx="146" cy="200" r="3.5"/><circle cx="196" cy="200" r="3.5"/><circle cx="246" cy="200" r="3.5"/></g>
<text x="200" y="40" text-anchor="middle" font-family="Michroma" font-size="9" fill="{c}" letter-spacing="2">CHARGED, AND LEAKING</text>
<text x="200" y="215" text-anchor="middle" font-family="Michroma" font-size="7" fill="{warn}" letter-spacing="2">INFLAMMATION RUNS IN THE BACKGROUND</text>
</svg>"""

def svg_output(c="#2AAFC0"):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<rect x="40" y="80" width="90" height="60" rx="8" fill="none" stroke="{c}" stroke-width="3"/><rect x="130" y="98" width="10" height="24" rx="3" fill="{c}"/>
<rect x="48" y="88" width="74" height="44" rx="4" fill="{c}" opacity=".5"/>
<path d="M150 110 h60" stroke="{c}" stroke-width="3" stroke-linecap="round"/>
<path d="M232 68 l-16 40 h22 l-18 46 l44 -58 h-22 l16 -28 z" fill="{c}"/>
<g fill="none" stroke="{c}" stroke-width="2.5" stroke-linecap="round" opacity=".8">
<path d="M300 70 c20 -20 50 -10 50 15 c0 20 -25 30 -25 45"/><circle cx="325" cy="150" r="3" fill="{c}"/>
<path d="M300 130 q20 -30 45 -5"/><path d="M305 165 h40"/></g>
<text x="200" y="40" text-anchor="middle" font-family="Michroma" font-size="9" fill="{c}" letter-spacing="2">STORED, THEN SPENT</text>
<text x="200" y="212" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="2">HORMONES DECIDE HOW MUCH YOU CAN USE</text>
</svg>"""

def svg_reserve(c="#157A5C", d="#2AAFC0"):
    heads = "".join(f'<circle cx="{40+i*30}" cy="80" r="7" fill="{c}"/><circle cx="{40+i*30}" cy="140" r="7" fill="{c}"/>' for i in range(11) if i != 5)
    tails = "".join(f'<path d="M{37+i*30} 87 q-3 12 2 24 M{43+i*30} 87 q3 12 -2 24" stroke="{c}" stroke-width="2" fill="none"/><path d="M{37+i*30} 133 q-3 -12 2 -24 M{43+i*30} 133 q3 -12 -2 -24" stroke="{c}" stroke-width="2" fill="none"/>' for i in range(11) if i != 5)
    dha = f'<circle cx="190" cy="80" r="8" fill="{d}"/><path d="M186 88 q-10 12 -1 22 q7 8 -3 14" stroke="{d}" stroke-width="3" fill="none"/><path d="M194 88 q10 12 1 22 q-7 8 3 14" stroke="{d}" stroke-width="3" fill="none"/><circle cx="190" cy="140" r="8" fill="{d}"/><path d="M186 132 q-10 -12 -1 -22" stroke="{d}" stroke-width="3" fill="none"/><path d="M194 132 q10 -12 1 -22" stroke="{d}" stroke-width="3" fill="none"/>'
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
{tails}{heads}{dha}
<text x="200" y="40" text-anchor="middle" font-family="Michroma" font-size="9" fill="{c}" letter-spacing="2">THE MEMBRANE, UP CLOSE</text>
<text x="200" y="185" text-anchor="middle" font-family="Michroma" font-size="7" fill="{d}" letter-spacing="2">DHA IS THE FLEXIBLE ONE</text>
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="2">WHAT THE BATTERY IS BUILT FROM</text>
</svg>"""

def svg_functional(c="#218BBE"):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M90 60 v70 c0 20 -30 30 -40 20 c-10 -12 5 -40 20 -50 M90 60 v70 c0 20 30 30 40 20 c10 -12 -5 -40 -20 -50"/>
<path d="M200 140 c-30 -20 -40 -55 -15 -65 c10 -4 15 5 15 10 c0 -5 5 -14 15 -10 c25 10 15 45 -15 65 z"/>
<path d="M300 70 v40 a25 25 0 0 0 50 0 v-25 M310 70 v-10 M320 70 v-14 M330 70 v-16 M340 70 v-12"/></g>
<text x="90" y="175" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">OXYGEN</text>
<text x="200" y="175" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">HEART</text>
<text x="325" y="175" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">GRIP</text>
<text x="200" y="40" text-anchor="middle" font-family="Michroma" font-size="9" fill="{c}" letter-spacing="2">WHAT BLOOD CANNOT SHOW</text>
</svg>"""

def svg_lab(c="#2AAFC0", r="#B4653A"):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round">
<path d="M120 50 h40 v60 l25 55 a10 10 0 0 1 -9 15 h-72 a10 10 0 0 1 -9 -15 l25 -55 z"/><path d="M112 50 h56"/></g>
<path d="M104 140 l16 -30 h40 l16 30 z" fill="{r}" opacity=".6"/>
<path d="M240 60 c-20 30 -20 60 0 60 c20 0 20 -30 0 -60 z" fill="{r}"/>
<g fill="none" stroke="{c}" stroke-width="3"><path d="M320 55 c-22 0 -35 18 -35 38 c0 30 35 60 35 60 s35 -30 35 -60 c0 -20 -13 -38 -35 -38 z"/><circle cx="320" cy="92" r="12"/></g>
<text x="200" y="40" text-anchor="middle" font-family="Michroma" font-size="9" fill="{c}" letter-spacing="2">ONE DRAW, ONE FINGER PRICK</text>
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="2">WALK IN. NO DOCTOR ORDER NEEDED.</text>
</svg>"""

def svg_rules(c="#218BBE"):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round">
<circle cx="120" cy="110" r="55"/><path d="M120 70 v40 l25 15"/>
<circle cx="280" cy="110" r="55"/><path d="M250 110 h60 M280 80 v60" opacity=".35"/></g>
<text x="120" y="190" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">7 TO 9 AM</text>
<text x="280" y="190" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">12 HOURS EMPTY</text>
<text x="200" y="40" text-anchor="middle" font-family="Michroma" font-size="9" fill="{c}" letter-spacing="2">SAME WAY, BOTH TIMES</text>
</svg>"""

ICONS = {"charge": svg_mito, "drain": svg_drain, "output": svg_output, "reserve": svg_reserve}

CSS2 = B.CSS + """
.divider{background:#05090C;color:#ECF3F4;height:279.4mm;width:215.9mm;padding:22mm 20mm;display:flex;flex-direction:column;justify-content:space-between}
.divider .k{font-family:'Michroma';font-size:8pt;letter-spacing:.3em}
.divider h1{color:#fff;font-size:22pt;line-height:1.25;margin:0}
.divider .d{font-size:13pt;color:#9FB4B8;margin-top:5mm;max-width:130mm}
.divider svg{width:150mm;height:auto;margin:0 auto}
.divider .n{font-family:'Michroma';font-size:60pt;color:#13323F;line-height:1}
.band{height:3mm;border-radius:2mm;margin:0 0 6mm}
.mk{display:flex;gap:3.5mm;padding:2.1mm 0;border-bottom:.35pt solid #DCE4E5;page-break-inside:avoid}
.mk .dot{width:8mm;height:8mm;border-radius:50%;flex:none;margin-top:.5mm;display:flex;align-items:center;justify-content:center;font-family:'Michroma';font-size:6.4pt;color:#fff}
.mk .body{flex:1}
.mk b{font-family:'Michroma';font-size:6.9pt;letter-spacing:.05em;color:#13323F;display:block;margin-bottom:1mm}
.mk p{margin:0 0 .7mm;font-size:8.9pt;line-height:1.42}
.mk i{font-style:normal;font-family:'Michroma';font-size:5.8pt;letter-spacing:.06em}
.lab{border:.4pt solid #C3CFD0;border-left:2.5mm solid #2AAFC0;border-radius:1.5mm;padding:4mm 4mm 4mm 5mm;margin:3mm 0;page-break-inside:avoid}
.lab h3{margin-top:0;color:#13323F}
.lab.rec{background:rgba(42,175,192,.06)}
.rulecard{display:flex;gap:4mm;padding:3mm 0;border-bottom:.35pt solid #DCE4E5}
.rulecard .num{font-family:'Michroma';font-size:14pt;color:#218BBE;width:12mm;flex:none;line-height:1}
.rulecard b{font-family:'Michroma';font-size:7pt;letter-spacing:.05em;color:#13323F;display:block;margin-bottom:1mm}
.rulecard p{margin:0;font-size:9.4pt}
.four{display:flex;gap:3mm;margin:4mm 0}
.four>div{flex:1;border-radius:1.5mm;padding:3.5mm 3mm;color:#fff}
.four h3{color:#fff;margin:0 0 1.5mm;font-size:6.6pt}
.four p{margin:0;font-size:8.4pt;line-height:1.4;color:rgba(255,255,255,.9)}
"""

def card(i, color, n, w, y):
    num = str(i + 1).zfill(2)
    return (f'<div class="mk"><div class="dot" style="background:{color}">{num}</div><div class="body"><b>{n}</b>'
            f'<p><i style="color:{color}">WHAT IT IS</i> &nbsp; {w}</p>'
            f'<p><i style="color:{color}">WHY WE MEASURE IT</i> &nbsp; {y}</p></div></div>')

def marker_pages(key, num):
    name, color, desc, rows = B.MARKERS[key]
    cards = "".join(card(i, color, n, w, y) for i, (n, w, y) in enumerate(rows))
    return (f'<div class="page divider"><div><div class="k" style="color:{color}">SYSTEM {num} OF 4</div>'
            f'<h1 style="margin-top:4mm">{name}</h1><div class="d">{desc}</div></div>'
            f'{ICONS[key]()}<div class="n">{num}</div></div>'
            f'<div class="page"><div class="band" style="background:{color}"></div>'
            f'<div class="kicker" style="color:{color}">{name}</div><h1>{desc}</h1>{cards}</div>')

def divider(k, color, title, desc, svg, n):
    return (f'<div class="page divider"><div><div class="k" style="color:{color}">{k}</div>'
            f'<h1 style="margin-top:4mm">{title}</h1><div class="d">{desc}</div></div>{svg}<div class="n">{n}</div></div>')

def tests_doc():
    sections = "".join(marker_pages(k, i + 1) for i, k in enumerate(["charge", "drain", "output", "reserve"]))
    fx = "".join(card(i, "#218BBE", n, w, y) for i, (n, w, y) in enumerate(B.FUNCTIONAL))
    dr = "".join(f'<div class="rulecard"><div class="num">{i+1}</div><div><b>{n}</b><p>{w}</p></div></div>' for i, (n, w) in enumerate(B.DRAW_RULES))

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{CSS2}</style></head><body>

<div class="page cover">
  <img src="lockup-dark.png">
  <div class="rule"></div>
  <div class="t">YOUR TESTS, EXPLAINED</div>
  <div class="s">WHAT WE MEASURE AND WHY</div>
  <div class="tag">Thirty-three markers, four functional tests, one finger prick. Read as four systems. Measured twice.</div>
</div>

<div class="page">
  <div class="band" style="background:linear-gradient(90deg,#218BBE 25%,#6E908C 25% 50%,#2AAFC0 50% 75%,#157A5C 75%)"></div>
  <div class="kicker">HOW TO READ THIS</div>
  <h1>Four systems, not thirty-three numbers</h1>
  <p class="lede">Every test on the list belongs to one of four systems. Together they tell us how well your cellular batteries are being charged, what is draining them, how much you can spend, and what they are built from.</p>
  <div class="four">
    <div style="background:#218BBE"><h3>CHARGE</h3><p>How well fuel becomes energy. Six markers.</p></div>
    <div style="background:#6E908C"><h3>DRAIN</h3><p>What runs in the background. Nine markers.</p></div>
    <div style="background:#2AAFC0"><h3>OUTPUT</h3><p>What you can spend. Nine markers.</p></div>
    <div style="background:#157A5C"><h3>RESERVE</h3><p>What you are built from. Nine markers.</p></div>
  </div>
  <p>Most lab reports hand you a wall of numbers with a flag next to the ones outside "normal." We do something different. Each marker is scored against where a well-functioning body sits, not against the population average, and the scores roll up into four systems and one Battery Score. A result at the edge of normal on a standard report can be a low score here. That is the point.</p>
  <p>For each test you will see two things. <b>What it is</b>, in plain words. And <b>why we measure it</b>, which is the part most reports leave out.</p>
  <h3>One thing to know before you read</h3>
  <p>A normal result on any of these does not prove every cell in your body is working perfectly. These numbers describe the environment your cells work in. They are the best indirect view we have, and measuring them twice, ninety days apart, is what makes them useful.</p>
  <div class="rule"><b>Out of range means a referral.</b> If any marker falls outside the laboratory's reference range, you will be referred to a physician. Every time. That is a rule, not a judgment call.</div>
</div>

{sections}

{divider("FUNCTIONAL TESTS", "#218BBE", "What blood cannot show", "Oxygen moved, force produced, and how fast the system recovers. Four measurements you take yourself.", svg_functional(), "+")}
<div class="page">
  <div class="band" style="background:#218BBE"></div>
  <div class="kicker" style="color:#218BBE">FUNCTIONAL TESTS</div>
  <h1>The four things blood cannot show</h1>
  {fx}
</div>

{divider("GETTING IT DONE", "#2AAFC0", "Where to go", "One walk-in draw. One kit in the mail. Same lab both times.", svg_lab(), "&rarr;")}
<div class="page">
  <div class="band" style="background:#2AAFC0"></div>
  <div class="kicker" style="color:#2AAFC0">WHERE TO GET IT DONE</div>
  <h1>Getting your blood drawn</h1>
  <div class="lab rec">
    <h3>Any Lab Test Now &middot; recommended</h3>
    <p>Walk-in locations across the country, no appointment needed at most, and no doctor's order required in most states. Bring the marker list from the last page and ask them to build a custom panel from it. Their draw sites send to the same national laboratories your doctor uses. Find your nearest location at anylabtestnow.com.</p>
    <p>Some markers may not be on their standard menu. RBC magnesium, the AA to EPA ratio and the kynurenine to tryptophan ratio are the ones most likely to need a special request. Ask. If a marker genuinely cannot be run, the program excludes it from your score rather than guessing, so you are not penalized.</p>
  </div>
  <div class="lab">
    <h3>Other options</h3>
    <p><b>Labcorp OnDemand</b> and <b>Quest via QuestHealth.com</b> let you order online and visit their draw sites. <b>Ulta Lab Tests</b> builds custom panels at Quest locations. Any of these works. Whichever you choose, use the same one for day 90.</p>
  </div>
  <div class="lab" style="border-left-color:#157A5C">
    <h3>The Omega-3 Index</h3>
    <p>Not done at the lab. Order the OmegaQuant Omega-3 Index kit online, about fifty dollars. It arrives in the mail. You prick your finger, put a drop on the card, and mail it back. Results in about a week. Do it the same week as your blood draw, both times.</p>
  </div>
  <div class="lab" style="border-left-color:#218BBE">
    <h3>VO&#8322;max and grip</h3>
    <p>A VO&#8322;max lab test with a mask runs $150 to $300 at most sports performance centers and university labs. If that is not practical, your First Steps document has a step test you can do at home. Grip strength uses a small hand dynamometer, about forty dollars online, that you keep for day 90.</p>
  </div>
</div>

{divider("BEFORE THE DRAW", "#218BBE", "Keep the numbers honest", "Day 0 and day 90 only mean something if they were taken the same way.", svg_rules(), "6")}
<div class="page">
  <div class="band" style="background:#218BBE"></div>
  <div class="kicker" style="color:#218BBE">BEFORE THE DRAW</div>
  <h1>Six rules</h1>
  {dr}
  <div class="rule" style="margin-top:7mm"><b>Bring this list to the lab.</b> Ask for exactly these.</div>
  <p class="small" style="margin-top:3mm"><b style="color:#218BBE">CHARGE</b> &nbsp; fasting glucose, fasting insulin, HbA1c, triglycerides, HDL, standard lipid panel<br>
  <b style="color:#6E908C">DRAIN</b> &nbsp; hs-CRP, GGT, ALT, AST, uric acid, CBC with differential, homocysteine, omega-3 fatty acid profile with AA and EPA, kynurenine and tryptophan<br>
  <b style="color:#2AAFC0">OUTPUT</b> &nbsp; TSH, free T3, free T4, total testosterone, free testosterone, DHEA-S, AM cortisol, IGF-1, SHBG<br>
  <b style="color:#157A5C">RESERVE</b> &nbsp; 25-OH vitamin D, ferritin, iron and TIBC, vitamin B12, folate, RBC magnesium, albumin<br>
  <span style="color:#6E908C">HOMA-IR and the ratios are calculated, not drawn.</span></p>
  <div class="rule" style="margin-top:6mm">The Human Battery Project is an educational wellness program, not medical treatment. It does not diagnose or treat any condition. Any result outside the laboratory's reference range is referred to a physician.</div>
</div>

</body></html>"""
    path = f"{B.OUT}/HBP-Your-Tests-Explained.pdf"
    HTML(string=html, base_url=B.BASE_URL).write_pdf(path)
    return path
