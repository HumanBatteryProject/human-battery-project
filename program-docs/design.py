import math
# Shared design pieces for every Human Battery PDF.
# Inline SVG only, brand palette only, no raster, no stock.

BLUE, TEAL, GREEN, STEEL, COPPER, NAVY, ICE = "#2A78D6", "#7A4A2E", "#1BAF7A", "#6E655C", "#9C603C", "#0E1424", "#FBF9F5"

EXTRA_CSS = """
.divider{background:#0E1424;color:#F6F1E7;height:279.4mm;width:215.9mm;padding:22mm 20mm;display:flex;flex-direction:column;justify-content:space-between}
.divider .k{font-family:'Michroma';font-size:8pt;letter-spacing:.3em}
.divider h1{color:#F6F1E7;font-size:22pt;line-height:1.25;margin:0}
.divider .d{font-size:13pt;color:#A8A096;margin-top:5mm;max-width:130mm;line-height:1.45}
.divider svg{width:150mm;height:auto;margin:0 auto}
.divider .n{font-family:'Michroma';font-size:60pt;color:#1A1714;line-height:1}
.band{height:3mm;border-radius:2mm;margin:0 0 6mm}
.card{display:flex;gap:3.5mm;padding:2.4mm 0;border-bottom:.35pt solid #E4DED2;page-break-inside:avoid}
.card .dot{width:8mm;height:8mm;border-radius:50%;flex:none;margin-top:.5mm;display:flex;align-items:center;justify-content:center;font-family:'Michroma';font-size:6.2pt;color:#fff}
.card .body{flex:1}
.card b{font-family:'Michroma';font-size:6.9pt;letter-spacing:.05em;color:#1A1714;display:block;margin-bottom:1mm}
.card p{margin:0 0 .8mm;font-size:9pt;line-height:1.45}
.card i{font-style:normal;font-family:'Michroma';font-size:5.8pt;letter-spacing:.06em}
.tile{border:.4pt solid #E4DED2;border-left:2.5mm solid #2A78D6;border-radius:1.5mm;padding:3.5mm 4mm 3.5mm 5mm;margin:2.5mm 0;page-break-inside:avoid}
.tile h3{margin:0 0 1.5mm;color:#1A1714}
.tile p{margin:0 0 1mm;font-size:9.2pt;line-height:1.48}
.tile.soft{background:#F4EFE4}
.grid2{display:flex;gap:3mm}
.grid2>div{flex:1}
.chips{display:flex;flex-wrap:wrap;gap:1.6mm;margin:2mm 0}
.chip{font-size:8.6pt;padding:1.4mm 2.6mm;border-radius:10mm;border:.4pt solid #E4DED2;color:#1A1714}
.chip.no{border-color:#A32E22;color:#A32E22}
.chip.yes{border-color:#1BAF7A;color:#1BAF7A}
.tierrow{display:flex;gap:3mm;margin-top:3mm}
.tierrow>div{flex:1;border-radius:1.5mm;padding:3.2mm 3mm;color:#fff}
.tierrow h3{margin:0 0 1.6mm;font-size:6.6pt;color:#fff}
.tierrow p{font-size:8.2pt;margin:0;line-height:1.42;color:rgba(255,255,255,.92)}
.why{font-size:9.2pt;color:#6E655C;margin-bottom:3.2mm}.fourq{font-size:7.4pt;line-height:1.45;color:#6E655C;margin:2mm 0 4mm;padding-left:3mm;border-left:1.5pt solid #6E655C}.fourq.flagged{color:#5E3823;border-left-color:#7A4A2E}
.stepnum{font-family:'Michroma';font-size:14pt;color:#2A78D6;width:12mm;flex:none;line-height:1}
"""

def divider(kicker, color, title, desc, svg, n):
    return (f'<div class="page divider"><div><div class="k" style="color:{color}">{kicker}</div>'
            f'<h1 style="margin-top:4mm">{title}</h1><div class="d">{desc}</div></div>{svg}<div class="n">{n}</div></div>')

def band(color):
    return f'<div class="band" style="background:{color}"></div>'

def card(i, color, title, what, why=None, labels=("WHAT TO DO", "WHY")):
    num = str(i + 1).zfill(2)
    body = f'<p><i style="color:{color}">{labels[0]}</i> &nbsp; {what}</p>'
    if why:
        body += f'<p><i style="color:{color}">{labels[1]}</i> &nbsp; {why}</p>'
    return f'<div class="card"><div class="dot" style="background:{color}">{num}</div><div class="body"><b>{title}</b>{body}</div></div>'

def tile(title, html, color=BLUE, soft=False):
    return f'<div class="tile{" soft" if soft else ""}" style="border-left-color:{color}"><h3>{title}</h3>{html}</div>'

# ------------------------------------------------------------------ SVGs

def sun(c=TEAL, c2=COPPER):
    rays = "".join(f'<line x1="200" y1="110" x2="{200+95*__import__("math").cos(a)}" y2="{110-95*__import__("math").sin(a)}" stroke="{c}" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>' for a in [0.3,0.7,1.1,1.5,1.9,2.3,2.7])
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<path d="M20 170 Q200 130 380 170" stroke="{c}" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M130 160 A70 70 0 0 1 270 160" stroke="{c2}" stroke-width="3" fill="none"/>
<circle cx="200" cy="110" r="42" fill="{c2}" opacity=".9"/>
{rays}
<g fill="none" stroke="{c}" stroke-width="3"><path d="M40 60 q25 -25 50 0 q-25 25 -50 0 z"/><circle cx="65" cy="60" r="6"/></g>
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">LIGHT SETS THE CLOCK</text>
</svg>"""

def water(c=BLUE, c2=COPPER):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M140 50 h120 l-12 130 a10 10 0 0 1 -10 9 h-76 a10 10 0 0 1 -10 -9 z"/>
</g>
<path d="M150 95 h100 l-9 84 h-82 z" fill="{c}" opacity=".28"/>
<circle cx="205" cy="75" r="22" fill="none" stroke="{c2}" stroke-width="3"/>
<path d="M205 53 v44 M183 75 h44 M190 60 l30 30 M220 60 l-30 30" stroke="{c2}" stroke-width="2" opacity=".8"/>
<g fill="{c}"><circle cx="175" cy="120" r="3"/><circle cx="222" cy="140" r="3"/><circle cx="195" cy="160" r="3"/></g>
<g fill="{c}" opacity=".5"><rect x="60" y="150" width="8" height="8" rx="1"/><rect x="72" y="140" width="8" height="8" rx="1"/><rect x="320" y="150" width="8" height="8" rx="1"/><rect x="332" y="140" width="8" height="8" rx="1"/></g>
<text x="200" y="210" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">MINERALS, LEMON, SALT</text>
</svg>"""

def movement(c=BLUE):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
<circle cx="110" cy="55" r="12"/><path d="M110 67 v40 l-25 35 M110 107 l25 35 M110 75 l-30 20 M110 75 l30 20"/>
<circle cx="290" cy="50" r="12"/><path d="M290 62 v30 M290 92 l-22 40 M290 92 l22 40 M262 80 h56"/>
<path d="M175 165 h50" /><rect x="168" y="150" width="8" height="30" rx="2" fill="{c}"/><rect x="224" y="150" width="8" height="30" rx="2" fill="{c}"/>
</g>
<text x="110" y="185" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">SQUAT</text>
<text x="290" y="185" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">PRESS</text>
<text x="200" y="210" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">SQUAT, PUSH, PULL, HINGE</text>
</svg>"""

def food(c=GREEN, c2=BLUE, c3=COPPER):
    def arc(a0, a1, r=66):
        x0, y0 = 200 + r*math.cos(a0), 110 + r*math.sin(a0)
        x1, y1 = 200 + r*math.cos(a1), 110 + r*math.sin(a1)
        big = 1 if (a1 - a0) > math.pi else 0
        return f"M200 110 L{x0:.1f} {y0:.1f} A{r} {r} 0 {big} 1 {x1:.1f} {y1:.1f} z"
    t = -math.pi/2
    p_end = t + 2*math.pi*0.40
    f_end = p_end + 2*math.pi*0.40
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<circle cx="200" cy="110" r="80" fill="none" stroke="{c}" stroke-width="3"/>
<circle cx="200" cy="110" r="66" fill="none" stroke="{c}" stroke-width="1.5" opacity=".5"/>
<path d="{arc(t, p_end)}" fill="{c2}" opacity=".4"/>
<path d="{arc(p_end, f_end)}" fill="{c}" opacity=".4"/>
<path d="{arc(f_end, t + 2*math.pi)}" fill="{c3}" opacity=".3"/>
<g stroke="{c2}" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M228 66 q18 6 24 24 q-18 -6 -24 -24 z"/><path d="M232 70 l16 16"/></g>
<g stroke="{c}" stroke-width="2" fill="none"><path d="M160 150 q10 -20 30 -10 M170 140 q-14 8 -6 22"/></g>
<text x="200" y="210" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">PROTEIN, FAT, THEN CARBS</text>
</svg>"""

def heatcold(c=COPPER, c2=BLUE):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round">
<path d="M60 150 q15 -30 0 -60 q-15 -30 0 -60"/><path d="M95 150 q15 -30 0 -60 q-15 -30 0 -60"/><path d="M130 150 q15 -30 0 -60 q-15 -30 0 -60"/>
</g>
<g fill="none" stroke="{c2}" stroke-width="3" stroke-linecap="round">
<path d="M300 40 v120 M300 100 l-40 -25 M300 100 l40 -25 M300 100 l-40 25 M300 100 l40 25 M260 75 l-10 -15 M260 75 l-14 8 M340 75 l10 -15 M340 75 l14 8 M260 125 l-10 15 M260 125 l-14 -8 M340 125 l10 15 M340 125 l14 -8"/>
</g>
<text x="95" y="185" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">HEAT</text>
<text x="300" y="185" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c2}" letter-spacing="1.5">COLD</text>
<text x="200" y="210" text-anchor="middle" font-family="Michroma" font-size="8" fill="{STEEL}" letter-spacing="2">STRESS THAT BUILDS CAPACITY</text>
</svg>"""

def sleep(c=NAVY, c2=TEAL):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<path d="M250 50 a45 45 0 1 0 40 70 a35 35 0 0 1 -40 -70 z" fill="{c2}" opacity=".85"/>
<g fill="{c2}" opacity=".7"><circle cx="320" cy="60" r="2.5"/><circle cx="340" cy="90" r="2"/><circle cx="305" cy="110" r="2"/></g>
<g fill="none" stroke="{c2}" stroke-width="3" stroke-linecap="round"><path d="M60 150 v-40 h60 v20 h120 v20 M60 150 h180 M70 150 v12 M230 150 v12"/><circle cx="85" cy="122" r="9"/></g>
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c2}" letter-spacing="2">DARK, COOL, SAME TIME</text>
</svg>"""

def environment(c=TEAL, c2=COPPER):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
<path d="M100 110 l100 -70 l100 70 v80 h-200 z"/><path d="M170 190 v-50 h60 v50"/>
</g>
<circle cx="200" cy="95" r="14" fill="{c2}" opacity=".9"/><path d="M200 109 v10 M192 121 h16" stroke="{c2}" stroke-width="2.5"/>
<g fill="none" stroke="{c}" stroke-width="2.5" stroke-linecap="round"><path d="M40 170 h30 M55 170 v-14 M48 148 q7 -8 14 0 M40 138 q15 -16 30 0" opacity=".55"/><path d="M42 132 l26 40" stroke="{c2}"/></g>
<g fill="none" stroke="{c2}" stroke-width="2.5"><path d="M320 140 h50 l-6 -8 h-38 z"/><path d="M328 132 q17 -20 34 0"/></g>
<text x="200" y="215" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">RED LIGHT, ROUTER OFF, GLASSES ON</text>
</svg>"""

def ninety(c=BLUE, c2=TEAL):
    ticks = "".join(f'<line x1="{60+i*28}" y1="112" x2="{60+i*28}" y2="{120 if i%3 else 126}" stroke="{c}" stroke-width="2"/>' for i in range(11))
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<line x1="50" y1="112" x2="350" y2="112" stroke="{c}" stroke-width="3" stroke-linecap="round"/>
{ticks}
<rect x="60" y="70" width="93" height="26" rx="4" fill="{c}" opacity=".25"/><rect x="153" y="70" width="93" height="26" rx="4" fill="{c}" opacity=".45"/><rect x="246" y="70" width="94" height="26" rx="4" fill="{c}" opacity=".7"/>
<text x="106" y="88" text-anchor="middle" font-family="Michroma" font-size="6" fill="#fff" letter-spacing="1">STOP THE DRAIN</text>
<text x="199" y="88" text-anchor="middle" font-family="Michroma" font-size="6" fill="#fff" letter-spacing="1">RECHARGE</text>
<text x="293" y="88" text-anchor="middle" font-family="Michroma" font-size="6" fill="#fff" letter-spacing="1">BUILD</text>
<g fill="{c2}"><circle cx="60" cy="112" r="8"/><circle cx="340" cy="112" r="8"/></g>
<text x="60" y="150" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c2}" letter-spacing="1">DAY 0 DRAW</text>
<text x="340" y="150" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c2}" letter-spacing="1">DAY 90 DRAW</text>
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">MEASURED AT BOTH ENDS</text>
</svg>"""

def checklist(c=NAVY, c2=TEAL):
    boxes = "".join(f'<g transform="translate({70+(i%3)*95},{50+(i//3)*45})"><rect width="18" height="18" rx="3" fill="none" stroke="{c2}" stroke-width="2.5"/>{"<path d=\'M4 9 l4 4 l7 -8\' stroke=\'"+c2+"\' stroke-width=\'2.5\' fill=\'none\' stroke-linecap=\'round\'/>" if i<5 else ""}<rect x="28" y="6" width="{55 if i%2 else 40}" height="6" rx="3" fill="{c2}" opacity=".3"/></g>' for i in range(9))
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
{boxes}
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c2}" letter-spacing="2">UNDER A MINUTE, EVERY DAY</text>
</svg>"""

def plate(c=GREEN, c2=BLUE, c3=COPPER):
    # protein 40%, fat 40%, carbohydrate 20%
    def arc(a0, a1, r=82):
        x0, y0 = 200 + r*math.cos(a0), 112 + r*math.sin(a0)
        x1, y1 = 200 + r*math.cos(a1), 112 + r*math.sin(a1)
        big = 1 if (a1 - a0) > math.pi else 0
        return f"M200 112 L{x0:.1f} {y0:.1f} A{r} {r} 0 {big} 1 {x1:.1f} {y1:.1f} z"
    t = -math.pi/2
    p_end = t + 2*math.pi*0.40
    f_end = p_end + 2*math.pi*0.40
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<circle cx="200" cy="112" r="85" fill="none" stroke="{c}" stroke-width="3"/>
<path d="{arc(t, p_end)}" fill="{c2}" opacity=".45"/>
<path d="{arc(p_end, f_end)}" fill="{c}" opacity=".4"/>
<path d="{arc(f_end, t + 2*math.pi)}" fill="{c3}" opacity=".35"/>
<text x="252" y="82" text-anchor="middle" font-family="Michroma" font-size="6.5" fill="#fff" letter-spacing="1">PROTEIN 40%</text>
<text x="176" y="170" text-anchor="middle" font-family="Michroma" font-size="6.5" fill="#fff" letter-spacing="1">FAT 40%</text>
<text x="146" y="86" text-anchor="middle" font-family="Michroma" font-size="6" fill="#fff" letter-spacing="1">CARBS 20%</text>
<text x="200" y="212" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">PROTEIN AND FAT ARE MOST OF THE PLATE</text>
</svg>"""

def crossed(c=COPPER):
    items = "".join(f'<g transform="translate({70+i*66},95)"><circle r="24" fill="none" stroke="{c}" stroke-width="3"/><path d="M-17 -17 l34 34" stroke="{c}" stroke-width="3" stroke-linecap="round"/></g>' for i in range(5))
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
{items}
<text x="70" y="150" text-anchor="middle" font-family="Michroma" font-size="6" fill="{c}" letter-spacing="1">GLUTEN</text>
<text x="136" y="150" text-anchor="middle" font-family="Michroma" font-size="6" fill="{c}" letter-spacing="1">SEED OILS</text>
<text x="202" y="150" text-anchor="middle" font-family="Michroma" font-size="6" fill="{c}" letter-spacing="1">SUGAR</text>
<text x="268" y="150" text-anchor="middle" font-family="Michroma" font-size="6" fill="{c}" letter-spacing="1">ALCOHOL</text>
<text x="334" y="150" text-anchor="middle" font-family="Michroma" font-size="6" fill="{c}" letter-spacing="1">PACKAGED</text>
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">OUT FOR NINETY DAYS</text>
</svg>"""

def sardine(c=GREEN, c2=BLUE):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<g fill="none" stroke="{c2}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
<path d="M60 110 q60 -50 140 -20 q40 15 70 20 q-30 5 -70 20 q-80 30 -140 -20 z"/><path d="M270 110 l40 -25 v50 z"/><circle cx="100" cy="103" r="4" fill="{c2}"/>
<path d="M140 90 q10 20 0 40 M170 88 q10 22 0 44 M200 90 q8 20 0 40" opacity=".5"/>
</g>
<text x="200" y="175" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c2}" letter-spacing="1.5">DHA, EVERY DAY</text>
<text x="200" y="205" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">THE MOST IMPORTANT FOOD IN THE PROGRAM</text>
</svg>"""

def seasons(c=COPPER, c2=BLUE, c3=GREEN):
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
<path d="M20 150 Q110 20 200 150" stroke="{c}" stroke-width="3" fill="none" stroke-linecap="round"/>
<circle cx="110" cy="52" r="20" fill="{c}"/>
<path d="M210 150 Q290 100 370 150" stroke="{c2}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
<circle cx="290" cy="112" r="14" fill="{c2}" opacity=".8"/>
<line x1="20" y1="150" x2="380" y2="150" stroke="{c3}" stroke-width="2"/>
<g fill="{c}"><circle cx="70" cy="180" r="9"/><circle cx="95" cy="176" r="7"/><circle cx="118" cy="182" r="8"/></g>
<path d="M62 172 q8 -8 16 0" stroke="{c3}" stroke-width="2" fill="none"/>
<g fill="none" stroke="{c2}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M250 180 q30 -22 70 -8 q-10 5 -18 12 q8 6 18 12 q-40 14 -70 -8 z"/><path d="M320 172 l18 -10 v20 z"/></g>
<text x="110" y="205" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c}" letter-spacing="1.5">SUMMER: FRUIT</text>
<text x="290" y="205" text-anchor="middle" font-family="Michroma" font-size="7" fill="{c2}" letter-spacing="1.5">WINTER: FAT</text>
<text x="200" y="30" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c3}" letter-spacing="2">THE SUN MAKES THE FOOD</text>
</svg>"""


# ---------------------------------------------------------------------------
# THE MARK, AND THE TRADEMARK BESIDE IT
#
# Ruled 27 September 2026: every appearance of the mark carries a trademark
# symbol, and the logo files are never edited to do it. See brand/DAWN-NOTES.md,
# "The trademark, and where it sits", for the ruling and for the conflicts it
# creates with the printed brand guide.
#
# These fractions were MEASURED off the alpha channel of wordmark.png. All three
# assets share the same 2172x724 canvas, so one set serves all of them.
#   cap height of HUMAN       133px  = 0.1837 of image height
#   right edge of HUMAN BATTERY x 2090 = 0.9622 of image width
#   top of HUMAN BATTERY      y 262  = 0.3619 of image height
# ---------------------------------------------------------------------------

WORDMARK_DARK = "public/assets/wordmark.png"          # metallic, DARK grounds only
WORDMARK_INK = "public/assets/wordmark-flat-ink.png"  # flat copper-ink, ivory pages
WORDMARK_COPPER = "public/assets/wordmark-flat-copper.png"

MARK_ASPECT = 3.000
MARK_CAP_FRAC = 0.1837
MARK_TM_LEFT = 0.9622
MARK_TM_TOP = 0.3619

COPPER_INK = "#5E3823"
COPPER_LIGHT = "#D9A87A"
COPPER_BRAND = "#B4794F"

# The trademark colour that goes with each asset. A mark placed without reading
# this table is how the metallic lockup ends up on an ivory page.
TM_FOR = {
    WORDMARK_DARK: COPPER_LIGHT,
    WORDMARK_INK: COPPER_INK,
    WORDMARK_COPPER: COPPER_BRAND,
}


# space-6, the page margin and the wordmark clear space, from section 5.
SPACE_6_PX = 64
PX_TO_MM = 25.4 / 96.0        # CSS px, which is what a px rule in a style guide means


def cap_mm(width_mm):
    """Cap height of HUMAN when the mark is rendered this wide."""
    return MARK_CAP_FRAC * width_mm / MARK_ASPECT


def clear_space_mm(width_mm):
    """Clear space on all four sides.

    Section 2 of the v3 brand style: space-6 (64px) OR the cap height of HUMAN,
    whichever is LARGER. Version 2 of this rule was the cap height alone, and for
    a small mark the cap height is the smaller of the two, so taking the maximum
    is what stops a footer mark being crowded.
    """
    return max(SPACE_6_PX * PX_TO_MM, cap_mm(width_mm))


def tm_mm(width_mm):
    """Trademark type size: 0.55 of the cap height, floored at 1.4mm.

    Strict proportion at footer size gives about 0.74mm, roughly 2pt, which does
    not reliably print or show on screen. The floor is deliberate.
    """
    return max(1.4, 0.55 * cap_mm(width_mm))


def mark_css():
    """The rules that place the symbol. Include once per document."""
    return (".mk{position:relative;display:inline-block;line-height:0}"
            ".mk img{width:100%%;display:block}"
            ".mk .tm{position:absolute;left:%.4f%%;top:%.4f%%;line-height:1;"
            "white-space:nowrap}"
            ".tmtext{font-size:0.62em;vertical-align:super;line-height:0}"
            % (MARK_TM_LEFT * 100, MARK_TM_TOP * 100))


def mark(src, width_mm, tm_color=None):
    """The mark with its trademark beside it, as one inline block.

    The symbol is a separate element positioned against the measured end of
    HUMAN BATTERY. Nothing is drawn into the logo file.
    """
    color = tm_color or TM_FOR.get(src, COPPER_INK)
    return ("<span class='mk' style='width:%gmm'>"
            "<img src='%s' alt='The Human Battery Project'>"
            "<span class='tm' style='font-size:%.2fmm;color:%s'>&#8482;</span>"
            "</span>" % (width_mm, src, tm_mm(width_mm), color))


def clear_space_style(width_mm):
    """Padding that satisfies section 2's clear space rule on all four sides."""
    return "padding:%.2fmm" % clear_space_mm(width_mm)


# The first time the programme name appears as text in a document, it carries the
# symbol too. This is the string to use, so no document has to remember.
PROGRAM_NAME_TM = "The Human Battery Project<span class='tmtext'>&#8482;</span>"


# ---------------------------------------------------------------------------
# THE BRAND STYLESHEET
#
# Sections 3, 4 and 5 of docs/brand/HBP-Brand-Style-v3-Dawn.md, in one place so a
# document cannot carry its own idea of the palette or the type.
#
# WHY THE FONTS ARE HERE. Every generator declared Spectral and Archivo and
# neither was installed, so every PDF in this repository was rendering in Georgia
# and Helvetica while claiming the brand faces. The files are now in public/fonts
# and are faced here. Both are SIL Open Font License, as the brand guide records.
# ---------------------------------------------------------------------------

# Section 3, the ivory ground. Documents are ivory; the field is for covers.
T = {
    "surface-page": "#FBF9F5", "surface-raised": "#F4EFE4", "surface-field": "#0E1424",
    "surface-night": "#000000", "ink": "#1A1714", "ink-muted": "#6E655C", "rule": "#E4DED2",
    "copper": "#B4794F", "copper-light": "#D9A87A", "copper-deep": "#7A4A2E",
    "copper-ink": "#5E3823", "copper-mid": "#9C603C", "specular": "#FEFBF6",
    "dawn-deep": "#2E4A6B", "dawn-ember": "#C25A3A", "dawn-amber": "#E8A24A",
    "chart-1": "#BC6630", "chart-2": "#2A78D6", "chart-3": "#1BAF7A",
    "status-good": "#1F6B4A", "status-warn": "#8A5A0F", "status-critical": "#A32E22",
}
# The same names on the field, for anything that sits on indigo.
FIELD = {
    "surface-page": "#0E1424", "surface-raised": "#1C2742", "ink": "#F6F1E7",
    "ink-muted": "#A8A096", "rule": "#2A3550", "chart-1": "#D2732F",
    "chart-2": "#3987E5", "chart-3": "#199E70", "status-good": "#3FA97D",
    "status-warn": "#D9A441", "status-critical": "#E0705E",
}

FONT_DISPLAY = "Michroma, 'Eurostile', sans-serif"
FONT_BODY = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif"
FONT_READING = "Spectral, Georgia, 'Times New Roman', serif"


def font_faces():
    """The three brand faces, from public/fonts. Needs base_url at the repo root."""
    return (
        "@font-face{font-family:'Michroma';src:url('public/fonts/michroma.woff2') format('woff2')}"
        "@font-face{font-family:'Spectral';font-weight:400;font-style:normal;"
        "src:url('public/fonts/spectral-400.ttf') format('truetype')}"
        "@font-face{font-family:'Spectral';font-weight:400;font-style:italic;"
        "src:url('public/fonts/spectral-400-italic.ttf') format('truetype')}"
        "@font-face{font-family:'Spectral';font-weight:600;font-style:normal;"
        "src:url('public/fonts/spectral-600.ttf') format('truetype')}"
        "@font-face{font-family:'Spectral';font-weight:700;font-style:normal;"
        "src:url('public/fonts/spectral-700.ttf') format('truetype')}"
        "@font-face{font-family:'Archivo';font-weight:600;font-style:normal;"
        "src:url('public/fonts/archivo-600.ttf') format('truetype')}"
        "@font-face{font-family:'Archivo';font-weight:700;font-style:normal;"
        "src:url('public/fonts/archivo-700.ttf') format('truetype')}"
    )


def brand_css():
    """Faces, tokens as CSS variables, and the rules that place the mark."""
    ivory = "".join("--%s:%s;" % (k, v) for k, v in T.items())
    return (font_faces()
            + ":root{" + ivory
            + "--font-display:%s;--font-body:%s;--font-reading:%s;" % (FONT_DISPLAY, FONT_BODY, FONT_READING)
            + "--space-1:4px;--space-2:8px;--space-3:16px;--space-4:24px;--space-5:40px;--space-6:64px;"
            + "--radius-none:0px;--radius-sm:4px;--radius-md:10px;}"
            + mark_css())


def cover_mark(width_mm=90.0):
    """The mark as it appears on a dark title page, with its clear space."""
    return ("<div style='text-align:center;%s'>%s</div>"
            % (clear_space_style(width_mm), mark(WORDMARK_DARK, width_mm)))


# THE ONE PLACE THE CLEAR SPACE RULE IS NOT MET, AND WHY.
#
# Section 2 of the v3 brand style sets clear space at space-6 (64px) OR the cap
# height of HUMAN, whichever is larger. For a 26mm footer mark the cap height is
# 1.59mm and space-6 is 16.93mm, so the rule asks for 16.93mm on all four sides.
# The page bottom margin is 14mm. A footer mark cannot satisfy it without either
# dropping the footer mark or growing every page margin, and growing the margin
# reflows and repaginates every document in the set.
#
# The footer mark was asked for directly, so it stays, with the largest clear
# space the margin allows. This is a deviation and it is recorded rather than
# quietly taken. It needs a ruling: grant footer placements an exception, or drop
# footer marks and let the cover mark carry the identity.
FOOTER_CLEAR_MM = 2.5


def footer_mark(width_mm=26.0):
    """The running element for the footer of every ivory page."""
    return ("<div id='footmark' style='padding:%.2fmm 0'>%s</div>"
            % (FOOTER_CLEAR_MM, mark(WORDMARK_INK, width_mm)))


def footer_css(box="bottom-center"):
    """Puts footer_mark() in a page margin box on every page but the cover.

    A margin box lives in the page margin, so this cannot reflow the body and
    cannot change the pagination of a document it is added to.

    The box is a parameter because the tier family already uses bottom-center for
    the page number. Putting the mark there would have silently replaced it, and
    a document that loses its page numbers to a logo is a worse document.
    """
    return ("@page{@%s{content:element(footmark);vertical-align:bottom}}"
            "@page cover{@%s{content:none}}"
            "#footmark{position:running(footmark)}" % (box, box))
