#!/usr/bin/env python3
"""The first set of saved research queries, generated from the canonical
positions and the seven pillars.

    python3 scripts/seed_research_queries.py --list     print them, change nothing
    python3 scripts/seed_research_queries.py --apply    insert the missing ones
    python3 scripts/seed_research_queries.py --seed     prove the checks below

WHY A SCRIPT AND NOT A MIGRATION. Migrations are append-only and a migration
that seeds data cannot be corrected without a second migration. This table is
Micah's to edit: he adds, retires and rewords queries from
/portal/admin/research.html, and the agent never adds one on its own. So the
first set is seeded by a re-runnable script that inserts only what is missing
and never overwrites a row he has touched.

EVERY QUERY TIES TO SOMETHING. A position in docs/HBP-Canonical-Positions.md,
a pillar, and where it fits a scored dimension. That is not decoration: a query
with nothing to tie it to is a question that has drifted off the thesis, and
the tie is what makes the drift visible in a list rather than invisible in a
result set.

THE FRONTIER DIMENSIONS ARE DELIBERATELY ABSENT. charge, redox and leak have no
instrument and carry no score. A query aimed at measuring one of them would
return real work that could never change anything here, every day, forever.
"""
import argparse
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The five SCORED dimensions. The three frontier ones are not here, on purpose.
SCORED = {"flow", "capacity", "timing", "structure", "environment"}
PILLARS = {
    "morning_daylight", "hydration", "movement", "food_timing",
    "heat_and_cold", "sleep", "nighttime_darkness",
}

# (query, position_key, pillar_key, dimension)
QUERIES = [
    # ---- 3.1 Light. Timing first, chemistry second, both true. ----------
    ("morning light exposure circadian phase advance humans",
     "3.1-light", "morning_daylight", "timing"),
    ("melanopsin intrinsically photosensitive retinal ganglion cells entrainment",
     "3.1-light", "morning_daylight", "timing"),
    ("bright light therapy sleep onset randomized",
     "3.1-light", "morning_daylight", "timing"),
    ("daytime light exposure sleep quality cohort",
     "3.1-light", "morning_daylight", "environment"),
    ("light intensity lux circadian amplitude human trial",
     "3.1-light", "morning_daylight", "environment"),
    ("cutaneous nitric oxide release ultraviolet blood pressure",
     "3.1-light", "morning_daylight", "environment"),
    ("vitamin D cutaneous synthesis ultraviolet B exposure",
     "3.1-light", "morning_daylight", "structure"),
    ("outdoor light exposure mood randomized controlled trial",
     "3.1-light", "morning_daylight", "timing"),
    ("social jetlag light exposure metabolic outcomes",
     "3.1-light", "morning_daylight", "timing"),

    # ---- 3.2 Seasonal eating -------------------------------------------
    ("seasonal variation human metabolism photoperiod",
     "3.2-seasonal-eating", "food_timing", "flow"),
    ("photoperiod dietary fat circadian gene expression",
     "3.2-seasonal-eating", "food_timing", "timing"),
    ("seasonal dietary pattern glucose regulation cohort",
     "3.2-seasonal-eating", "food_timing", "flow"),

    # ---- 3.3 Water and minerals ----------------------------------------
    ("hydration status cognitive performance randomized",
     "3.3-water", "hydration", "flow"),
    ("water intake kidney function cohort study",
     "3.3-water", "hydration", "flow"),
    ("mineral water magnesium calcium cardiovascular outcomes",
     "3.3-water", "hydration", "flow"),
    ("electrolyte balance exercise performance trial",
     "3.3-water", "hydration", "capacity"),
    ("dehydration mild cognitive mood effects adults",
     "3.3-water", "hydration", "flow"),

    # ---- Movement, and capacity ----------------------------------------
    ("VO2max all cause mortality cohort",
     "2-dimensions", "movement", "capacity"),
    ("cardiorespiratory fitness improvement interval training trial",
     "2-dimensions", "movement", "capacity"),
    ("grip strength mortality prospective cohort",
     "2-dimensions", "movement", "capacity"),
    ("resistance training mitochondrial density skeletal muscle",
     "2-dimensions", "movement", "capacity"),
    ("exercise timing circadian rhythm performance",
     "2-dimensions", "movement", "timing"),
    ("post meal walking postprandial glucose",
     "2-dimensions", "movement", "flow"),
    ("sedentary behaviour metabolic health cohort",
     "2-dimensions", "movement", "flow"),

    # ---- Food timing, and flow -----------------------------------------
    ("time restricted eating randomized controlled trial humans",
     "2-dimensions", "food_timing", "flow"),
    ("late evening meal glucose tolerance circadian",
     "2-dimensions", "food_timing", "timing"),
    ("meal timing weight metabolic outcomes trial",
     "2-dimensions", "food_timing", "flow"),
    ("respiratory exchange ratio metabolic flexibility humans",
     "2-dimensions", "food_timing", "flow"),
    ("continuous glucose monitoring healthy adults variability",
     "2-dimensions", "food_timing", "flow"),
    ("overnight fasting duration cardiometabolic markers",
     "2-dimensions", "food_timing", "flow"),

    # ---- Heat and cold --------------------------------------------------
    ("sauna bathing cardiovascular mortality cohort",
     "2-dimensions", "heat_and_cold", "capacity"),
    ("heat acclimation plasma volume adaptation trial",
     "2-dimensions", "heat_and_cold", "capacity"),
    ("cold water immersion recovery strength training",
     "2-dimensions", "heat_and_cold", "capacity"),
    ("cold exposure brown adipose tissue humans",
     "2-dimensions", "heat_and_cold", "flow"),
    ("sauna sleep quality randomized",
     "2-dimensions", "heat_and_cold", "timing"),

    # ---- Sleep, and timing ----------------------------------------------
    ("sleep regularity index cardiometabolic risk",
     "2-dimensions", "sleep", "timing"),
    ("sleep duration glucose metabolism randomized",
     "2-dimensions", "sleep", "flow"),
    ("circadian misalignment shift work metabolic outcomes",
     "2-dimensions", "sleep", "timing"),
    ("sleep extension trial athletic performance",
     "2-dimensions", "sleep", "capacity"),

    # ---- Nighttime darkness ---------------------------------------------
    ("light at night melatonin suppression humans",
     "2-dimensions", "nighttime_darkness", "environment"),
    ("evening blue light exposure sleep onset trial",
     "2-dimensions", "nighttime_darkness", "environment"),
    ("bedroom light exposure obesity cohort",
     "2-dimensions", "nighttime_darkness", "environment"),

    # ---- Structure, the Omega-3 Index -----------------------------------
    ("omega-3 index erythrocyte EPA DHA outcomes",
     "2-dimensions", None, "structure"),
    ("omega-3 index measurement dried blood spot validation",
     "2-dimensions", None, "structure"),
    ("red blood cell membrane fatty acid composition health outcomes",
     "2-dimensions", None, "structure"),

    # ---- The model itself, and the Score --------------------------------
    ("mitochondrial membrane potential measurement humans in vivo",
     "1-model", None, None),
    ("membrane potential bioelectricity tissue regeneration",
     "1-model", None, None),
    ("composite health score validation biomarkers",
     "4-score", None, None),
]


def check():
    """The list is well formed before anything is written."""
    problems = []
    seen = set()
    for q, pos, pil, dim in QUERIES:
        if q in seen:
            problems.append("duplicate query: " + q)
        seen.add(q)
        if not pos:
            problems.append("no position_key: " + q)
        if pil is not None and pil not in PILLARS:
            problems.append("not a pillar: %s (%s)" % (pil, q))
        if dim is not None and dim not in SCORED:
            problems.append("not a SCORED dimension: %s (%s). charge, redox and "
                            "leak have no instrument and carry no score." % (dim, q))
    if not 30 <= len(QUERIES) <= 50:
        problems.append("the first set should be 30 to 50 queries, this is %d" % len(QUERIES))
    return problems


def psql(sql, db_url):
    exe = None
    for cand in ("psql", "/opt/homebrew/opt/libpq/bin/psql"):
        if cand == "psql" or os.path.exists(cand):
            exe = cand
            break
    p = subprocess.run([exe, db_url, "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql],
                       capture_output=True, text=True)
    if p.returncode != 0:
        raise SystemExit("psql failed:\n" + p.stderr.strip())
    return p.stdout.strip()


def lit(v):
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--seed", action="store_true")
    a = ap.parse_args()

    problems = check()
    if problems:
        print("  SEED LIST IS MALFORMED:")
        for x in problems:
            print("    " + x)
        return 1

    if a.seed:
        print("  seed_research_queries --seed\n")
        print("    ok      %d queries, every one inside 30 to 50" % len(QUERIES))
        print("    ok      every query names a position")
        print("    ok      every pillar is one of the seven")
        print("    ok      every dimension is one of the five SCORED ones")
        bad = [q for q, _p, _pi, d in QUERIES if d in ("charge", "redox", "leak")]
        print("    %-7s no query aims at a frontier dimension" % ("ok" if not bad else "FAILED"))
        by_pillar = {}
        for _q, _p, pi, _d in QUERIES:
            by_pillar[pi] = by_pillar.get(pi, 0) + 1
        missing = sorted(PILLARS - set(by_pillar))
        print("    %-7s all seven pillars are covered%s"
              % ("ok" if not missing else "FAILED",
                 "" if not missing else " (missing: " + ", ".join(missing) + ")"))
        return 0 if not bad and not missing else 1

    if a.list or not a.apply:
        print("  %d queries:\n" % len(QUERIES))
        for i, (q, pos, pil, dim) in enumerate(QUERIES, 1):
            print("  %2d. %-62s %-22s %-18s %s"
                  % (i, q[:62], pos, pil or "-", dim or "-"))
        print("\n  --apply writes the missing ones. Nothing is overwritten.")
        return 0

    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise SystemExit("SUPABASE_DB_URL is not set. Source .dev.vars first.")

    values = ",\n  ".join(
        "(%s, %s, %s, %s)" % (lit(q), lit(pos), lit(pil), lit(dim))
        for q, pos, pil, dim in QUERIES)
    # ON CONFLICT DO NOTHING: a query Micah has reworded keeps his wording, and
    # one he has turned off stays off. Re-running this never undoes an edit.
    sql = (
        "insert into research_queries (query, position_key, pillar_key, dimension)\n"
        "values\n  " + values + "\n"
        "on conflict (query) do nothing;\n"
        "select count(*) from research_queries;")
    out = psql(sql, db_url)
    print("  research_queries now holds %s row(s)" % out.splitlines()[-1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
