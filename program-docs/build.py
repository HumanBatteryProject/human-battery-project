import os
from pathlib import Path

# Fonts live in the repo, not in whatever sandbox this was first written in.
# Resolved from this file so the builders run from any checkout.
BASE_URL = (Path(__file__).resolve().parent.parent / 'public' / 'fonts').as_uri() + '/'
from weasyprint import HTML

# Build output. Override with HBP_OUT if you want it elsewhere.
OUT = os.environ.get('HBP_OUT', str(Path(__file__).resolve().parent / 'out'))
os.makedirs(OUT, exist_ok=True)

# =====================================================================
# SHARED CONTENT
# =====================================================================

CIRCADIAN_INTRO = """
<p class="lede">Everything in this program depends on this section. If you do nothing else in the first two weeks, do this.</p>
<p>Your body runs on a clock, and the clock is set by light. Morning light tells every cell what time it is. Darkness at night lets the repair cycle run. When the clock is right, food is handled correctly, hormones release on schedule, and sleep does its job. When the clock is wrong, nothing downstream works, no matter how well you eat or train.</p>
<p>The sequence, every day:</p>
<p class="seq">LIGHT → WATER → MOVEMENT → FOOD → MOVEMENT → LIGHT → DARKNESS</p>
"""

# ---------------------------------------------------------------------
# The four questions from docs/HBP-Foundational-Model.md. Every protocol
# element must answer at least one:
#   Q1 efficient mitochondrial ATP production
#   Q2 normal ion gradients and membrane function
#   Q3 communication and coherence between cells, tissues and circadian systems
#   Q4 measurable through validated physiological outcomes
# An element answering none is flagged for review, never silently dropped.
# ---------------------------------------------------------------------
FOUR_Q = {
 "morning": ("Q3, Q4", "Sets the circadian clock every tissue runs on. Sleep timing and light exposure are logged daily."),
 "midday":  ("Q3, Q4", "Holds the clock set. Vitamin D is on the panel and blood pressure is measured at both ends."),
 "sunset":  ("Q3",     "Red light starts melatonin onset, the handover from day signalling to night signalling."),
 "evening": ("Q3",     "Protects that melatonin signal from blue light that would tell the body it is still daytime."),
 "night":   ("Q3, Q4", "Darkness is when repair signalling runs. Sleep timing and regularity are logged daily."),
 "fast":    ("Q1, Q4", "Metabolic flexibility and substrate switching. Fasting glucose, insulin and HbA1c are on the panel."),
}

SECTION_Q = {
 "water":       ("Q2, Q4", "Minerals are the ions the pumps move. Sodium, potassium and RBC magnesium are on the panel."),
 "movement":    ("Q1, Q4", "Builds mitochondrial number and respiratory capacity. VO2max, lactate and grip strength are measured at both ends."),
 "food":        ("Q1, Q2, Q4", "Fuel handling, plus the fatty acids and protein the membranes are built from. Glucose, insulin, HbA1c, Omega-3 Index and albumin are on the panel."),
 "heatcold":    ("Q1",    "Controlled stress that builds mitochondrial capacity. Nothing on our panel isolates it."),
 "sleep":       ("Q3, Q4", "Recovery is when gradients are rebuilt and membranes repaired. Sleep timing and regularity are logged daily."),
 "supplements": ("Q2, Q4", "Substrate for membranes and enzymes. Omega-3 Index, 25-OH vitamin D, RBC magnesium, B12 and ferritin are on the panel."),
}

def q_line(spec):
    q, note = spec
    if q == "none":
        return f'<p class="fourq flagged"><b>Answers none of the four questions.</b> {note}</p>'
    return f'<p class="fourq"><b>Answers {q}.</b> {note}</p>'


def circadian(tier):
    W = {
     "morning": dict(
        h="Go outside as soon as you wake up",
         rider="Barefoot if you can. This is part of the morning light block, not separate from it. We include it because it costs nothing, and because standing on grass keeps people outside for the full time when shoes and a doormat do not. We are not measuring it, and we are not claiming it does anything on its own.",
        why="Your body has a clock inside it. The clock does not know what time it is until it sees the sun. When morning light hits your eyes, it tells every cell in your body that the day has started. That one signal sets up your energy, your hunger, your hormones and your sleep for the whole day. If you skip it, your body runs on the wrong time all day, like a clock that was never set.",
        pro="Outside within 15 minutes of waking, before anything else. Thirty minutes on a clear day, forty-five when it is cloudy. Face east, toward where the sun comes up. Barefoot on grass, dirt or sand the whole time. No sunglasses. No looking through a window. It has to be real outdoor light in your eyes.",
        advanced="Outside within 30 minutes of waking. Twenty minutes on a clear day, forty when cloudy. Face east. Barefoot on the ground the whole time. No sunglasses, no window.",
        intermediate="Outside within 30 minutes of waking. Fifteen minutes minimum, twenty when cloudy. Barefoot on the ground when you can. Face east. No sunglasses.",
        beginner="Outside within 30 minutes of waking up. Fifteen minutes minimum. Sit in a chair if you need to. Shoes and socks off, bare feet on grass, dirt or sand if you have it. Face toward the sun with your eyes open. No sunglasses. Not through a window, not from the car. Outside. Do this before coffee, before food, before your phone. This is the most important fifteen minutes of your entire day.",
     ),
     "midday": dict(
        h="Get sun on your skin in the afternoon",
        why="Morning light sets your clock. Midday sun holds it there. It is also the only time of day your skin can make vitamin D, and sun on bare skin widens your blood vessels, which lowers blood pressure. We measure both at day 0 and day 90.",
        pro="Twenty to forty minutes of sun on as much skin as you can, around noon. Sized to your skin. Never let yourself burn.",
        advanced="Fifteen to thirty minutes of sun on your arms and torso around noon. Fair skin starts at ten minutes and builds up.",
        intermediate="Fifteen minutes of sun on your arms and face in the afternoon. Build up slowly if your skin is fair.",
        beginner="Fifteen minutes outside in the afternoon, somewhere between noon and 3pm. Short sleeves if the weather allows. Sit or walk, either is fine. If your skin is fair, start with ten minutes and build to fifteen. Never burn.",
     ),
     "sunset": dict(
        h="Watch the sun go down",
        why="The light at sunset is red and orange. That color tells your body the day is ending and it is time to start making melatonin, the hormone that makes you sleepy. Seeing the sunset is how your body knows to begin winding down. Skip it and your body does not get the message, and then you are wide awake at midnight wondering why.",
        pro="Outside for the last twenty minutes of light, every day.",
        advanced="Outside for the last fifteen minutes of light.",
        intermediate="Outside for the last fifteen minutes of light.",
        beginner="Fifteen minutes outside as the sun is going down. Look toward the sunset, not straight at the sun. This is the third outdoor block of your day, and it is the one that fixes your sleep.",
     ),
     "evening": dict(
        h="Put on your glasses when the sun goes down",
        why="After sunset, your body expects darkness. Light bulbs and screens give off a blue light that looks like daytime to your brain. Your brain sees it and stops making melatonin, and that is why you cannot fall asleep even when you are tired. Amber or red glasses block the blue. So do warm bulbs and screen filters. It is not about the brightness. It is about the color.",
        pro="Red lenses from sunset, not amber. Every bulb you use after dark is incandescent or a red LED. Screens off after sunset. Candles are the correct evening light.",
        advanced="Amber or red lenses from sunset. Incandescent or red bulbs in every room you use after dark. Screens filtered with Iris and a blue-blocking film.",
        intermediate="Amber lenses from sunset. Bedroom and living room switched to incandescent or red bulbs. Iris on every screen. Film on the TV.",
        beginner="The moment the sun goes down and you come inside, put on your amber glasses. Wear them until you are in bed. Every screen you use at night gets a blue light filter: Iris or f.lux on the computer, night mode on your phone, and a blue-blocking film on the TV. Swap the bulb in your bedroom lamp for a warm or red one this week. Add the living room next month.",
     ),
     "night": dict(
        h="Make the bedroom dark and quiet",
        why="Your body does its repair work while you sleep, and it can only do it in the dark. Even a small light, like a phone screen or a charger glow, can be enough to keep the repair from starting. The phone also keeps your brain on alert, waiting for a buzz. Out of the room means your body can finally switch off.",
        pro="Phone off, not airplane mode. Router off at the breaker. Nothing plugged in within six feet of the bed. Grounding sheet. Blackout. Room at 62 to 65°F.",
        advanced="Phone in airplane mode and out of the bedroom. Router off at the wall. Blackout curtains. Grounding sheet. Room at 65°F.",
        intermediate="Phone out of the bedroom. Router on a timer, off 10pm to 6am.",
        beginner="Your phone sleeps in another room. Starting tonight. Charge it in the kitchen. If you use it as an alarm, buy a ten-dollar alarm clock. Cover any small lights in the room, like the glow on a charger or a TV. As dark as you can get it.",
     ),
     "fast": dict(
        h="Give your body hours with no food",
        why="Every time you eat, your body has to stop what it is doing and deal with the food. If you eat from the minute you wake up until right before bed, your body never gets a break to do repairs. Hours without food, especially overnight, is when the cleanup happens. Late eating is the worst, because your body is trying to wind down and you just handed it a job.",
        pro="Eating window 7am to 1pm. One 24-hour fast per week on a non-lifting day, water and minerals only. Optional 36-hour fast once a month.",
        advanced="Eating window 7am to 3pm. That is a 16-hour fast every night. One 24-hour fast every two weeks on a non-lifting day.",
        intermediate="Eating window 8am to 5pm. A 15-hour fast every night. One 24-hour fast per month once the window is easy.",
        beginner="Month one: nothing to eat for three hours before bed. That is the only rule. Month two: eat between 9am and 7pm, and close the window thirty minutes earlier every two weeks. By day 90 you are eating between 9am and 6pm, and you will not have noticed it happening.",
     ),
    }
    parts = [CIRCADIAN_INTRO]
    for key in ["morning","midday","sunset","evening","night","fast"]:
        b = W[key]
        parts.append(f"""
<h3>{b['h']}</h3>
<p><b>What to do:</b> {b[tier]}</p>
<p class="why"><b>Why:</b> {b['why']}</p>
{('<p class="why">' + b['rider'] + '</p>') if b.get('rider') else ''}
{q_line(FOUR_Q[key])}""")
    parts.append('<div class="rule"><b>The rule that matters most:</b> light before food, every single day. Do not eat until you have been outside.</div>')
    return "\n".join(parts)

def water(tier):
    vol = {"pro":"Four liters minimum, five on sauna and training days.",
           "advanced":"Three liters minimum, four on sauna and training days.",
           "intermediate":"Three liters minimum, more on training days.",
           "beginner":"Three liters. It will feel like a lot at first. Carry a bottle and refill it three times."}[tier]
    return f"""
<h3>The morning glass</h3>
<p>Before coffee, before food, before anything: 16 to 24 oz of mineral water with a pinch of Baja Gold sea salt and 1 to 2 oz of pure organic lemon juice. Empty stomach. It is the first thing the body receives after light.</p>
<h3>Through the day</h3>
<p>{vol} Every bottle gets a pinch of Baja Gold, because water without minerals passes through and takes minerals with it. Most of it before your last meal.</p>
<h3>What to drink</h3>
<p>Crazy Water #4, Saratoga or Icelandic Glacial as bottled water. At home, reverse osmosis with Baja Gold added, a quarter teaspoon per liter. Baja Gold for cooking. Nothing else.</p>
"""

def movement(tier):
    return {
    "pro": """
<h3>Resistance, five days</h3>
<p><b>Day A:</b> weighted pistol squats, weighted pull-ups, weighted dips, Nordic curls. <b>Day B:</b> deadlift, handstand push-ups, weighted rows, farmer carries. <b>Day C:</b> front squat, ring muscle-ups, ring dips, single-leg RDL. <b>Day D:</b> A heavier. <b>Day E:</b> B heavier. Five sets of three to six on the main lifts.</p>
<h3>Zone 2, four sessions of 60 to 90 minutes</h3>
<p>Heart rate at 180 minus your age. Fasted. This is where mitochondria are built and it is non-negotiable.</p>
<h3>Intervals, three sessions, never consecutive</h3>
<p>Norwegian 4×4 twice a week: four minutes at 90 percent, three minutes easy, four rounds. One session of ten 30-second sprints with 90 seconds rest.</p>
<h3>Walking</h3><p>Fifteen minutes after every meal. Twelve thousand steps.</p>
<h3>Grip</h3><p>Dead hangs to failure daily. Farmer carries three times a week.</p>
""",
    "advanced": """
<h3>Resistance, four days</h3>
<p><b>Day A:</b> pistol or weighted squats, weighted dips, pull-ups, Nordic curls. <b>Day B:</b> single-leg deadlift, handstand push-up progression, rows, farmer carries. Days C and D repeat A and B with more volume. Five sets of five to eight. Add load when you clear eight on every set.</p>
<h3>Zone 2, three sessions of 60 minutes</h3>
<p>Heart rate at 180 minus your age. Conversational pace.</p>
<h3>Intervals, twice a week, never consecutive</h3>
<p>Norwegian 4×4. Hill sprints, assault bike or rowing.</p>
<h3>Walking</h3><p>Ten to fifteen minutes after every meal, within twenty minutes of finishing. Ten thousand steps.</p>
<h3>Grip</h3><p>Dead hangs, three sets to failure, three times a week.</p>
""",
    "intermediate": """
<h3>Resistance, three days</h3>
<p>Bodyweight progressions. <b>Squat:</b> bodyweight to goblet to Bulgarian split squat. <b>Push:</b> incline push-up to floor to dips. <b>Pull:</b> band rows to inverted rows to pull-ups. <b>Hinge:</b> band hinge to kettlebell Romanian deadlift. Three sets of eight to twelve. Progress when you clear twelve on all three.</p>
<h3>Zone 2, three sessions of 40 minutes</h3>
<p>Brisk walking, incline treadmill, easy cycling. You can talk.</p>
<h3>Intervals, once a week</h3>
<p>30-20-10: thirty seconds easy, twenty moderate, ten hard, five times through. Rest two minutes. Repeat the block. Twenty minutes total.</p>
<h3>Walking</h3><p>Ten minutes after every meal, fifteen after dinner. Eight thousand steps.</p>
<h3>Grip</h3><p>Dead hangs, three sets to failure, twice a week.</p>
""",
    "beginner": """
<h3>Month one</h3>
<p>Nothing. Light, water and sleep only. You are building the clock first.</p>
<h3>Month two</h3>
<p><b>Walking:</b> ten minutes after dinner every night. After two weeks, after lunch too. After four, after every meal. <b>Resistance, twice a week, ten minutes:</b> sit-to-stand from a chair, wall push-ups, seated band rows, hip hinge with a broomstick. Three sets of what you can do. <b>Steps:</b> your current average plus a thousand.</p>
<h3>Month three</h3>
<p><b>Resistance, three days.</b> Sit-to-stand becomes bodyweight squat. Wall push-up becomes incline push-up on a counter. Band row becomes inverted row under a table. Broomstick hinge becomes kettlebell deadlift. <b>Walking:</b> twenty to thirty minutes after dinner, some of it brisk enough that talking is hard.</p>
<p><b>No intervals before day 60, and only with physician clearance.</b></p>
""",
    }[tier]

def food(tier):
    return {
    "pro": """
<h3>Window: 7am to 1pm</h3>
<p>One large meal or two. One 24-hour fast per week.</p>
<h3>The meal</h3>
<p>Two tins of sardines or 8 oz wild salmon, every day. Grass-fed beef, lamb or liver, 10 to 12 oz. Four pastured eggs. Two cups leafy greens, two cups cruciferous. A fermented vegetable. Extra virgin olive oil, grass-fed butter or tallow. Baja Gold.</p>
<h3>Protein</h3><p>2.2 grams per kilogram of bodyweight, every day, inside the window.</p>
<h3>Out for 90 days</h3>
<p>Gluten, all grains, all legumes, all nightshades, seed oils, sugar, alcohol, all dairy except butter and ghee. Nothing processed. Nothing in a package with more than one ingredient.</p>
""",
    "advanced": """
<h3>Window: 7am to 3pm</h3>
<p>Two meals. No snacks. Nothing after 3pm but water and tea.</p>
<h3>First meal</h3>
<p>A full tin of sardines in olive oil, or three pastured eggs in butter. A full bowl of leafy greens. A serving of fermented vegetable. Olive oil over everything.</p>
<h3>Second meal, by 3pm</h3>
<p>Grass-fed beef, wild salmon or lamb, 8 to 10 oz. Two cups cruciferous vegetables. Avocado or olive oil. Sea salt.</p>
<h3>Every day</h3><p>Sardines or wild salmon. Leafy greens. One fermented food. Eggs four times a week minimum. Liver once a week.</p>
<h3>Protein</h3><p>2 grams per kilogram, every day.</p>
<h3>Out for 90 days</h3>
<p>Gluten, all seed oils, added sugar, alcohol, nightshades, legumes, grains. Dairy limited to grass-fed butter and aged cheese.</p>
""",
    "intermediate": """
<h3>Window: 8am to 5pm</h3>
<p>Three meals or two. No snacks.</p>
<h3>First meal</h3>
<p>Three pastured eggs, or a tin of sardines four days a week. Leafy greens. A forkful of sauerkraut or kimchi. Olive oil or butter.</p>
<h3>Midday</h3>
<p>6 to 8 oz protein: beef, chicken thigh, salmon, lamb. Two cups vegetables, half cruciferous. Sweet potato or white rice, one fist. Olive oil.</p>
<h3>Last meal, by 5pm</h3>
<p>6 oz protein. Vegetables. Avocado.</p>
<h3>Every day</h3><p>Eggs or sardines every morning. Greens every day. Fermented food every day. Salmon or sardines four times a week.</p>
<h3>Protein</h3><p>1.6 grams per kilogram.</p>
<h3>Out for 90 days</h3>
<p>Gluten, seed oils, added sugar, alcohol. Grains limited to white rice and sweet potato. Nightshades stay in.</p>
""",
    "beginner": """
<h3>Month one</h3>
<p>No food rules except one: nothing three hours before bed. If you are eating fast food, you are eating fast food this month. We are building the clock first.</p>
<h3>Month two: the window, and one food a week</h3>
<p>Eating window 9am to 7pm, tightening thirty minutes on the evening side every two weeks. <b>No snacks.</b> Three meals. This one rule does more than any other.</p>
<p><b>Week 5:</b> eggs every morning. <b>Week 6:</b> greens with lunch. <b>Week 7:</b> sardines or salmon three times a week. <b>Week 8:</b> sauerkraut or kimchi with dinner.</p>
<h3>Month three: remove two things</h3>
<p>Gluten and seed oils, starting week 9. That is the only elimination in this tier. Nightshades, grains and legumes stay in.</p>
<h3>Protein</h3><p>Work toward 1.6 grams per kilogram by day 90. Protein first at every meal.</p>
""",
    }[tier]

def heatcold(tier):
    return {
    "pro": """
<h3>Cold, every morning after light</h3><p>Five to eight minutes at 45°F or below. Then the day starts.</p>
<h3>Sauna, every day</h3><p>Two rounds of twenty minutes at 185 to 200°F. Rehydrate with Baja Gold water between rounds.</p>
<h3>Contrast, three times a week</h3><p>Twenty hot, four cold, three rounds.</p>
<div class="rule">Cold never within four hours after resistance training. Morning cold then a lift is fine. Lift then cold is not.</div>
""",
    "advanced": """
<h3>Sauna, five to seven days</h3><p>Traditional sauna at 175 to 195°F, twenty minutes. Two rounds if you have time. Rehydrate with mineral water and Baja Gold.</p>
<h3>Cold, four days</h3><p>Three to five minutes at 50°F or below.</p>
<h3>Contrast, one designated day</h3><p>Sauna then cold, three rounds.</p>
<div class="rule">Cold goes after zone 2, never after resistance training. If you lift in the morning, cold is in the evening or on a non-lifting day.</div>
""",
    "intermediate": """
<h3>Sauna, three days if you have access</h3><p>Gym sauna is fine. Fifteen to twenty minutes.</p>
<h3>Cold</h3><p>Every shower ends with sixty to ninety seconds cold. Full cold. Breathe slowly through your nose. That is the entire cold protocol until day 60. After day 60, add one cold plunge a week if you have access.</p>
""",
    "beginner": """
<h3>Months one and two</h3><p>Nothing.</p>
<h3>Month three</h3><p>The last thirty seconds of every shower, cold. That is the entire cold protocol. Sauna only with physician clearance, fifteen minutes twice a week if you have easy access.</p>
""",
    }[tier]

def sleep(tier):
    base = """
<p>Same bedtime, same wake time, seven days a week. Room cool and completely dark. Last food three hours before bed. Phone out of the bedroom.</p>
"""
    extra = {
     "pro":"<p>Room at 62 to 65°F. Grounding sheet. Mouth tape. Nothing electronic in the room. To the minute, not roughly.</p>",
     "advanced":"<p>Room at 65°F. Grounding sheet. Nasal breathing. If you snore, mouth tape.</p>",
     "intermediate":"<p>Fixed wind-down at 9pm: glasses on, screens off, magnesium taken.</p>",
     "beginner":"<p>Pick a wake time and hold it. That is the only sleep rule in month one, and it is the one that makes everything else possible.</p>",
    }[tier]
    return base + extra

def supplements(tier):
    return {
    "pro": """
<h3>On waking</h3><p>Cowboy Colostrum, 1 scoop in water.</p>
<h3>With the morning glass</h3><p>Spirulina powder (Nutrex Hawaii), 1 tablespoon. Quicksilver Methyl B-Complex, 1 pump. Quicksilver NAD+ Platinum, 1 pump.</p>
<h3>With the meal</h3>
<p>Pure Encapsulations O.N.E. Multivitamin, 1. Pure Encapsulations EPA/DHA Essentials, 2,000 mg EPA+DHA. Vitamin D3/K2 liquid, 5,000 IU, adjusted after labs. Creatine, 5 g. Dragon Herbs Super Adaptogen, 3. He Shou Wu, 3. Deer Antler Drops, 1 dropper, 21 days on 7 off. Cordyceps, 3. Duanwood Reishi, 3. Gaia Daytime HPA, 2. Gaia Turmeric Supreme, 1. Quicksilver Liposomal Glutathione, 1 pump. Life Extension Taurine, 2 g.</p>
<h3>Pre-training</h3><p>Cordyceps, 2 more. Creatine, 5 g more on heavy days.</p>
<h3>Afternoon, empty stomach</h3><p>Dragon Herbs Spring Dragon Longevity Tea. Vital Proteins Collagen, 20 g in the tea with lemon. Goji &amp; Schizandra Drops, 1 dropper. Gaia Daytime HPA, 2.</p>
<h3>Evening, two hours before bed</h3><p>Chlorella powder (Sun Chlorella), 1 tablespoon, alone. Magnesium Glycinate, 400 mg. Glycine, 3 g. l-Theanine, 200 mg. Zinc 30, 1. Gaia Nighttime HPA, 2. Dragon Herbs Lights Out, nightly for two weeks then as needed.</p>
<h3>Three mornings a week</h3><p>Dragon Herbs Tonic Alchemy, 1 scoop, replacing the multivitamin. BioPure Ultra Binder, 1 scoop, an hour away from everything.</p>
<div class="rule">This is the base stack, not the tired stack. If you are still depleted on this, the problem is sleep or overtraining, and the fix is less.</div>
""",
    "advanced": """
<h3>Morning, with the first meal</h3>
<p>Pure Encapsulations O.N.E. Multivitamin, 1. EPA/DHA Essentials, dosed to your Omega-3 Index: under 4% take 2,000 mg, 4 to 6% take 1,500 mg, over 6% take 1,000 mg. Vitamin D3/K2 liquid, 5,000 IU, adjusted after labs. Creatine, 5 g. Dragon Herbs Super Adaptogen, 3. Spirulina powder (Nutrex Hawaii), 1 tablespoon. Cowboy Colostrum, 1 scoop on waking before anything.</p>
<h3>Midday</h3><p>Dragon Herbs Duanwood Reishi, 2. Gaia Turmeric Supreme, 1. Quicksilver Liposomal Glutathione, 1 pump.</p>
<h3>Afternoon, empty stomach</h3><p>Dragon Herbs Spring Dragon Longevity Tea. Vital Proteins Collagen, 20 g in the tea with lemon.</p>
<h3>Evening, two hours before bed</h3><p>Chlorella powder (Sun Chlorella), 1 tablespoon, alone. Magnesium Glycinate, 400 mg. Glycine, 3 g. Gaia Nighttime HPA, 2. Dragon Herbs Lights Out as needed.</p>
<h3>Three mornings a week</h3><p>Dragon Herbs Tonic Alchemy, 1 scoop, in place of the multivitamin.</p>
<h3>If you are training hard and still tired: the Jing stack, 30 days</h3>
<p>Super Adaptogen 3 morning and 3 midday. He Shou Wu, 3 morning. Cordyceps, 2 pre-training. Deer Antler Drops, 1 dropper morning, 21 on 7 off. Gaia Daytime HPA, 2 morning and 2 afternoon. Then back to the base stack.</p>
""",
    "intermediate": """
<h3>Morning</h3>
<p>Pure Encapsulations O.N.E. Multivitamin, 1. Life Extension Super Omega-3, 1,500 mg EPA+DHA if starting under 5%, 1,000 mg above. Vitamin D3/K2, 5,000 IU, adjusted after labs. Creatine, 5 g. Gaia Daytime HPA, 2. Spirulina and chlorella blend powder, 1 tablespoon. Cowboy Colostrum, 1 scoop on waking.</p>
<h3>Afternoon</h3><p>Dragon Herbs Spring Dragon Longevity Tea. Vital Proteins Collagen, 15 g.</p>
<h3>Evening</h3><p>Magnesium Glycinate, 300 mg. Gaia Nighttime HPA, 2. Dragon Herbs Lights Out as needed.</p>
<h3>If tired: the Jing stack</h3><p>Dragon Herbs Super Adaptogen, 3 morning. Gaia Daytime HPA, 2 morning and 2 afternoon. Cordyceps, 2 before training.</p>
""",
    "beginner": """
<h3>Month one: three bottles</h3>
<p>Life Extension Super Omega-3, 2,000 mg EPA+DHA. Your baseline is almost certainly low. Pure Encapsulations Vitamin D3/K2, 5,000 IU. Magnesium Glycinate, 300 mg in the evening.</p>
<p>Nothing else. Three bottles taken every day beats eight bottles abandoned in week three.</p>
<h3>Month two, add</h3><p>Creatine, 5 g morning. Gaia Daytime HPA, 2 morning.</p>
<h3>Month three, add</h3><p>Dragon Herbs Super Adaptogen, 2 morning. Spirulina and chlorella blend, 1 teaspoon morning, building to a tablespoon. Gaia Nighttime HPA, 2 evening. Dragon Herbs Lights Out if sleep is still the problem.</p>
<h3>Days 61 to 90, if exhausted</h3><p>Super Adaptogen, 3 morning. Daytime HPA, 2 morning and 2 afternoon. Cordyceps, 2 morning.</p>
""",
    }[tier]

ENVIRONMENT = """
<table>
<tr><th>Evening glasses</th><td>Ra Optics Sunset (amber) or Night Shift (red). BLUblox Sleep+. TrueDark Twilight. They must block 460 to 490 nm. Ask for the transmission spectrum.</td></tr>
<tr><th>Screens</th><td>Iris (iristech.co) on every computer, Health mode after sunset. f.lux is the free alternative. BlockBlueLight or Ocushield film on monitors. BlockBlueLight filter on the TV.</td></tr>
<tr><th>Bulbs</th><td>Incandescent wherever you can find them. Otherwise BlockBlueLight or Bon Charge red bulbs for evening rooms.</td></tr>
<tr><th>Router</th><td>Mechanical outlet timer, off 10pm to 6am. About twelve dollars.</td></tr>
<tr><th>Grounding</th><td>Earthing.com or Hooga sheet for the bed, mat for the desk. Test your outlet with a three-dollar tester first.</td></tr>
<tr><th>Water</th><td>Crazy Water #4, Saratoga, Icelandic Glacial. APEC or iSpring under-sink RO at home. Baja Gold sea salt.</td></tr>
<tr><th>Sauna</th><td>Gym sauna for most. Sun Home or Almost Heaven barrel for a home unit. Traditional, not infrared.</td></tr>
<tr><th>Cold</th><td>Cold shower to start. Ice Barrel or a chest freezer conversion with a GFCI for a home plunge.</td></tr>
<tr><th>Testing</th><td>OmegaQuant Omega-3 Index kit, day 0 and day 90. Camry grip dynamometer.</td></tr>
</table>
"""

def phases(tier):
    return {
    "pro": [("Days 1 to 30","Full protocol from day one. Establish every baseline: Omega-3 Index, grip, VO₂max, DEXA, CGM for two weeks, daily HRV."),
            ("Days 31 to 60","Progressive overload on every lift. First 36-hour fast in week six. Contrast therapy to three times a week."),
            ("Days 61 to 90","Peak load. CGM back on for the last two weeks. Day 90 draw, same lab, same hour.")],
    "advanced": [("Days 1 to 30","Stop the drain. Sugar, alcohol and seed oils out. Sleep window fixed. Morning light non-negotiable. Log daily."),
                 ("Days 31 to 60","Recharge. Protein target. Full training schedule. Sauna and cold at full frequency. Window at 7am to 3pm."),
                 ("Days 61 to 90","Build capacity. Load goes up. First 24-hour fasts. Day 90 draw.")],
    "intermediate": [("Days 1 to 30","Stop the drain. Morning light, fixed wake time, no snacks, last food three hours before bed. Glasses on in the evening."),
                     ("Days 31 to 60","Recharge. Window to 8am to 5pm. Three resistance days. Cold finish on every shower."),
                     ("Days 61 to 90","Build. Intervals once a week. First cold plunge. Day 90 draw.")],
    "beginner": [("Days 1 to 30","Light and water. Fifteen minutes outside in the morning, fifteen in the afternoon, fifteen at sunset. Glasses on at sundown, screens filtered, phone out of the bedroom. The morning glass and three liters. A fixed wake time. That is everything, and it is more than it sounds."),
                 ("Days 31 to 60","Movement and the window. Walk after dinner. 9am to 7pm window, no snacks. Two ten-minute resistance sessions. One new food a week."),
                 ("Days 61 to 90","Load. Three resistance days. Longer walks. Gluten and seed oils out. Cold finish on the shower. Day 90 draw.")],
    }[tier]

def checklist(tier):
    items = {
    "pro":["Outside within 15 min of waking, 30+ min, barefoot","Morning glass: water, Baja Gold, lemon","Cold plunge 5 to 8 min","Training block","Meal inside 7am to 1pm","Walk after meal","Midday sun 20+ min","Sunset outside","Sauna, two rounds","Red glasses from sunset, screens off","Four liters of water","Phone off, router off, bed at fixed time","Logged"],
    "advanced":["Outside within 30 min of waking, 20+ min, barefoot","Morning glass","Training or zone 2","Both meals inside 7am to 3pm","Walk after each meal","Midday sun","Sunset outside","Sauna or cold","Amber glasses from sunset","Three liters of water","Phone out of room, fixed bedtime","Logged"],
    "intermediate":["Outside within 30 min of waking, 10+ min","Morning glass","Meals inside 8am to 5pm, no snacks","Walk after each meal","Midday sun 10 min","Training or zone 2 or rest day","Cold finish on shower","Amber glasses two hours before bed","Three liters of water","Wind-down at 9pm, phone out of room","Logged"],
    "beginner":["Outside within 30 min of waking, 15 min, barefoot","Morning glass","Fifteen minutes of afternoon sun","Fifteen minutes at sunset","Glasses on when the sun goes down","Screens filtered","Three liters of water","Nothing three hours before bed","Phone out of the bedroom","Same wake time","Logged"],
    }[tier]
    return "".join(f'<li><span class="box"></span>{i}</li>' for i in items)

# =====================================================================
# RENDER
# =====================================================================

CSS = """
@font-face{font-family:'Michroma';src:url('michroma.woff2') format('woff2')}
@font-face{font-family:'Newsreader';src:url('newsreader.woff2') format('woff2');font-weight:200 800}
@page{size:letter;margin:0;@bottom-center{content:counter(page);font-family:'Newsreader';font-size:8pt;color:#6E908C;margin-bottom:12mm}}
*{box-sizing:border-box}
body{margin:0;font-family:'Newsreader',Georgia,serif;font-size:10.2pt;line-height:1.55;color:#13323F}
.page{page-break-after:always;padding:16mm 17mm 18mm}
.page:last-child{page-break-after:auto}
.cover{background:#05090C;color:#ECF3F4;height:279.4mm;width:215.9mm;padding:0 22mm;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.cover img{width:82mm;margin-bottom:12mm}
.cover .t{font-family:'Michroma';font-size:19pt;letter-spacing:.06em;margin-bottom:4mm;color:#fff}
.cover .s{font-family:'Michroma';font-size:8pt;letter-spacing:.24em;color:#2AAFC0}
.cover .rule{width:30mm;height:.5pt;background:#2AAFC0;margin:8mm auto}
.cover .tag{font-family:'Newsreader';font-size:11pt;color:#9FB4B8;font-style:italic;margin-top:10mm}
h1{font-family:'Michroma';font-size:13pt;font-weight:400;margin:0 0 3mm;line-height:1.3;color:#13323F}
h2{font-family:'Michroma';font-size:8.6pt;font-weight:400;letter-spacing:.1em;text-transform:uppercase;margin:0 0 4mm;padding-bottom:1.8mm;border-bottom:.4pt solid #C3CFD0;color:#13323F}
h3{font-family:'Michroma';font-size:7.4pt;font-weight:400;letter-spacing:.05em;margin:4.5mm 0 1.4mm;color:#218BBE}
p{margin:0 0 2.6mm}
.kicker{font-family:'Michroma';font-size:6.4pt;letter-spacing:.22em;color:#6E908C;margin:0 0 3mm}
.lede{font-size:11.4pt;line-height:1.45;color:#0E2530;margin-bottom:4mm}
.seq{font-family:'Michroma';font-size:8pt;letter-spacing:.08em;color:#218BBE;margin:3mm 0 5mm;text-align:center}
.why{font-size:9.6pt;color:#3D5A63;margin-bottom:3.5mm}
.rule{border-left:2px solid #B4653A;padding:2mm 0 2mm 4mm;margin:4mm 0;font-size:9.6pt;color:#3D5A63}
table{width:100%;border-collapse:collapse;margin-top:2mm}
th,td{text-align:left;vertical-align:top;padding:2.2mm 2.4mm;border-bottom:.35pt solid #DCE4E5;font-size:9.2pt}
th{font-family:'Michroma';font-size:6.4pt;letter-spacing:.06em;color:#6E908C;width:26mm;padding-top:2.8mm}
.phase{display:flex;gap:5mm;padding:3mm 0;border-bottom:.35pt solid #DCE4E5}
.phase .d{font-family:'Michroma';font-size:6.8pt;letter-spacing:.06em;color:#218BBE;width:26mm;flex:none;padding-top:.6mm}
.phase p{margin:0;font-size:9.6pt}
ul.check{list-style:none;padding:0;margin:3mm 0 0;columns:2;column-gap:8mm}
ul.check li{font-size:9.4pt;padding:1.6mm 0;break-inside:avoid;display:flex;gap:2.4mm;align-items:flex-start}
.box{width:3.4mm;height:3.4mm;border:.5pt solid #6E908C;border-radius:.6mm;flex:none;margin-top:1mm}
.small{font-size:8.6pt;color:#4E6B72;line-height:1.5}
.tier-pill{display:inline-block;font-family:'Michroma';font-size:7pt;letter-spacing:.12em;padding:1.6mm 3mm;border:.5pt solid #2AAFC0;color:#2AAFC0;border-radius:1mm;margin-bottom:5mm}
"""

TIERS = {
 "pro":("PRO","You are already doing all of it. This is the full stack, sequenced and measured."),
 "advanced":("ADVANCED","You already train and you already do some of this. This closes the gaps and measures what you have been doing on faith."),
 "intermediate":("INTERMEDIATE","You know what you should be doing and you do some of it. This turns sometimes into every day."),
 "beginner":("BEGINNER","You are starting from a stopped engine. One thing a month. By day 90 you will be doing more than you thought possible and it will never have been hard on any single day."),
}

def render_tier(key):
    name, tag = TIERS[key]
    ph = "".join(f'<div class="phase"><div class="d">{d}</div><p>{t}</p></div>' for d,t in phases(key))
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>

<div class="page cover">
  <img src="lockup-dark.png">
  <div class="rule"></div>
  <div class="t">{name}</div>
  <div class="s">NINETY-DAY PROTOCOL</div>
  <div class="tag">{tag}</div>
</div>

<div class="page">
  <div class="kicker">01 &nbsp;/&nbsp; THE CLOCK</div>
  <h1>Circadian protocol</h1>
  <span class="tier-pill">{name}</span>
  {circadian(key)}
</div>

<div class="page">
  <div class="kicker">02 &nbsp;/&nbsp; WATER</div>
  <h1>Water and minerals</h1>
  {water(key)}
{q_line(SECTION_Q["water"])}
  <div class="kicker" style="margin-top:9mm">03 &nbsp;/&nbsp; MOVEMENT</div>
  <h1>Movement</h1>
  {movement(key)}
{q_line(SECTION_Q["movement"])}
</div>

<div class="page">
  <div class="kicker">04 &nbsp;/&nbsp; FOOD</div>
  <h1>Food</h1>
  {food(key)}
{q_line(SECTION_Q["food"])}
  <p class="small" style="margin-top:5mm">The full approved food list, the daily non-negotiables and the cookbook are in the Dietary Guidelines document.</p>
  <div class="kicker" style="margin-top:8mm">05 &nbsp;/&nbsp; HEAT AND COLD</div>
  <h1>Heat and cold</h1>
  {heatcold(key)}
{q_line(SECTION_Q["heatcold"])}
</div>

<div class="page">
  <div class="kicker">06 &nbsp;/&nbsp; SLEEP</div>
  <h1>Sleep</h1>
  {sleep(key)}
{q_line(SECTION_Q["sleep"])}
  <div class="kicker" style="margin-top:9mm">07 &nbsp;/&nbsp; SUPPLEMENTS</div>
  <h1>Supplements</h1>
  {supplements(key)}
{q_line(SECTION_Q["supplements"])}
</div>

<div class="page">
  <div class="kicker">08 &nbsp;/&nbsp; ENVIRONMENT</div>
  <h1>Equipment and sourcing</h1>
  <p class="small">Dr. Pittman takes no commission on anything listed here. These are what he uses.</p>
  {ENVIRONMENT}
</div>

<div class="page">
  <div class="kicker">09 &nbsp;/&nbsp; THE NINETY DAYS</div>
  <h1>Three phases</h1>
  {ph}
  <div class="kicker" style="margin-top:10mm">10 &nbsp;/&nbsp; EVERY DAY</div>
  <h1>Daily checklist</h1>
  <p class="small">This is what goes in the log. Under a minute.</p>
  <ul class="check">{checklist(key)}</ul>
  <div class="rule" style="margin-top:10mm">The Human Battery Project is an educational wellness program, not medical treatment. It does not diagnose or treat any condition and does not replace your physician. Any laboratory result outside the reference range is referred to a physician. If you take prescription medication, review the supplement list with your prescriber before starting. Stop and seek medical care for chest pain, fainting, or any new symptom that concerns you.</div>
</div>

</body></html>"""
    path = f"{OUT}/HBP-Protocol-{name}.pdf"
    HTML(string=html, base_url=BASE_URL).write_pdf(path)
    return path

if __name__ == '__main__':
    from tier_doc import render_tier as _rt
    for k in TIERS:
        print(_rt(k))

# =====================================================================
# DIETARY GUIDELINES — shared across all tiers
# =====================================================================

DIET_HTML = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{CSS}
.food{{display:flex;gap:4mm;padding:2.4mm 0;border-bottom:.35pt solid #DCE4E5}}
.food b{{font-family:'Michroma';font-size:6.6pt;letter-spacing:.05em;color:#218BBE;width:34mm;flex:none;padding-top:.8mm}}
.food p{{margin:0;font-size:9.4pt}}
.tierrow{{display:flex;gap:3mm;margin-top:3mm}}
.tierrow>div{{flex:1;border:.4pt solid #C3CFD0;border-radius:1.5mm;padding:3.2mm 3mm}}
.tierrow h3{{margin:0 0 1.6mm;font-size:6.6pt}}
.tierrow p{{font-size:8.4pt;margin:0;line-height:1.45}}
.no{{color:#B4653A}}
</style></head><body>

<div class="page cover">
  <img src="lockup-dark.png">
  <div class="rule"></div>
  <div class="t">DIETARY GUIDELINES</div>
  <div class="s">ALL TIERS</div>
  <div class="tag">Food is the load. It arrives after light has set the clock. Not before.</div>
</div>

<div class="page">
  <div class="kicker">01 &nbsp;/&nbsp; THE PRINCIPLES</div>
  <h1>How we eat</h1>
  <p class="lede">Protein first. Fat for fuel. Carbohydrates last, and small. Nothing from a package with more than one ingredient. No snacking. And a window, so the body gets hours every day with nothing to process.</p>
  <h3>Light before food</h3>
  <p>You do not eat until you have been outside. Morning light sets the clock. Food arrives after. Every tier, every day, no exceptions.</p>
  <h3>Protein at every meal</h3>
  <p>Build the plate around it. Sardines, eggs, beef, salmon, lamb, liver. The target is 1.6 to 2.2 grams per kilogram of bodyweight depending on your tier, and most people are well under it when they start.</p>
  <h3>Fat is the fuel</h3>
  <p>Extra virgin olive oil, grass-fed butter, tallow, ghee, avocado, the fat in the fish. Not seed oils. Not margarine. Not anything that says vegetable oil.</p>
  <h3>No snacks</h3>
  <p>Two or three meals inside your window. Nothing between them. This one rule does more than any other single change, because every snack restarts the insulin cycle and stops the body from ever getting to the work it does when it is not digesting.</p>
  <h3>The window closes early</h3>
  <p>Your tier sets the hours. Whatever they are, the last meal ends at least three hours before bed. Late eating runs the clock backward.</p>
  <h3>Water with minerals, not with food</h3>
  <p>Three liters a day with Baja Gold in every bottle. Most of it between meals, not during. The morning glass, with lemon, before anything else.</p>
</div>

<div class="page">
  <div class="kicker">02 &nbsp;/&nbsp; EVERY DAY</div>
  <h1>The daily list</h1>
  <p class="small">Once your tier reaches it, these are in every day. They are the foundation the rest is built on.</p>
  <div class="food"><b>Sardines</b><p>The most important food in the program. DHA, calcium, selenium, and almost no mercury. A tin a day. In olive oil, wild-caught, skin and bones on.</p></div>
  <div class="food"><b>Pastured eggs</b><p>Choline, DHA, complete protein. Cooked in butter. Three or four.</p></div>
  <div class="food"><b>Leafy greens</b><p>Kale, chard, arugula, romaine, spinach. A full bowl. Raw with olive oil or wilted in butter.</p></div>
  <div class="food"><b>Fermented vegetable</b><p>Sauerkraut, kimchi. A forkful with a meal. Refrigerated, unpasteurized, nothing added.</p></div>
  <div class="food"><b>Extra virgin olive oil</b><p>The fat that goes on everything. Cold-pressed, in a dark bottle, from a single origin.</p></div>
  <div class="food"><b>Grass-fed butter</b><p>For cooking. Kerrygold is fine.</p></div>
  <div class="food"><b>Baja Gold sea salt</b><p>Minerals, not just sodium. On food and in water.</p></div>
  <div class="food"><b>Wild salmon</b><p>Four times a week minimum. Sockeye or coho. Frozen wild beats fresh farmed.</p></div>
  <div class="food"><b>Cruciferous vegetables</b><p>Broccoli, cauliflower, Brussels sprouts, cabbage. Two cups. Roasted in tallow or steamed with butter.</p></div>
  <div class="food"><b>Avocado</b><p>Half to one a day. Potassium and fat.</p></div>
  <h3 style="margin-top:6mm">Every week</h3>
  <p>Beef liver once. Bone broth twice. Grass-fed beef three times. Lamb once.</p>
</div>

<div class="page">
  <div class="kicker">03 &nbsp;/&nbsp; THE LIST</div>
  <h1>Approved foods</h1>
  <h3>Protein</h3>
  <p>Sardines, wild salmon, mackerel, anchovies, oysters, grass-fed beef, lamb, bison, pastured chicken thigh, pastured eggs, beef liver, bone broth, wild game.</p>
  <h3>Vegetables</h3>
  <p>All leafy greens. Broccoli, cauliflower, Brussels sprouts, cabbage, bok choy. Asparagus, celery, cucumber, zucchini, green beans, artichoke, mushrooms, onion, garlic, leeks, radish, beets, carrots. Fermented: sauerkraut, kimchi, fermented pickles.</p>
  <h3>Fats</h3>
  <p>Extra virgin olive oil, grass-fed butter, ghee, tallow, avocado, avocado oil for high heat, coconut oil, olives, macadamia nuts, walnuts.</p>
  <h3>Fruit</h3>
  <p>Berries, especially blueberries and blackberries. Lemon and lime. Avocado. Seasonal fruit in small amounts, with a meal, never alone.</p>
  <h3>Starch, tier permitting</h3>
  <p>White rice, sweet potato, squash. Intermediate and Beginner only. Advanced and Pro run without starch.</p>
  <h3>Dairy, limited</h3>
  <p>Grass-fed butter and ghee for everyone. Aged hard cheese for Advanced, Intermediate and Beginner. No milk, no yogurt, no soft cheese.</p>
  <h3>Seasoning</h3>
  <p>Baja Gold. Black pepper. Fresh herbs. Ginger, turmeric, cinnamon. Apple cider vinegar. Mustard with no sugar. Coconut aminos.</p>
  <h3>Drinks</h3>
  <p>Mineral water. Coffee, black, before noon. Green tea. Herbal tea. Bone broth. Dragon Herbs Spring Dragon tea in the afternoon.</p>
</div>

<div class="page">
  <div class="kicker">04 &nbsp;/&nbsp; OUT</div>
  <h1>What is out, and why</h1>
  <div class="food"><b class="no">Gluten</b><p>Wheat, barley, rye, and everything made from them. Bread, pasta, cereal, crackers, most sauces. Out for every tier. Beginner from week 9.</p></div>
  <div class="food"><b class="no">Seed oils</b><p>Canola, soybean, corn, sunflower, safflower, cottonseed, grapeseed, rice bran. Read every label. Out for every tier.</p></div>
  <div class="food"><b class="no">Added sugar</b><p>In every form and under every name. Out for every tier.</p></div>
  <div class="food"><b class="no">Alcohol</b><p>Out for ninety days. All of it.</p></div>
  <div class="food"><b class="no">Ultra-processed food</b><p>If it has more than one ingredient and came in a package, it is out.</p></div>
  <div class="food"><b class="no">Nightshades</b><p>Tomato, potato, pepper, eggplant, goji, paprika, cayenne. Out for Pro and Advanced. In for Intermediate and Beginner.</p></div>
  <div class="food"><b class="no">Grains and legumes</b><p>All grains including rice, and all beans, lentils, peanuts, soy. Out for Pro and Advanced. Intermediate and Beginner keep white rice and sweet potato.</p></div>
  <div class="food"><b class="no">Most dairy</b><p>Milk, cream, yogurt, soft cheese, ice cream. Out for every tier. Butter, ghee and aged hard cheese stay in as noted.</p></div>

  <div class="kicker" style="margin-top:9mm">05 &nbsp;/&nbsp; BY TIER</div>
  <h1>Your window and your exclusions</h1>
  <div class="tierrow">
    <div><h3>PRO</h3><p>7am to 1pm. One 24-hour fast weekly. No grains, legumes, nightshades, starch, or dairy except butter and ghee.</p></div>
    <div><h3>ADVANCED</h3><p>7am to 3pm. No grains, legumes, nightshades. Butter and aged cheese only.</p></div>
    <div><h3>INTERMEDIATE</h3><p>8am to 5pm. White rice and sweet potato allowed. Nightshades in.</p></div>
    <div><h3>BEGINNER</h3><p>No window in month one. 9am to 7pm in month two, tightening. Gluten and seed oils out from week 9. Everything else in.</p></div>
  </div>
</div>

<div class="page">
  <div class="kicker">06 &nbsp;/&nbsp; BUILDING A PLATE</div>
  <h1>Meal construction</h1>
  <h3>The formula</h3>
  <p>Protein and fat are most of every meal, roughly 40 percent each. Carbohydrates are the last 20 percent. Protein the size of your palm, or two palms for Pro and Advanced. Fat over everything. Salt.</p>
  <h3>Breakfast, the first meal</h3>
  <p>Sardines straight from the tin with lemon and olive oil, or eggs in butter. Greens on the side. A forkful of sauerkraut. This is the same meal most days and that is the point. Decision fatigue is how programs die.</p>
  <h3>The main meal</h3>
  <p>A large piece of animal protein cooked in tallow or butter. Two cups of vegetables. Avocado. Olive oil finish. Salt.</p>
  <h3>Eating out</h3>
  <p>Steak or fish, vegetables, no sauce, olive oil and lemon on the side. Ask what oil they cook in. If the answer is vegetable oil, order something grilled dry or choose another place.</p>
  <h3>Prep</h3>
  <p>Cook protein for three days at once. Wash and store greens. Keep tins of sardines everywhere. Keep boiled eggs in the fridge. The program fails on Tuesday at 6pm with nothing ready, and prep is the only answer to that.</p>
  <div class="rule" style="margin-top:8mm">The cookbook is built only from the approved list. Twenty recipes at launch, each one logs as a single tap in the portal.</div>
</div>

</body></html>"""

if __name__ == "__main__":
    from diet_doc import diet_doc
    print(diet_doc())

# =====================================================================
# YOUR TESTS, EXPLAINED — shared across all tiers
# =====================================================================

MARKERS = {
 "charge": ("CHARGE", "#218BBE", "How well your body turns fuel into energy", [
  ("Fasting glucose", "The sugar in your blood after not eating overnight.", "It is the baseline. If it is high while you are fasting, your body is having trouble putting fuel away."),
  ("Fasting insulin", "The hormone that moves sugar out of your blood and into your cells.", "This goes up years before glucose does. High insulin means your cells are ignoring the signal, and your body is shouting louder to be heard. It is the earliest warning we have."),
  ("HbA1c", "Your average blood sugar over the last three months.", "One number that shows the whole quarter, not just this morning. Ninety days is exactly one HbA1c cycle, which is why the program is ninety days."),
  ("HOMA-IR", "A calculation from glucose and insulin together.", "It tells us how hard your body is working to keep sugar normal. A high number means the fuel is in the tank but cannot get to the engine."),
  ("Triglycerides", "Fat traveling in your blood.", "When you eat more fuel than you burn, especially sugar, it turns into this. High triglycerides mean the fuel system is overloaded."),
  ("Triglyceride to HDL ratio", "Triglycerides divided by your good cholesterol.", "One of the best simple signs of whether your cells are handling fuel well. Low is good."),
 ]),
 "drain": ("DRAIN", "#6E908C", "What is quietly using up your energy in the background", [
  ("hs-CRP", "A protein your liver makes when there is inflammation anywhere in the body.", "This is the main drain marker. Inflammation is like an app running in the background on your phone. You did not open it, but it is using battery all day."),
  ("GGT", "A liver enzyme.", "It rises when the liver is stressed by alcohol, sugar, or oxidative load. It is one of the earliest signs the drain is on."),
  ("ALT", "A liver enzyme.", "Tells us whether the liver, your main fuel-processing organ, is under strain."),
  ("AST", "A liver and muscle enzyme.", "Read alongside ALT. Together they show whether the liver is keeping up."),
  ("Uric acid", "A waste product from breaking down certain foods and from fructose.", "High uric acid tracks with high sugar intake and with inflammation. It is a drain marker that moves fast when the diet changes."),
  ("White blood cell count", "The number of immune cells in your blood.", "Slightly high all the time means the immune system never gets to rest. That is a constant, quiet drain."),
  ("Homocysteine", "An amino acid that builds up when your B vitamins are low or not working.", "High homocysteine is hard on blood vessels and points to a methylation problem, which affects how your cells repair."),
  ("AA to EPA ratio", "The balance between an inflammatory fat and an anti-inflammatory fat in your cells.", "This is the fat side of the drain. It comes from what you eat, and it moves when you eat sardines instead of seed oils."),
  ("Kynurenine to tryptophan ratio", "How much of an important amino acid is being burned up by inflammation.", "When inflammation is high, your body diverts tryptophan away from where it should go. This ratio shows the diversion. It also connects to some of the newest research in the model."),
 ]),
 "output": ("OUTPUT", "#2AAFC0", "How much power you can actually spend", [
  ("TSH", "The signal your brain sends to your thyroid.", "The thyroid sets the speed of every cell. TSH tells us if the brain is having to shout to get it going."),
  ("Free T3", "The active thyroid hormone.", "This is the one your cells actually use. Low free T3 feels like cold hands, slow thinking, and no drive, even when TSH looks fine."),
  ("Free T4", "The storage form of thyroid hormone.", "Your body converts T4 to T3. Reading both tells us if the conversion is working."),
  ("Total testosterone", "The main drive and repair hormone, in both men and women.", "Low testosterone feels like no motivation, slow recovery, and no strength gains. Scored against your own sex's range."),
  ("Free testosterone", "The testosterone that is actually available to your cells.", "Total can look fine while free is low. This is the number that matches how you feel."),
  ("DHEA-S", "A hormone from the adrenal glands that your body makes other hormones from.", "It is a reserve measure for the whole hormone system. It drops with age and with chronic stress."),
  ("Morning cortisol", "Your main stress hormone, measured when it should be highest.", "Cortisol should be high in the morning and fall through the day. Too low in the morning means the system is worn down. Drawn at the same hour both times because it changes across the morning."),
  ("IGF-1", "A growth and repair signal.", "Tells us how well your body is rebuilding. Too low means slow repair. Too high is not the goal either."),
  ("SHBG", "A protein that binds hormones and controls how much is free.", "It explains the gap between total and free testosterone, and it moves with insulin, so it connects Output back to Charge."),
 ]),
 "reserve": ("RESERVE", "#157A5C", "What your batteries are built from", [
  ("Omega-3 Index", "The percentage of your red blood cell membranes made of EPA and DHA.", "Required at day 0 and day 90. DHA is what the membranes that receive the light signal are built from, the retina most of all. Low DHA means the signal lands on a degraded receiver. This is the most responsive marker on the panel and the most direct check on whether the protocol is working. Done at home with a finger prick, not at the lab."),
  ("25-OH vitamin D", "The storage form of vitamin D.", "The direct readout on the sun protocol. Almost everyone starts low. It affects immune function, hormones, and mood."),
  ("Ferritin", "Your stored iron.", "Too low means the batteries cannot carry oxygen well. Too high can mean inflammation. Read together with iron saturation."),
  ("Iron saturation", "How much of your iron-carrying protein is actually carrying iron.", "Ferritin tells us the stockpile. Saturation tells us what is in use. You need both to know the real story."),
  ("Vitamin B12", "A vitamin your nerves and red blood cells depend on.", "Low B12 feels like fatigue and fog and tingling. It is common in people who do not eat much animal protein."),
  ("Folate", "A B vitamin that works with B12 for repair and methylation.", "Read with B12 and homocysteine. The three together show whether the repair system has what it needs."),
  ("RBC magnesium", "Magnesium inside your red blood cells, not just in the blood around them.", "Regular serum magnesium is almost always normal, even when you are low. This is the honest version. Magnesium runs hundreds of the reactions that make and use energy."),
  ("Albumin", "The main protein in your blood.", "A simple measure of whether you have enough protein and whether your liver is making it. Low albumin means the raw material is short."),
  ("HDL", "The good cholesterol.", "It is protective, and it is in Reserve because it is a marker of what your body has to work with, not a drain."),
 ]),
}

FUNCTIONAL = [
 ("VO₂max", "How much oxygen your body can take in and use when you are working as hard as you can.", "This is the Charge test that blood cannot show. Oxygen is the last step of the reaction that builds the voltage in every cell. VO₂max is the ceiling on that reaction for your whole body, and it is the strongest predictor of how long people live that exists. A lab test with a mask is best. A step test at home works if you do it the same way both times."),
 ("Grip strength", "How hard you can squeeze.", "It is a stand-in for total body strength and it predicts health outcomes surprisingly well. Measured with a small device you squeeze three times. Takes one minute."),
 ("Resting heart rate", "How fast your heart beats when you are completely at rest.", "Lower usually means a stronger, more efficient system. Take it first thing in the morning, before you get up."),
 ("Blood pressure", "The force of blood against your artery walls.", "Read at the same time of day. It responds to sun, sleep, minerals and cold faster than almost anything else on this list."),
]

DRAW_RULES = [
 ("Fast for 12 hours", "Nothing but water from the night before. Coffee counts as food for this. The morning glass with lemon and salt is fine."),
 ("Same time of morning, both draws", "Between 7 and 9am. Cortisol and testosterone both change across the morning, and a 7am draw compared to an 11am draw shows a change that is not real."),
 ("No alcohol for 48 hours", "It moves the liver enzymes and triglycerides."),
 ("No hard training for 24 hours", "It moves AST, CRP, and cortisol."),
 ("Drink your water", "Dehydration makes several markers read high. Have your morning glass and a full bottle before the draw."),
 ("Same lab, both times", "Different labs use different machines and reference ranges. Day 0 and day 90 must come from the same place."),
]

if __name__ == '__main__':
    from tests_doc import tests_doc
    print(tests_doc())
