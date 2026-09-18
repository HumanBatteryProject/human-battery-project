from weasyprint import HTML
import build as B
import design as D

SECTIONS = [
    # key, kicker, color, title, description, illustration
    ("circ",  "01 / THE CLOCK",      D.TEAL,   "Circadian protocol",  "Everything in this program depends on this section. If you do nothing else in the first two weeks, do this.", D.sun),
    ("water", "02 / WATER",          D.BLUE,   "Water and minerals",  "The morning glass first. Then three liters, every bottle with minerals in it.", D.water),
    ("move",  "03 / MOVEMENT",       D.BLUE,   "Movement",            "Four patterns. Walks after every meal. Zone 2 for the mitochondria, intervals for the ceiling.", D.movement),
    ("food",  "04 / FOOD",           D.GREEN,  "Food",                "Protein first, fat for fuel, inside a window that closes early. The full list is in the Dietary Guidelines.", D.food),
    ("heat",  "05 / HEAT AND COLD",  D.COPPER, "Heat and cold",       "Stress that builds capacity. Dosed to your tier, timed away from your lifts.", D.heatcold),
    ("sleep", "06 / SLEEP",          D.TEAL,   "Sleep",               "Same time, every night. Dark, cool, nothing plugged in.", D.sleep),
    ("supp",  "07 / SUPPLEMENTS",    D.GREEN,  "Supplements",         "Dosed to your labs, not to a label. No commission on any of it.", D.supplements),
    ("env",   "08 / ENVIRONMENT",    D.TEAL,   "Equipment and sourcing", "Glasses, bulbs, a router timer, water, and where to get each one.", D.environment),
    ("days",  "09 / THE NINETY DAYS", D.BLUE,  "Three phases",        "Stop the drain. Recharge. Build. Measured at both ends.", D.ninety),
    ("check", "10 / EVERY DAY",      D.NAVY,   "Daily checklist",     "This is what goes in the log. Under a minute.", D.checklist),
]

def render_tier(key):
    name, tag = B.TIERS[key]
    ph = "".join(f'<div class="phase"><div class="d">{d}</div><p>{t}</p></div>' for d, t in B.phases(key))
    body = {
        "circ":  B.circadian(key),
        "water": B.water(key),
        "move":  B.movement(key),
        "food":  B.food(key) + '<p class="small" style="margin-top:4mm">The full approved food list, the daily non-negotiables and how to build a plate are in the Dietary Guidelines document.</p>',
        "heat":  B.heatcold(key),
        "sleep": B.sleep(key),
        "supp":  B.supplements(key),
        "env":   '<p class="small">Dr. Pittman takes no commission on anything listed here. These are what he uses.</p>' + B.ENVIRONMENT,
        "days":  ph,
        "check": f'<ul class="check">{B.checklist(key)}</ul>',
    }
    pages = ""
    for n, (k, kick, color, title, desc, svg) in enumerate(SECTIONS, start=1):
        pages += D.divider(kick, color, title, desc, svg(), str(n))
        pages += f'<div class="page">{D.band(color)}<div class="kicker" style="color:{color}">{kick}</div><h1>{title}</h1><span class="tier-pill">{name}</span>{body[k]}</div>'

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{B.CSS}{D.EXTRA_CSS}
h3{{color:#218BBE}}
.rule{{border-left:2px solid #B4653A}}
</style></head><body>
<div class="page cover">
  <img src="lockup-dark.png">
  <div class="rule"></div>
  <div class="t">{name}</div>
  <div class="s">NINETY-DAY PROTOCOL</div>
  <div class="tag">{tag}</div>
</div>
{pages}
<div class="page">
  {D.band(D.NAVY)}
  <div class="kicker">THE HONEST PART</div>
  <h1>What this is, and is not</h1>
  <p>The Human Battery Project is an educational wellness program, not medical treatment. It does not diagnose or treat any condition and does not replace your physician.</p>
  <p>Any laboratory result outside the reference range is referred to a physician. Every time.</p>
  <p>If you take prescription medication, review the supplement list and any change to your eating window with your prescriber before starting. Never adjust a medication on your own because of anything in this document.</p>
  <p>Stop and seek medical care for chest pain, fainting, shortness of breath at rest, or any new symptom that concerns you.</p>
  <p>Never manipulate potassium or other electrolytes to try to change your body's charge. Balance and correction of a genuine deficiency only.</p>
  <div class="rule" style="margin-top:8mm"><b>We do not promise outcomes.</b> We measure at both ends and show you exactly what changed.</div>
</div>
</body></html>"""
    path = f"{B.OUT}/HBP-Protocol-{name}.pdf"
    HTML(string=html, base_url="/home/claude/hbp-tierdocs/").write_pdf(path)
    return path

if __name__ == "__main__":
    for k in B.TIERS:
        print(render_tier(k))
