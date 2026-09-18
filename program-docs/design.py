import math
# Shared design pieces for every Human Battery PDF.
# Inline SVG only, brand palette only, no raster, no stock.

BLUE, TEAL, GREEN, STEEL, COPPER, NAVY, ICE = "#218BBE", "#2AAFC0", "#157A5C", "#6E908C", "#B4653A", "#13323F", "#ECF3F4"

EXTRA_CSS = """
.divider{background:#05090C;color:#ECF3F4;height:279.4mm;width:215.9mm;padding:22mm 20mm;display:flex;flex-direction:column;justify-content:space-between}
.divider .k{font-family:'Michroma';font-size:8pt;letter-spacing:.3em}
.divider h1{color:#fff;font-size:22pt;line-height:1.25;margin:0}
.divider .d{font-size:13pt;color:#9FB4B8;margin-top:5mm;max-width:130mm;line-height:1.45}
.divider svg{width:150mm;height:auto;margin:0 auto}
.divider .n{font-family:'Michroma';font-size:60pt;color:#13323F;line-height:1}
.band{height:3mm;border-radius:2mm;margin:0 0 6mm}
.card{display:flex;gap:3.5mm;padding:2.4mm 0;border-bottom:.35pt solid #DCE4E5;page-break-inside:avoid}
.card .dot{width:8mm;height:8mm;border-radius:50%;flex:none;margin-top:.5mm;display:flex;align-items:center;justify-content:center;font-family:'Michroma';font-size:6.2pt;color:#fff}
.card .body{flex:1}
.card b{font-family:'Michroma';font-size:6.9pt;letter-spacing:.05em;color:#13323F;display:block;margin-bottom:1mm}
.card p{margin:0 0 .8mm;font-size:9pt;line-height:1.45}
.card i{font-style:normal;font-family:'Michroma';font-size:5.8pt;letter-spacing:.06em}
.tile{border:.4pt solid #C3CFD0;border-left:2.5mm solid #218BBE;border-radius:1.5mm;padding:3.5mm 4mm 3.5mm 5mm;margin:2.5mm 0;page-break-inside:avoid}
.tile h3{margin:0 0 1.5mm;color:#13323F}
.tile p{margin:0 0 1mm;font-size:9.2pt;line-height:1.48}
.tile.soft{background:rgba(33,139,190,.05)}
.grid2{display:flex;gap:3mm}
.grid2>div{flex:1}
.chips{display:flex;flex-wrap:wrap;gap:1.6mm;margin:2mm 0}
.chip{font-size:8.6pt;padding:1.4mm 2.6mm;border-radius:10mm;border:.4pt solid #C3CFD0;color:#13323F}
.chip.no{border-color:#B4653A;color:#B4653A}
.chip.yes{border-color:#157A5C;color:#157A5C}
.tierrow{display:flex;gap:3mm;margin-top:3mm}
.tierrow>div{flex:1;border-radius:1.5mm;padding:3.2mm 3mm;color:#fff}
.tierrow h3{margin:0 0 1.6mm;font-size:6.6pt;color:#fff}
.tierrow p{font-size:8.2pt;margin:0;line-height:1.42;color:rgba(255,255,255,.92)}
.why{font-size:9.2pt;color:#3D5A63;margin-bottom:3.2mm}
.stepnum{font-family:'Michroma';font-size:14pt;color:#218BBE;width:12mm;flex:none;line-height:1}
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

def supplements(c=GREEN, c2=BLUE):
    caps = "".join(f'<g transform="translate({80+i*60},{95}) rotate({-25+i*12})"><rect x="-22" y="-9" width="44" height="18" rx="9" fill="none" stroke="{c}" stroke-width="2.5"/><path d="M0 -9 v18" stroke="{c}" stroke-width="2"/><rect x="-22" y="-9" width="22" height="18" rx="9" fill="{c if i%2 else c2}" opacity=".55"/></g>' for i in range(5))
    return f"""<svg viewBox="0 0 400 220" xmlns="http://www.w3.org/2000/svg">
{caps}
<g fill="none" stroke="{c}" stroke-width="2.5"><path d="M175 150 h50 v45 a6 6 0 0 1 -6 6 h-38 a6 6 0 0 1 -6 -6 z M185 150 v-10 h30 v10"/></g>
<text x="200" y="215" text-anchor="middle" font-family="Michroma" font-size="8" fill="{c}" letter-spacing="2">DOSED TO YOUR LABS</text>
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
