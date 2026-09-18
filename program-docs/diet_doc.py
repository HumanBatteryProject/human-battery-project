from weasyprint import HTML
import build as B
import design as D

def diet_doc():
    C = D.GREEN
    daily = [
        ("Sardines", "The most important food in the program. DHA, calcium, selenium, and almost no mercury.", "A tin a day. In olive oil, wild-caught, skin and bones on."),
        ("Pastured eggs", "Choline, DHA, complete protein.", "Three or four, cooked in butter."),
        ("Leafy greens", "Kale, chard, arugula, romaine, spinach.", "A full bowl. Raw with olive oil or wilted in butter."),
        ("Fermented vegetable", "Sauerkraut, kimchi.", "A forkful with a meal. Refrigerated, unpasteurized, nothing added."),
        ("Extra virgin olive oil", "The fat that goes on everything.", "Cold-pressed, dark bottle, single origin."),
        ("Grass-fed butter", "For cooking.", "Kerrygold is fine."),
        ("Baja Gold sea salt", "Minerals, not just sodium.", "On food and in every bottle of water."),
        ("Wild salmon", "Sockeye or coho.", "Four times a week minimum. Frozen wild beats fresh farmed."),
        ("Cruciferous vegetables", "Broccoli, cauliflower, Brussels sprouts, cabbage.", "Two cups. Roasted in tallow or steamed with butter."),
        ("Avocado", "Potassium and fat.", "Half to one a day."),
    ]
    out = [
        ("Gluten", "Wheat, barley, rye, and everything made from them. Bread, pasta, cereal, crackers, most sauces.", "Every tier. Beginner from week 9."),
        ("Seed oils", "Canola, soybean, corn, sunflower, safflower, cottonseed, grapeseed, rice bran. Read every label.", "Every tier."),
        ("Added sugar", "In every form and under every name.", "Every tier."),
        ("Alcohol", "All of it.", "Ninety days, every tier."),
        ("Ultra-processed food", "If it has more than one ingredient and came in a package.", "Every tier."),
        ("Nightshades", "Tomato, potato, pepper, eggplant, goji, paprika, cayenne.", "Out for Pro and Advanced. In for Intermediate and Beginner."),
        ("Grains and legumes", "All grains including rice, and all beans, lentils, peanuts, soy.", "Out for Pro and Advanced. Intermediate and Beginner keep white rice and sweet potato."),
        ("Most dairy", "Milk, cream, yogurt, soft cheese, ice cream.", "Every tier. Butter, ghee and aged hard cheese stay in."),
    ]
    principles = [
        ("Light before food", "You do not eat until you have been outside.", "Morning light sets the clock. Food arrives after. Every tier, every day, no exceptions."),
        ("Protein at every meal", "Build the plate around it. Sardines, eggs, beef, salmon, lamb, liver. About 40 percent of what you eat.", "The target is 1.6 to 2.2 grams per kilogram depending on your tier, and most people are well under it when they start."),
        ("Fat is the fuel", "Extra virgin olive oil, grass-fed butter, tallow, ghee, avocado, the fat in the fish. About 40 percent of what you eat.", "Not seed oils. Not margarine. Not anything that says vegetable oil."),
        ("Carbohydrates are the smallest part", "Vegetables, and for the lower tiers a fist of white rice or sweet potato. About 20 percent of what you eat.", "Vegetables are on the plate for what they carry, not for bulk. The fuel comes from fat and protein."),
        ("No snacks", "Two or three meals inside your window. Nothing between them.", "Every snack restarts the insulin cycle and stops the body from ever getting to the work it does when it is not digesting. This one rule does more than any other."),
        ("The window closes early", "Your tier sets the hours. The last meal ends at least three hours before bed.", "Late eating runs the clock backward."),
        ("Water with minerals, not with food", "Three liters a day with Baja Gold in every bottle. Most of it between meals.", "The morning glass, with lemon, before anything else."),
    ]
    build_plate = [
        ("The formula", "Protein and fat are most of every meal, roughly 40 percent each. Carbohydrates are the last 20 percent: vegetables, and for Intermediate and Beginner, one fist of starch at the midday meal. Protein the size of your palm, two palms for Pro and Advanced. Fat over everything. Salt."),
        ("The first meal", "Sardines straight from the tin with lemon and olive oil, or eggs in butter. Greens on the side. A forkful of sauerkraut. This is the same meal most days and that is the point. Decision fatigue is how programs die."),
        ("The main meal", "A large piece of animal protein cooked in tallow or butter. Two cups of vegetables. Avocado. Olive oil finish. Salt."),
        ("Eating out", "Steak or fish, vegetables, no sauce, olive oil and lemon on the side. Ask what oil they cook in. If the answer is vegetable oil, order something grilled dry or choose another place."),
        ("Prep", "Cook protein for three days at once. Wash and store greens. Keep tins of sardines everywhere. Boiled eggs in the fridge. The program fails on Tuesday at 6pm with nothing ready, and prep is the only answer to that."),
    ]

    pr = "".join(D.card(i, C, t, w, y) for i, (t, w, y) in enumerate(principles))
    dl = "".join(D.card(i, C, t, w, y, ("WHAT", "HOW MUCH")) for i, (t, w, y) in enumerate(daily))
    ou = "".join(D.card(i, D.COPPER, t, w, y, ("WHAT", "WHO")) for i, (t, w, y) in enumerate(out))
    bp = "".join(D.card(i, D.BLUE, t, w, None) for i, (t, w) in enumerate(build_plate))

    def chips(items, cls=""):
        return '<div class="chips">' + "".join(f'<span class="chip {cls}">{x}</span>' for x in items) + '</div>'

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{B.CSS}{D.EXTRA_CSS}</style></head><body>

<div class="page cover">
  <img src="lockup-dark.png">
  <div class="rule"></div>
  <div class="t">DIETARY GUIDELINES</div>
  <div class="s">ALL TIERS</div>
  <div class="tag">Food is the load. It arrives after light has set the clock. Not before.</div>
</div>

{D.divider("01", C, "How we eat", "Protein first. Fat for fuel. Carbohydrates last, and small. Nothing from a package with more than one ingredient. No snacking. And a window, so the body gets hours every day with nothing to process.", D.plate(), "1")}
<div class="page">
  {D.band(C)}
  <div class="kicker" style="color:{C}">THE PRINCIPLES</div>
  <h1>Seven rules that do most of the work</h1>
  {pr}
</div>

{D.divider("02", C, "Every day", "Once your tier reaches it, these are in every day. They are the foundation the rest is built on.", D.sardine(), "2")}
<div class="page">
  {D.band(C)}
  <div class="kicker" style="color:{C}">THE DAILY LIST</div>
  <h1>Ten foods, every day</h1>
  {dl}
  <div class="tile" style="border-left-color:{C};margin-top:4mm"><h3>Every week</h3><p>Beef liver once. Bone broth twice. Grass-fed beef three times. Lamb once.</p></div>
</div>

<div class="page">
  {D.band(C)}
  <div class="kicker" style="color:{C}">THE FULL LIST</div>
  <h1>Approved foods</h1>
  <h3>Protein</h3>{chips(["Sardines","Wild salmon","Mackerel","Anchovies","Oysters","Grass-fed beef","Lamb","Bison","Pastured chicken thigh","Pastured eggs","Beef liver","Bone broth","Wild game"], "yes")}
  <h3>Vegetables</h3>{chips(["All leafy greens","Broccoli","Cauliflower","Brussels sprouts","Cabbage","Bok choy","Asparagus","Celery","Cucumber","Zucchini","Green beans","Artichoke","Mushrooms","Onion","Garlic","Leeks","Radish","Beets","Carrots","Sauerkraut","Kimchi","Fermented pickles"], "yes")}
  <h3>Fats</h3>{chips(["Extra virgin olive oil","Grass-fed butter","Ghee","Tallow","Avocado","Avocado oil for high heat","Coconut oil","Olives","Macadamia nuts","Walnuts"], "yes")}
  <h3>Fruit</h3>{chips(["Blueberries","Blackberries","Raspberries","Lemon","Lime","Avocado","Seasonal fruit, small, with a meal"], "yes")}
  <h3>Starch, Intermediate and Beginner only</h3>{chips(["White rice","Sweet potato","Squash"])}
  <h3>Dairy, limited</h3>{chips(["Grass-fed butter","Ghee","Aged hard cheese (not Pro)"])}
  <h3>Seasoning</h3>{chips(["Baja Gold","Black pepper","Fresh herbs","Ginger","Turmeric","Cinnamon","Apple cider vinegar","Mustard, no sugar","Coconut aminos"])}
  <h3>Drinks</h3>{chips(["Mineral water","Black coffee, before noon","Green tea","Herbal tea","Bone broth","Spring Dragon tea, afternoon"])}
</div>

{D.divider("03", D.COPPER, "What is out", "Not forever. Ninety days. Long enough to find out what your body does without them.", D.crossed(), "3")}
<div class="page">
  {D.band(D.COPPER)}
  <div class="kicker" style="color:{D.COPPER}">OUT</div>
  <h1>What is out, and why</h1>
  {ou}
</div>

<div class="page">
  {D.band(C)}
  <div class="kicker" style="color:{C}">BY TIER</div>
  <h1>Your window and your exclusions</h1>
  <p class="lede">Same principles for everyone. The hours and the exclusions change with the tier.</p>
  <div class="tierrow">
    <div style="background:#0E557C"><h3>PRO</h3><p>7am to 1pm. One 24-hour fast weekly. No grains, legumes, nightshades, starch, or dairy except butter and ghee.</p></div>
    <div style="background:#218BBE"><h3>ADVANCED</h3><p>7am to 3pm. No grains, legumes, nightshades. Butter and aged cheese only.</p></div>
    <div style="background:#2AAFC0"><h3>INTERMEDIATE</h3><p>8am to 5pm. White rice and sweet potato allowed. Nightshades in.</p></div>
    <div style="background:#157A5C"><h3>BEGINNER</h3><p>No window in month one. 9am to 7pm in month two, tightening. Gluten and seed oils out from week 9. Everything else in.</p></div>
  </div>
  <div class="tile soft" style="border-left-color:{C};margin-top:6mm"><h3>The morning glass, every tier</h3><p>Before coffee, before food, before anything: 16 to 24 oz of mineral water with a pinch of Baja Gold and 1 to 2 oz of pure organic lemon juice. Empty stomach. It is the first thing the body receives after light.</p></div>
  <div class="tile" style="border-left-color:{C}"><h3>Water for the day</h3><p>Three liters minimum, every tier. More on days you sweat: sauna, hard training, heat. Baja Gold in every bottle, because water without minerals passes through and takes minerals with it.</p></div>
</div>


{D.divider("05", D.COPPER, "Eat what the sun made near you, when it made it", "Every food starts as light. Your body knows which season it came from.", D.seasons(), "5")}
<div class="page">
  {D.band(D.COPPER)}
  <div class="kicker" style="color:{D.COPPER}">LOCAL AND SEASONAL</div>
  <h1>Why the season of your food matters</h1>
  <p class="lede">Every food you have ever eaten started as sunlight. Plants catch light and turn it into sugar and fat. That is photosynthesis. When you eat a plant, you are eating stored sunlight. When you eat an animal, you are eating the sunlight it ate before you.</p>
  <h3>Your mitochondria are sensors</h3>
  <p>The mitochondria in your cells do not just burn fuel. They read it. Douglas Wallace, who founded the field of mitochondrial medicine, describes them as environmental sensors. Food arriving in a cell is information about the world outside, not just calories.</p>
  <h3>Summer food and winter food are not the same</h3>
  <p>Summer light is stronger and lasts longer. The food summer makes, fruit, berries, sweet things, carries that. In our model, the electrons in summer food carry more energy than the electrons in winter food, because they were made under a stronger sun. Your body reads that as summer: store, grow, be active, get ready for the cold.</p>
  <p>Winter light is weaker. The food winter makes is fat and protein, roots, and animals that ate all summer. Lower power. Your body reads that as winter: burn stored fat, repair, rest.</p>
  <h3>What happens when the signals disagree</h3>
  <p>Eat watermelon in January under a light bulb and your body receives summer food and winter light at the same time. The mitochondria cannot tell what season it is. In our model, that mismatch is one reason people gain weight through the winter and cannot get it off: the body is being told to store for a winter that, as far as the food is concerned, never comes.</p>
  <h3>What to do</h3>
  <p>Eat what grows near you, in the season you are in. Fruit and berries in summer, and only then. Fat, animals and roots in winter. Local fish. A farmers market tells you what is in season without you having to look it up. If it flew here from the other side of the world, it is carrying the wrong season.</p>
  <div class="tierrow">
    <div style="background:#0E557C"><h3>PRO</h3><p>No fruit for 90 days regardless of season.</p></div>
    <div style="background:#218BBE"><h3>ADVANCED</h3><p>No fruit for 90 days regardless of season.</p></div>
    <div style="background:#2AAFC0"><h3>INTERMEDIATE</h3><p>Berries in season only, with a meal.</p></div>
    <div style="background:#157A5C"><h3>BEGINNER</h3><p>Fruit in season only, with a meal, never alone.</p></div>
  </div>
  <div class="rule" style="margin-top:6mm">This section is part of the Human Battery working model. That plants make food from light, and that what grows changes with the season, is settled. What your mitochondria do with the difference is the frontier, and it is the part we are here to measure.</div>
</div>

{D.divider("06", D.BLUE, "Building a plate", "Same shape every meal. Protein and fat first, carbohydrates last. Decide once and stop deciding.", D.food(), "6")}
<div class="page">
  {D.band(D.BLUE)}
  <div class="kicker" style="color:{D.BLUE}">MEAL CONSTRUCTION</div>
  <h1>How to build a plate</h1>
  {bp}
  <div class="rule" style="margin-top:6mm">The cookbook is built only from the approved list. Each recipe logs as a single tap in the portal.</div>
  <div class="rule">The Human Battery Project is an educational wellness program, not medical treatment. If you take prescription medication, review any dietary change with your prescriber. If you have a history of disordered eating, do not use an eating window without professional support.</div>
</div>

</body></html>"""
    path = f"{B.OUT}/HBP-Dietary-Guidelines.pdf"
    HTML(string=html, base_url=B.BASE_URL).write_pdf(path)
    return path
