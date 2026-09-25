#!/usr/bin/env python3
"""Load seasonality from the USDA SNAP-Ed Seasonal Produce Guide.

    python3 scripts/load_seasonality.py            # load
    python3 scripts/load_seasonality.py --report   # what maps, what does not

NOTHING HERE IS INVENTED. The four lists below are transcribed from the four
season pages of the guide, retrieved on the date in RETRIEVED_ON. A food in
the programme that does not appear on any of those pages gets NO ROW, and is
reported to the member as unknown rather than as out of season.

The guide is SEASON-LEVEL and NATIONAL. It carries no month and no region, and
its own front page says seasonal produce "will vary by growing conditions and
weather". So the rows loaded here are region 'US' with a season and no month.
State extension guides carry month and region and would load into the same
table without changing its shape.
"""
import json
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PSQL_DIRS = ["/opt/homebrew/opt/libpq/bin", "/opt/homebrew/opt/postgresql@16/bin",
             "/usr/local/opt/libpq/bin", "/usr/bin"]

SOURCE_NAME = "USDA SNAP-Ed Seasonal Produce Guide"
SOURCE_URL = "https://snaped.fna.usda.gov/resources/nutrition-education-materials/seasonal-produce-guide"
RETRIEVED_ON = "2026-09-25"

# Transcribed from the four season pages, verbatim.
USDA = {
 "spring": ["Apples","Apricots","Asparagus","Avocados","Bananas","Blackberries","Broccoli",
   "Cabbage","Carrots","Celery","Collard Greens","Garlic","Herbs","Kale","Kiwifruit","Lemons",
   "Lettuce","Limes","Mushrooms","Onions","Peas","Pineapples","Plantains","Radishes","Rhubarb",
   "Spinach","Strawberries","Swiss Chard","Turnips"],
 "summer": ["Apples","Apricots","Avocados","Bananas","Beets","Bell Peppers","Blackberries",
   "Blueberries","Cantaloupe","Carrots","Celery","Cherries","Corn","Cucumbers","Eggplant","Garlic",
   "Grapes","Green Beans","Herbs","Honeydew Melon","Lemons","Lima Beans","Limes","Mangos","Okra",
   "Onions","Peaches","Pears","Peas","Pineapples","Plantains","Plums","Raspberries","Strawberries",
   "Summer Squash","Tomatillos","Tomatoes","Watermelon","Zucchini"],
 "fall": ["Apples","Bananas","Beets","Bell Peppers","Broccoli","Brussels Sprouts","Cabbage",
   "Carrots","Cauliflower","Celery","Collard Greens","Cranberries","Garlic","Ginger","Grapes",
   "Green Beans","Herbs","Kale","Kiwifruit","Lemons","Lettuce","Limes","Mangos","Mushrooms","Okra",
   "Onions","Parsnips","Pears","Peas","Plantains","Pomegranates","Potatoes","Pumpkin","Radishes",
   "Raspberries","Rutabagas","Spinach","Sweet Potatoes & Yams","Swiss Chard","Turnips",
   "Winter Squash"],
 "winter": ["Apples","Avocados","Bananas","Beets","Brussels Sprouts","Cabbage","Carrots","Celery",
   "Collard Greens","Grapefruit","Grapes","Herbs","Kale","Kiwifruit","Leeks","Lemons","Limes",
   "Onions","Oranges","Parsnips","Pears","Plantains","Pomegranates","Potatoes","Pumpkin",
   "Rutabagas","Sweet Potatoes & Yams","Swiss Chard","Turnips","Winter Squash"],
}

# How a programme food maps onto the guide's names. A mapping is a claim that
# the two names mean the same thing, so each one is written out rather than
# guessed by fuzzy match. None means "the guide does not cover this".
MAP = {
 "All leafy greens":      ["Kale", "Spinach", "Swiss Chard", "Lettuce", "Collard Greens"],
 "Broccoli":              ["Broccoli"],
 "Cauliflower":           ["Cauliflower"],
 "Brussels sprouts":      ["Brussels Sprouts"],
 "Cabbage":               ["Cabbage"],
 "Bok choy":              None,
 "Asparagus":             ["Asparagus"],
 "Celery":                ["Celery"],
 "Cucumber":              ["Cucumbers"],
 "Zucchini":              ["Zucchini"],
 "Green beans":           ["Green Beans"],
 "Artichoke":             None,
 "Mushrooms":             ["Mushrooms"],
 "Onion":                 ["Onions"],
 "Shallot":               None,
 "Garlic":                ["Garlic"],
 "Leeks":                 ["Leeks"],
 "Radish":                ["Radishes"],
 "Beets":                 ["Beets"],
 "Carrots":               ["Carrots"],
 "Blueberries":           ["Blueberries"],
 "Blackberries":          ["Blackberries"],
 "Raspberries":           ["Raspberries"],
 "Lemon":                 ["Lemons"],
 "Lime":                  ["Limes"],
 "Avocado":               ["Avocados"],
 "Sweet potato":          ["Sweet Potatoes & Yams"],
 # The guide distinguishes summer squash from winter squash; the programme's
 # list says only "Squash". Mapping to both is the honest reading and the note
 # records that the programme is less specific than the source.
 "Squash":                ["Summer Squash", "Winter Squash"],
 # Preserved foods. Seasonality is a property of the harvest, not of the jar,
 # so these are deliberately not given a season rather than left unmapped by
 # accident.
 "Sauerkraut":            None,
 "Kimchi":                None,
 "Fermented pickles":     None,
 # Not a food, a category.
 "Seasonal fruit, small, with a meal": None,
 # Not produce.
 "White rice":            None,
}

NOTE = {
 "Squash": "The guide separates summer squash from winter squash; the programme list does not.",
 "Sauerkraut": "Preserved. Seasonality belongs to the cabbage harvest, not to the jar.",
 "Kimchi": "Preserved.",
 "Fermented pickles": "Preserved.",
}


def psql(dburl, sql):
    env = dict(os.environ)
    env["PATH"] = ":".join(PSQL_DIRS) + ":" + env.get("PATH", "")
    r = subprocess.run(["psql", dburl, "-v", "ON_ERROR_STOP=1", "-A", "-t", "-c", sql],
                       capture_output=True, text=True, env=env)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[:400])
    return [l for l in r.stdout.strip().split("\n") if l.strip()]


def programme_foods():
    """Every produce item the programme names, read from the source."""
    t = (ROOT / "program-docs" / "diet_doc.py").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r'<h3>([^<]+)</h3>\{chips\(\[(.*?)\]', t, re.S):
        if m.group(1) in ("Vegetables", "Fruit", "Starch, Intermediate and Beginner only"):
            out += re.findall(r'"([^"]+)"', m.group(2))
    return out


def main():
    report_only = "--report" in sys.argv
    foods = programme_foods()
    mapped, unknown, rows = [], [], []
    for f in foods:
        usda = MAP.get(f, "MISSING")
        if usda == "MISSING":
            unknown.append((f, "not in the mapping at all"))
            continue
        if usda is None:
            unknown.append((f, NOTE.get(f, "the guide does not cover it")))
            continue
        seasons = sorted({s for s in USDA for name in usda if name in USDA[s]})
        if not seasons:
            unknown.append((f, "mapped, but the mapped names are on no season page"))
            continue
        mapped.append((f, seasons))
        for s in seasons:
            rows.append((f, s))

    print("PROGRAMME PRODUCE: %d items" % len(foods))
    print("  sourced:  %d" % len(mapped))
    print("  unknown:  %d" % len(unknown))
    print("\nSOURCED")
    for f, s in mapped:
        print("  %-24s %s" % (f, ", ".join(s)))
    print("\nUNKNOWN, left off the seasonal list and shown as unknown")
    for f, why in unknown:
        print("  %-36s %s" % (f, why))

    if report_only:
        return 0

    dburl = None
    for line in (ROOT / ".dev.vars").read_text(encoding="utf-8").split("\n"):
        if line.startswith("SUPABASE_DB_URL="):
            dburl = line.split("=", 1)[1].strip().strip('"')
    vals = ",".join(
        "('%s','%s','%s','US','%s','%s',%s)" % (
            f.replace("'", "''"), SOURCE_NAME, SOURCE_URL, s, RETRIEVED_ON,
            "'%s'" % NOTE[f].replace("'", "''") if f in NOTE else "null")
        for f, s in rows)
    psql(dburl, "delete from food_seasonality where source_name = '%s';" % SOURCE_NAME)
    psql(dburl,
         "insert into food_seasonality (food,source_name,source_url,region,season,retrieved_on,note) "
         "values %s on conflict do nothing;" % vals)
    n = psql(dburl, "select count(*) from food_seasonality;")[0]
    print("\nloaded %s row(s)" % n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
