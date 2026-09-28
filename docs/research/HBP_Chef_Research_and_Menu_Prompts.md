# The Human Battery Project: Chef Research and Menu Build Prompts

Prepared September 27, 2026.

This file has three parts:

1. **The research.** Twenty chefs, their cooking philosophy, their signature dishes, and what each one teaches the Battery Kitchen.
2. **Prompt A, for Claude.** Paste Part 2 and Part 1 into a Claude chat to design the menu.
3. **Prompt B, for Claude Code.** Paste Part 3 into Claude Code, with this whole file saved in the repo, to put the research into the project and build the recipes.

---

## Part 1. The research

### How the 20 were chosen

No award publishes a clean "top 20 chefs" list anymore. The Best Chef Awards dropped numbered rankings in 2024 and now groups chefs into tiers. Rasmus Munk was named the winner in 2024 and again in 2025. So this list combines four signals:

- The Best Chef Awards
- The World's 50 Best Restaurants and its Icon awards
- Michelin stars
- Lasting influence on how the world cooks

It also leans on purpose toward chefs whose methods suit a whole-food, protein and fat first menu: fire, fish, whole animal, fermentation and seasonal produce.

| # | Chef | Restaurant | What they are known for |
|---|---|---|---|
| 1 | Rasmus Munk | Alchemist, Copenhagen | Best Chef winner 2024 and 2025. Offal, 52°C cooking, food as art |
| 2 | René Redzepi | Noma, Copenhagen | Foraging, fermentation, seasons as menus |
| 3 | Massimo Bottura | Osteria Francescana, Modena | Tradition rebuilt, zero waste |
| 4 | Joan Roca | El Celler de Can Roca, Girona | Sous-vide pioneer, distilled aromas |
| 5 | Dabiz Muñoz | DiverXO, Madrid | Best Chef 2021 to 2023, global spice on Spanish product |
| 6 | Ana Roš | Hiša Franko, Slovenia | Hyperlocal, river trout, fermented dairy |
| 7 | Ferran Adrià | elBulli, Roses | Foams, spherification, deconstruction |
| 8 | Alain Ducasse | Le Louis XV, Monaco | Produce at the center, Mediterranean |
| 9 | Thomas Keller | The French Laundry, Per Se | Precision, butter poaching, the roast chicken |
| 10 | Yannick Alléno | Pavillon Ledoyen, Paris | Cold extraction sauces, fermentation |
| 11 | Grant Achatz | Alinea, Chicago | Theater, aroma, nostalgia |
| 12 | Heston Blumenthal | The Fat Duck, Bray | Science-led cooking, precise temperatures |
| 13 | Virgilio Martínez | Central, Lima | Cooking by altitude and ecosystem |
| 14 | Mauro Colagreco | Mirazur, Menton | Garden-led, vegetables treated like luxury |
| 15 | Andoni Luis Aduriz | Mugaritz, Spain | Research kitchen, trompe-l'oeil |
| 16 | Eric Ripert | Le Bernardin, New York | Fish as the star, raw to lightly cooked |
| 17 | Dan Barber | Blue Hill at Stone Barns | Whole farm, soil to plate, whole pig |
| 18 | Jiro Ono | Sukiyabashi Jiro, Tokyo | Edomae sushi, curing and aging fish |
| 19 | Francis Mallmann | Argentina and Patagonia | Seven fires, salt crusts, embers |
| 20 | Gordon Ramsay | Restaurant Gordon Ramsay, London | Classic French technique, Beef Wellington |

### The chefs, their dishes, and the lesson for us

Each entry lists the signature dishes, the chef's favorite where a reliable source reports one, and the idea the Battery Kitchen can borrow. "No reliable source" means we looked and did not find a stated favorite.

**1. Rasmus Munk (Alchemist).** "Holistic cuisine" that uses discarded parts, fermentation and precise low heat, often 52°C.
- *Think Outside the Box*: lamb's brain steamed 7 minutes at 52°C with cherry and walnut oil.
- *The (Perfect) Omelette*: egg yolk and Comté filling held at 52°C, lardo, black truffle.
- *Plastic Fantastic*: cod jaw, smoked bone marrow, cod skin made into a sheet.
- Favorite: no reliable source.
- **Lesson:** offal and offcuts treated as luxury, with exact low temperatures. Heart, liver, marrow, cod and salmon collars.

**2. René Redzepi (Noma).** Hyper-local, seasonal New Nordic cooking built on foraging and fermentation (koji, garums). Three seasons: seafood, vegetables, and game and forest.
- *Moss and Cep*: fried reindeer moss with cep mushrooms.
- *The Hen and the Egg*: duck egg the guest cooks on a hot pan with herbs.
- *Celeriac Shawarma*: celeriac layers roasted for hours and carved like meat. Redzepi called it "one of the best dishes we've ever made."
- *Vintage Carrots*: aged vegetables "planted" in edible soil.
- **Lesson:** a menu that follows the season, a vegetable carved like a roast, and homemade ferments as seasoning.

**3. Massimo Bottura (Osteria Francescana).** "Tradition in evolution," with Emilian classics taken apart and rebuilt. Strong anti-waste stance.
- *Five Ages of Parmigiano Reggiano*: one cheese at 24 to 50 months, in five textures.
- *An Eel Swimming Up the Po River*: glazed eel.
- *The Crunchy Part of the Lasagna*: only the crisp edge.
- *Oops! I Dropped the Lemon Tart*.
- Favorite: no reliable source.
- **Lesson:** one ingredient shown several ways, the crisp edge as the prize, and nothing wasted.

**4. Joan Roca (El Celler de Can Roca).** Catalan tradition renewed through technique. A pioneer of sous-vide and low-temperature cooking.
- *Pig Trotter Carpaccio*: trotters deboned hot, rolled, chilled and sliced thin, with cep oil. He called it "the first dish that really satisfied."
- *Oyster and Distilled Soil*.
- *Amontillado-Steamed Oyster*: cooked tableside over hot stones.
- *Lobster Parmentier with Black Trumpets*.
- **Lesson:** collagen-rich cuts turned elegant, and controlled low heat for proteins.

**5. Dabiz Muñoz (DiverXO).** Rule-breaking "travelling" cooking that puts Indian, Asian and Mexican flavor on Spanish product.
- *Galician Lobster Waking Up on Goa Beaches*: lobster with Indian curries.
- *Cold Poached Pigeon*: with smoked caviar and fermented egg yolk.
- *Spanish Bull*: oxtail with black mole and marrow.
- Favorite: no reliable source. The menu rotates.
- **Lesson:** bold spice on great protein, and oxtail and marrow as centerpieces.

**6. Ana Roš (Hiša Franko).** Self-taught and hyperlocal to the Soča Valley: mountain dairy, river fish, foraged plants and fermentation.
- *Raw marble trout with fermented cottage cheese*.
- *Marble trout salad*: trout cured in spruce salt.
- *Trout "The Queen"*: dry-aged trout, brown butter, fermented pumpkin.
- *Hay-baked potato*.
- Favorite: no reliable source.
- **Lesson:** cure and dry-age fish, and use a local cure ingredient such as herb or spruce salt.

**7. Ferran Adrià (elBulli).** Changes a food's texture and form to surprise: foams, spherification, deconstruction.
- *Spherical olives*.
- *Smoke foam*.
- *Liquid Parmesan ravioli*.
- *Deconstructed Spanish omelette*: egg, potato and onion layered in a glass.
- Favorite: no reliable source.
- **Lesson:** familiar dishes rebuilt in a new form. Useful for turning a classic into a compliant version.

**8. Alain Ducasse (Le Louis XV, Plaza Athénée).** "I do not sublimate produce, it is always centre stage." Market-driven Mediterranean cooking.
- *Seasonal vegetable cookpot* (1987): about seven seasonal vegetables cooked together.
- *Petits pois à la française*: peas braised with lettuce and bacon.
- *Barbajuans*.
- *Baba au rhum*: reported by a colleague as his favorite dessert.
- **Lesson:** a one-pot plate of seasonal vegetables cooked in fat, with the produce doing the work.

**9. Thomas Keller (The French Laundry).** Classical French technique done with extreme precision. Brought sous-vide into American fine dining.
- *Oysters and Pearls*.
- *Salmon Cornets*.
- *Butter-poached lobster*.
- *Roast chicken*: brined, air-dried, trussed, high heat. MasterClass reports it as a personal favorite and always on his "last meal" list.
- **Lesson:** dry-brine and air-dry for crisp skin, and butter poaching for lean seafood.

**10. Yannick Alléno (Pavillon Ledoyen).** "French, sauce-based, modern." Sauces made by cold and vacuum extraction instead of long reduction.
- *Extraction sauces*.
- *La Balade Végétale*: 30+ vegetables with fermented condiments.
- *Soupe improbable de poissons fins*: fine fish and sea urchin broth.
- Favorite: no specific dish. He calls chocolate his "guilty pleasure."
- **Lesson:** deep flavor from extracted jus and broth, not flour or sugar. A perfect fit for bone broth.

**11. Grant Achatz (Alinea).** Cooking as theater: aroma, hidden ingredients, tableside finishes, nostalgia.
- *Black Truffle Explosion*.
- *Edible Helium Balloon*.
- *Table Dessert*.
- *Peanut Butter & Jelly*: one bite of grape, peanut and brioche.
- Favorite: no reliable source.
- **Lesson:** aroma as an ingredient, such as burning rosemary or smoke under a cloche, and familiar flavors rebuilt.

**12. Heston Blumenthal (The Fat Duck).** Science-led, multisensory cooking with precise temperatures.
- *Sound of the Sea*: seafood with ocean sounds.
- *Snail Porridge*.
- *Bacon and Egg Ice Cream*.
- *Triple-Cooked Chips*: simmer, chill, fry at 130°C, chill, fry at 190°C.
- Favorite: no reliable source.
- **Lesson:** multi-stage cooking for texture, and exact temperatures written into every step.

**13. Virgilio Martínez (Central).** A menu that travels through Peru's ecosystems by altitude.
- *Tubers in Huatia*: tubers cooked in an earth oven.
- *Lofty Andes*: native potatoes.
- *Pacu*: an Amazon fish served with the fruits it eats in the wild.
- Favorite: no reliable source.
- **Lesson:** build a plate from one place and one season. This matches the local and seasonal rule directly.

**14. Mauro Colagreco (Mirazur).** Garden-first cooking, with menus that follow the moon cycle (roots, leaves, flowers, fruit) and vegetables treated like luxury proteins.
- *Oyster, shallot cream, pear*.
- *Salt-crusted beetroot with caviar*: the beet is aged underground, then baked in salt.
- *Turbot, red shiso, sake sauce*.
- Favorite: no reliable source.
- **Lesson:** a salt crust for vegetables, and a simple root served with a luxury topping such as fish roe.

**15. Andoni Luis Aduriz (Mugaritz).** A research kitchen that plays with trompe-l'oeil, contrast and fermentation.
- *Edible Stones*: potato coated in clay to look like river stones. He calls it "one of my favourite dishes... a magical equilibrium of texture and temperature."
- *Veg Carpaccio*: watermelon made to look like meat.
- *Broken Egg, Cool Yolk*.
- **Lesson:** contrast of texture and temperature on one plate.

**16. Eric Ripert (Le Bernardin).** "The fish is the star." The menu runs Almost Raw, Barely Touched, Lightly Cooked.
- *Thinly Pounded Yellowfin Tuna*: pounded raw tuna over foie gras on toasted baguette. He says it "defines our style."
- *Poached Lobster*.
- *Dover Sole*.
- **Lesson:** raw and barely cooked fish as a main course, so the omega-3 foods taste like luxury.

**17. Dan Barber (Blue Hill at Stone Barns).** Cook the whole farm. Flavor starts with soil and seed.
- *Vegetables on a Fence*.
- *Rotation Risotto*: cover crops cooked like risotto.
- *Everything from the Pig*: belly, ear, loin sausage, jowl and pâté on one board.
- *Honeynut squash*: a variety bred at his request.
- Favorite: no reliable source.
- **Lesson:** whole-animal boards and local farm sourcing. This is closest to Dr. Pittman's own farm-to-table history.

**18. Jiro Ono (Sukiyabashi Jiro).** A lifetime refining Edomae sushi through curing, aging and exact knife work.
- *Kohada*: gizzard shad cured in salt and vinegar. Called the most important topping for Jiro.
- *Tako*: octopus massaged by hand for 45 minutes.
- *Anago*: simmered sea eel.
- *Tamago*: layered egg.
- *Chūtoro*: medium-fatty tuna.
- Favorite: no reliable source.
- **Lesson:** salt and vinegar curing turns sardines and mackerel into something special. The fish works without the rice.

**19. Francis Mallmann (Seven Fires).** Open fire in seven forms: parrilla, chapa, infiernillo, clay oven, embers, asador and cauldron. Seasoned with little more than salt and olive oil.
- *Salt-crusted fish al infiernillo*: whole fish cooked between two fires, with burnt beets.
- *Hanging rib eye with chimichurri*.
- *Whole lamb al asador*: about 8 hours beside the fire.
- *Squash al rescaldo*: buried in embers for hours.
- *Burnt fruit*.
- Favorite: no reliable source.
- **Lesson:** fire, salt crust and char. These are the Battery Kitchen's own techniques, taken outdoors.

**20. Gordon Ramsay (Restaurant Gordon Ramsay).** Classic French technique, flavor first.
- *Beef Wellington*: beef fillet, mushroom duxelles, Parma ham, pastry.
- *Lobster Ravioli*: the dish he says "best represents" him.
- *Pan-seared Scallops*.
- *Sticky Toffee Pudding*.
- **Lesson:** a famous dish can be rebuilt without its non-compliant parts. Wellington works without pastry: beef wrapped in duxelles and ham, then seared.

### What the 20 have in common

These are the ideas that come up again and again, and every one of them fits the Human Battery guidelines:

1. **Salt early.** Dry brines, cures and salt crusts (Keller, Jiro, Roš, Mallmann, Colagreco).
2. **Exact heat.** Low and precise for protein, very hot for char (Munk, Roca, Keller, Blumenthal, Mallmann).
3. **Fat as flavor.** Butter poaching, brown butter, marrow, confit (Keller, Roš, Muñoz, Munk).
4. **Whole animal and offcuts.** Collars, jaws, trotters, marrow, offal (Munk, Barber, Roca, Bottura).
5. **Fish raw, cured or barely cooked** (Ripert, Jiro, Roš, Adrià).
6. **Fermentation as seasoning** (Redzepi, Roš, Alléno, Aduriz).
7. **Broth and extraction instead of flour and sugar** (Alléno, Ducasse).
8. **Place and season decide the plate** (Martínez, Colagreco, Redzepi, Barber, Ducasse).

### Sources

- The Best Chef Awards 2025: [The Dot Magazine](https://thedotmagazine.com/the-best-chef-awards-2025-milan-crowns-global-culinary-greats-vietnam-leaves-its-mark/), [Sophie Serves Up](https://www.sophieservesup.com/articles/the-2025-best-chef-awards-results-from-milan/)
- Munk: [Fine Dining Lovers](https://www.finedininglovers.com/explore/articles/dishes-earned-alchemist-two-michelin-stars-just-seven-months), [National Geographic](https://www.nationalgeographic.com/travel/article/pioneer-rasmus-munk-provocative-danish-chef)
- Redzepi: [World's 50 Best](https://www.the50.com/stories/News/noma-rene-redzepi-three-dishes-highest-new-entry-50-best.html), [Fine Dining Lovers](https://www.finedininglovers.com/article/7-iconic-dishes-rene-redzepi)
- Bottura: [Michelin Guide](https://guide.michelin.com/vn/en/article/people/massimo-bottura-tortellini-interview), [Emilia Delizia](https://www.emiliadelizia.com/5-massimo-bottura-dishes-blow/)
- Roca: [Fine Dining Lovers](https://www.finedininglovers.com/article/roca-brothers-7-inspirational-dishes), [Forbes](https://www.forbes.com/sites/kristintablang/2018/09/27/how-el-celler-de-can-rocas-head-chef-joan-roca-continues-to-elevate-fine-dining/)
- Muñoz: [Business Traveller](https://www.businesstraveller.com/news/best-chef-in-the-world-dabiz-munoz-diverxo/), [esMadrid](https://www.esmadrid.com/en/restaurants/diverxo)
- Roš: [Hiša Franko](https://www.hisafranko.com/en/ana-ros), [Saveur](https://www.saveur.com/ana-ros-trout-whisperer-slovenia-soca-valley)
- Adrià: [Britannica](https://www.britannica.com/biography/Ferran-Adria), [elBulli](https://en.wikipedia.org/wiki/El_Bulli)
- Ducasse: [Civilian](https://civilianglobal.com/features/alain-ducasse-25-years-louis-xv-monaco-three-michelin-stars/), [SCMP](https://www.scmp.com/lifestyle/100-top-tables/article/3317547/dish-focus-seasonal-vegetables-cooked-together-black-truffle-alain-ducasse-morpheus), [VinePair](https://vinepair.com/articles/best-rum-baba-recipe/)
- Keller: [Fine Dining Lovers](https://www.finedininglovers.com/explore/articles/6-iconic-dishes-thomas-keller), [MasterClass](https://www.masterclass.com/articles/thomas-kellers-perfect-oven-roasted-chicken)
- Alléno: [Gault&Millau](https://fr.gaultmillau.com/en/news/yannick-alleno-en-5-plats), [World's 50 Best](https://www.the50.com/stories/News/yannick-alleno-pavillon-ledoyen-paris-worlds-50-best-restaurants.html)
- Achatz: [Michelin Guide](https://guide.michelin.com/us/en/illinois/chicago/restaurant/alinea), [Fine Dining Lovers](https://www.finedininglovers.com/explore/articles/7-iconic-dishes-grant-achatz)
- Blumenthal: [World's 50 Best](https://www.theworlds50best.com/stories/News/the-most-iconic-dishes-at-the-fat-duck-restaurant.html), [Tempus](https://tempusmagazine.co.uk/news/interview-heston-blumenthal-talks-25-years-of-groundbreaking-gastronomy/)
- Martínez: [World's 50 Best](https://www.theworlds50best.com/discovery/Establishments/Peru/Lima/Central.html), [Atmos](https://atmos.earth/plating-perus-megadiversity-at-the-best-restaurant-in-the-world/)
- Colagreco: [World's 50 Best](https://www.theworlds50best.com/discovery/Establishments/France/Menton/Mirazur.html), [Fine Dining Lovers](https://www.finedininglovers.com/explore/articles/autumn-according-mauro-colagreco-iconic-dishes-inspiration)
- Aduriz: [Fine Dining Lovers](https://www.finedininglovers.com/explore/articles/7-iconic-dishes-andoni-luis-aduriz), [Mugaritz](https://www.mugaritz.com/en/andoni-luis-aduriz-is-the-winner-of-the-icon-award-2023-by-the-worlds-50-best-restaurants/)
- Ripert: [Golf Digest](https://www.golfdigest.com/story/masters-2026-chef-eric-ripert-interview-rory-mcilroy-le-bernadin-masters-champions-dinner), [Le Bernardin](https://en.wikipedia.org/wiki/Le_Bernardin)
- Barber: [Resy](https://blog.resy.com/2024/04/blue-hill-at-stone-barns-at-20/), [Civil Eats](https://civileats.com/2014/05/22/dan-barber-takes-a-radically-holistic-approach-to-food-and-farming-with-the-third-plate/)
- Ono: [JW Web Magazine](https://jw-webmagazine.com/tips/sukiyabashi-jiro-ginza/), [Jiro Dreams of Sushi](https://en.wikipedia.org/wiki/Jiro_Dreams_of_Sushi)
- Mallmann: [Montecristo](https://montecristomagazine.com/magazine/winter-2014/chef-francis-mallmann), [CBS News](https://www.cbsnews.com/news/francis-mallmann-the-dish-open-fire-cooking-icon-2019-08-31/)
- Ramsay: [Mashed](https://www.mashed.com/769901/gordon-ramsay-says-this-dish-best-represents-him/), [Restaurant Gordon Ramsay](https://en.wikipedia.org/wiki/Restaurant_Gordon_Ramsay)

---

## Part 2. Prompt A, for Claude (menu design)

Paste everything in the box, then paste Part 1 underneath it.

```
You are designing The Human Battery Project menu: 90 recipes, 30 for breakfast, 30 for lunch and 30 for dinner. The menu lives in "The Battery Kitchen," which already has 40 older recipes (20 First Meals and 20 Last Meals). Your job is to design 90 recipes inspired by the 20 chefs in the research below, rebuilt so every recipe follows our dietary guidelines exactly.

HOW TO USE THE CHEFS
Borrow the technique and the idea, never the non-compliant parts. For every chef, find what their signature dish teaches (a cure, a temperature, a fire method, a whole-animal cut, a ferment, a sauce method) and build a Human Battery recipe from our approved foods using that lesson. Example: Ramsay's Beef Wellington becomes beef fillet wrapped in mushroom duxelles and ham and seared, with no pastry. Keller's roast chicken becomes a dry-brined, air-dried, high-heat chicken with no changes needed.

OUR DIETARY RULES (these override the chefs every time)
1. Use only foods on the Human Battery approved food list. If you are unsure whether an ingredient is on the list, flag it instead of using it.
2. Macros: protein and fat are the majority of every plate, roughly 40 percent each, carbohydrate about 20 percent. Vegetables are not the bulk of the plate.
3. Three meals: breakfast, lunch and dinner. Breakfast is eaten after morning light. Dinner is finished at least 3 hours before bed. No snacks, no desserts as a separate course.
4. Fats: butter, ghee, tallow, extra virgin olive oil, avocado, animal fat, marrow. No seed oils, ever.
5. No added sugar, no refined flour, no pastry, no bread, no pasta.
6. Starches such as sweet potato, rice and squash, and fruit (berries only, in season), are for Intermediate and Beginner tiers only. Mark those recipes with their tiers. Everything else is for all four tiers: Pro, Advanced, Intermediate, Beginner.
7. Salt is unrefined full-trace-mineral salt. The only brand names allowed are Baja Gold and Icelandic salt. No other brand names and no supplements anywhere.
8. Eat local and in season. Give each recipe its season(s) and name any ingredient that is hard to find locally, with a local swap.
9. Favor the program's priority foods: oily fish (sardines, mackerel, salmon, trout), shellfish and oysters, organ meats, pastured eggs, grass-fed beef, lamb, bison, bone broth, ferments (sauerkraut, kimchi).
10. No alcohol in any recipe, including for steaming or deglazing. Use broth or vinegar instead.
11. No health claims in recipe text. Say what the food is and why the technique works, not what it cures or treats.

HOW RECIPES ARE WRITTEN
- Plain English at a third-to-fifth grade reading level. Every step says what to do and why.
- No em dashes anywhere. Use commas or periods.
- Exact temperatures in Celsius and Fahrenheit, exact times, exact amounts for 1 serving (and say how to double it).
- Do not put a chef's name in the recipe title. Chef names go only in an internal "lineage" note. Never suggest a chef endorses the program.

FOR EACH RECIPE, GIVE
- Name
- Meal: Breakfast, Lunch or Dinner
- Tiers
- Season(s)
- Time
- Technique (one or two words, like Cure, Salt crust, Butter poach, Embers, Dry brine)
- Why (one or two sentences on why this plate is worth cooking)
- Ingredients with amounts
- Method, numbered steps
- Rough macro split (protein / fat / carbohydrate, as percentages)
- Lineage: the chef and the signature dish that inspired it, and the lesson borrowed
- Adapted: what we removed from the original and why (for example, "pastry removed: refined flour")
- Flags: any ingredient you are not sure is on the approved list

WHAT TO DELIVER
1. A menu of exactly 90 recipes: 30 breakfast, 30 lunch and 30 dinner. Every chef inspires at least 3 recipes. No duplicates of the 40 older recipes in The Battery Kitchen.
2. At least 22 of the 90 must use oily fish, at least 9 must use organ meats or offcuts, and at least 9 must use a fire or ember method someone can do on a home grill. Spread them across all three meals.
3. Every season must have enough recipes in each meal that a member can eat for 90 days without repeating a recipe more than about once a week.
4. A short table at the end: recipe, meal, chef lineage, technique, tiers, season.

Start by listing the 90 recipe names, grouped by breakfast, lunch and dinner, with their lineage and tiers, so I can approve the list before you write the full recipes.

RESEARCH:
[paste Part 1 here]
```

---

## Part 3. Prompt B, for Claude Code (put the research in and build)

Save this whole file in the repo first, at `docs/research/HBP_Chef_Research_and_Menu_Prompts.md`. Then paste the box into Claude Code.

```
Read docs/research/HBP_Chef_Research_and_Menu_Prompts.md in full before changing anything.

GOAL
Put the chef research into the project as a permanent, citable source, and build 90 Battery Kitchen recipes, 30 for breakfast, 30 for lunch and 30 for dinner, inspired by those 20 chefs and rebuilt to follow the Human Battery dietary guidelines exactly.

STEP 1. STORE THE RESEARCH
- Keep Part 1 of that file as the research source. Do not edit its facts.
- Add it to the knowledge corpus the coach can retrieve, using the existing corpus loader and content-hash ids. Tag it as culinary reference, not scientific evidence. It must never be cited as evidence for a health claim or a canonical rule.

STEP 2. THE RULES ARE THE SOURCE OF TRUTH
- The repo's Dietary Guidelines and approved food list decide what is allowed, not this file and not the chefs. Read them first.
- If any rule in Prompt A (Part 2 of the file) conflicts with the repo's Dietary Guidelines, the Dietary Guidelines win. Report every conflict to me before building.

STEP 3. BUILD THE RECIPES
Follow Prompt A in Part 2 exactly for content, tiers, style and the fields each recipe needs, with these build rules:
- Store recipes in the same structure the existing 40 Battery Kitchen recipes use. If there is no recipe table yet, propose the schema to me before creating one.
- The meal field has three values: breakfast, lunch, dinner. If the existing structure only has first and last meal, add lunch and report the change.
- Every recipe carries: meal (breakfast, lunch or dinner), tiers, seasons, time, technique, why, ingredients with amounts, steps, macro split, lineage (chef, dish, lesson), adapted notes, and flags.
- Every ingredient must match an item on the approved food list by id, not by free text. An ingredient that matches nothing is a flag, and the recipe stays in draft.
- Tier rules are enforced in code: starch and fruit recipes cannot be tagged Pro or Advanced.
- Seasons are enforced: a recipe only shows to a member when at least one of its seasons matches the member's current local season from onboarding.
- New recipes are status draft until I approve them in the admin interface, the same way canonical rules are approved.

STEP 4. CHECKS THAT MUST PASS
Add tests to the commit gate that fail if any recipe:
- uses an ingredient not on the approved list
- contains seed oils, added sugar, refined flour, bread, pasta, pastry or alcohol
- gives a starch or fruit recipe to Pro or Advanced
- has carbohydrate over about 20 percent for Pro and Advanced
- uses a brand name other than Baja Gold or Icelandic salt, or names a supplement
- contains an em dash
- puts a chef's name in the title or member-facing text
- makes a health claim
Prove each check by seeding one bad recipe that must fail.

STEP 5. SHOW ME
- Report the 90 recipe names, grouped 30 breakfast, 30 lunch, 30 dinner, with lineage and tiers first, and wait for my approval before writing all 90 in full.
- Add a check that the approved menu holds exactly 30 recipes per meal.
- Then build them, run the checks, and give me the approval list with every flag.
- Do not publish anything to members until I approve.
```
