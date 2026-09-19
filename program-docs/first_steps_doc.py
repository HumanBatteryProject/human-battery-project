"""Your First Steps, one per tier.

The document a client gets the day they are accepted, before they pay.
Item one is the Omega-3 kit because it is the longest lead item on the
list: the kit ships out, the drop is collected, the card posts back, and
the lab processes it. Everything else can be done in a week.

The gate before day 1 is that the card is in the mail, not that the
result is back. The dried blood spot fixes the sample at collection.
"""
from weasyprint import HTML
import build as B
import design as D

KIT_PRICE = "$109.95"
KIT_NAME = "Omega-3 Index Complete Test"

# What day 1 actually looks like, in the client's own tier.
DAY_ONE = {
 "pro": """<p>Outside within 15 minutes of waking, before anything else. Thirty minutes on a clear day, forty-five when it is cloudy. Face east. Barefoot on the ground the whole time.</p>
<p>Then the morning glass. Then train. Your eating window opens at 7am and closes at 1pm.</p>
<p>Sun on your skin around noon. Outside again for the last twenty minutes of light. Red lenses from sunset. Bedroom dark, cool and quiet.</p>""",
 "advanced": """<p>Outside within 30 minutes of waking. Twenty minutes on a clear day, forty when cloudy. Face east. Barefoot on the ground.</p>
<p>Then the morning glass. Your eating window opens at 7am and closes at 3pm.</p>
<p>Sun on your skin around noon. Outside for the last fifteen minutes of light. Amber or red lenses from sunset. Bedroom dark and cool.</p>""",
 "intermediate": """<p>Outside within 30 minutes of waking. Fifteen minutes minimum, twenty when cloudy. Face east. Barefoot on the ground when you can.</p>
<p>Then the morning glass. Your eating window is 8am to 5pm.</p>
<p>Fifteen minutes of sun on your arms and face in the afternoon. Outside for the last fifteen minutes of light. Amber lenses from sunset.</p>""",
 "beginner": """<p>Go outside within 30 minutes of waking up. Fifteen minutes. Sit in a chair if you need to. Shoes and socks off, bare feet on grass, dirt or sand if you have it. Face toward the sun with your eyes open. No sunglasses.</p>
<p>Then drink the morning glass. Water, a pinch of salt, some lemon.</p>
<p>Fifteen minutes outside again in the afternoon. Fifteen minutes more as the sun goes down.</p>
<p>When the sun is down, put your amber glasses on and keep them on until bed. Nothing to eat for three hours before you sleep.</p>
<p>That is the whole of month one. Light and water. Nothing else changes yet.</p>""",
}

STEPS = [
 ("Order your Omega-3 kit today",
  f"""<p>Go to <b>omegaquant.com</b>. Order the <b>{KIT_NAME}</b>. It costs {KIT_PRICE}. You order it yourself and it comes to you.</p>
<p>Do this first. Do it today. It takes the longest of anything on this list. The kit takes three to five days to reach you. Then you mail it back. Then the lab runs it. Allow two to four weeks from ordering to result. Everything else here takes a week at most.</p>
<p><b>Buy two at once.</b> They are $93.46 each if you buy two or more. You need one now and one at day 90, so buying both saves you about $33 and the second one is already in your drawer when day 90 comes.</p>
<p><b>Get Complete, not Basic.</b> Basic is cheaper and only gives one number. Complete also gives the AA to EPA ratio, which is on your panel and is hard to get anywhere else. Saving fifty dollars here costs you a marker.</p>"""),
 ("Book your blood test",
  """<p>Go to <b>anylabtestnow.com</b>. Find the one nearest you and book it yourself. You do not need to see a doctor first.</p>
<p><b>Do not eat for 12 hours before. Go in the morning.</b> Water is fine. Some of these numbers move as the day goes on, so a test at 11am does not match a test at 7am. Pick a morning time. Book the same time again at day 90.</p>
<p>Your tier document lists what to ask for. Take the list with you.</p>"""),
 ("Prick your finger and mail the card",
  """<p>When the kit comes, prick your finger, put the drop on the card, and mail it the same day. The envelope is already paid for.</p>
<p><b>This is the one that decides whether you can start.</b> The card has to be in the mail before day 1. The result comes back in your first two weeks and that is fine. The drop is fixed the moment you take it, so a result that shows up later is still your day 0 number.</p>
<p>Tell us when it is in the mail. There is a button in your portal.</p>"""),
 ("Read your protocol once",
  """<p>It is in your portal under Program. Read it once. Do not try to learn it. You are not starting yet.</p>
<p>Every day has the same shape: light, water, moving, food, moving, light, dark. Your tier sets how much. It does not change the order.</p>"""),
 ("Get a few things",
  """<p>Amber or red glasses for after dark. Baja Gold sea salt. A water bottle you will actually use. That is enough to begin.</p>
<p>The full list is in your tier document. Only the glasses are urgent.</p>"""),
 ("Put the weekly call in your calendar",
  """<p>One hour. Everyone together. Every week. The day, the time and the link are in your portal under Calls.</p>
<p>You can send a question before the call and it gets answered first.</p>"""),
]

def render(key):
    name, tag = B.TIERS[key]
    def cards(lo, hi):
        return "".join(
            f'<div class="card"><div class="n">{i+1}</div><div><h3>{h}</h3>{body}</div></div>'
            for i, (h, body) in enumerate(STEPS) if lo <= i < hi)
    steps_now, steps_week = cards(0, 3), cards(3, 6)

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{B.CSS}{D.EXTRA_CSS}
h3{{color:#218BBE;margin-bottom:2mm}}
.card{{display:grid;grid-template-columns:12mm 1fr;gap:4mm;margin-bottom:7mm}}
.card .n{{font-family:'Michroma';font-size:16pt;color:#218BBE;line-height:1}}
.gate{{border-left:2pt solid #B4653A;padding-left:4mm;margin-top:6mm}}
</style></head><body>

<div class="page cover">
  <img src="lockup-dark.png">
  <div class="rule"></div>
  <div class="t">Your First Steps</div>
  <div class="s">BEFORE DAY ONE</div>
  <div class="tag">{tag}</div>
</div>

<div class="page">
  {D.band(D.BLUE)}
  <div class="kicker">START HERE</div>
  <h1>Three things to do today</h1>
  <p>You do not start the protocol yet. These are the things that have to be true before day 1. The first one is the one that takes longest, so it goes first.</p>
  {steps_now}
</div>

<div class="page">
  {D.band(D.BLUE)}
  <div class="kicker">THEN THESE</div>
  <h1>Three things for this week</h1>
  <p>None of these are urgent. Do them before day 1 and you will be ready.</p>
  {steps_week}
</div>

<div class="page">
  {D.band(D.COPPER)}
  <div class="kicker" style="color:#B4653A">THE ONE THAT GATES DAY ONE</div>
  <h1>Why the kit comes first</h1>
  <p>The Omega-3 Index moves more than anything else we measure. Red cell walls rebuild over about four months, so ninety days is long enough to change it and short enough that the change is yours.</p>
  <p>That only works if we have a day 0 number to compare against. Start without one and it is gone. No test later brings it back.</p>
  <div class="gate">
    <p><b>Mailed, not answered.</b> What has to be true before day 1 is that the card is in the mail. Not that the result is back. The result comes in your first two weeks and that is fine.</p>
    <p><b>If it is not mailed in time</b>, your portal offers to move your start to the next date. You lose nothing and it costs nothing. Take the offer. It beats starting blind.</p>
    <p><b>If you start without it anyway</b>, you can still take the drop in your first two weeks and it counts. We store the day you took it, so your day 90 comparison says which day it was instead of pretending it was day 0.</p>
  </div>
</div>

<div class="page">
  {D.band(D.TEAL)}
  <div class="kicker" style="color:#2AAFC0">DAY ONE</div>
  <h1>What the first day looks like</h1>
  <span class="tier-pill">{name}</span>
  {DAY_ONE[key]}
  <div class="rule" style="margin-top:7mm"><b>The rule that matters most:</b> light before food, every single day. Do not eat until you have been outside.</div>
</div>

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
  <p class="small" style="margin-top:6mm">Questions before you start: admin@thehumanbatteryproject.com</p>
</div>

</body></html>"""
    path = f"{B.OUT}/HBP-First-Steps-{name}.pdf"
    HTML(string=html, base_url=B.BASE_URL).write_pdf(path)
    return path

if __name__ == "__main__":
    for k in B.TIERS:
        print(render(k))
