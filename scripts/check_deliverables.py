#!/usr/bin/env python3
"""Per-document check: if a paid deliverable names a product, it says so.

    python3 scripts/check_deliverables.py     # exit 1 on any failure

WHY THIS IS PER DOCUMENT AND NOT A CORPUS COUNT
-----------------------------------------------
A corpus total cannot distinguish "three no-commission statements in the three
files that name products" from "three statements in files that name none, plus
a fourth file naming one with no statement". Those are the same number and
opposite outcomes. The cookbook was exactly the second case: 38 brand mentions
and no statement, sitting inside a corpus total that looked fine.

So every deliverable is enumerated, and each one is judged on its own.

AND THE BRAND LIST IS DERIVED, NOT GUESSED
------------------------------------------
Asking "is Kerrygold there?" can only confirm a suspicion. This pulls every
capitalised multi-word noun phrase out of the deliverables and subtracts a
vocabulary of ordinary language, so an unknown brand shows up as a leftover.
It over-reports on purpose: a false positive costs a glance, a false negative
ships a paid placement nobody noticed.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The population: every file that becomes a document a client pays for.
DELIVERABLES = sorted(
    [p for p in (ROOT / "program-docs").glob("*.py") if p.stem != "design"]
) + [ROOT / "program-docs" / "kitchen_data.json",
     ROOT / "docs" / "HBP-Protocol-Complete.md"]

NO_COMMISSION = re.compile(r"no commission|not a paid placement", re.I)

# Brands already adjudicated: allowed once per document, tied to a criterion.
ALLOWED_ONCE = {"Baja Gold", "Pure Encapsulations", "OmegaQuant"}

# Ordinary language that capitalises. Not a brand list: a stop list, so the
# leftovers are candidates rather than confirmations.
COMMON = {
    "The Human Battery Project", "Human Battery", "Battery Score", "First Steps",
    "Omega-3 Index", "Dietary Guidelines", "Vitamin D3", "Free T3", "Free T4",
    "Day Zero", "Day One", "Daily Five", "The First Meal", "The Last Meal",
    "The Program", "Your Tests Explained", "The Battery Kitchen",
    "Educational Wellness", "Read More", "Extra Virgin", "Grass Fed",
}
PHRASE = re.compile(r"\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,3})\b")


def text_of(path):
    raw = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return " ".join(
            str(v) for rec in json.loads(raw) for val in rec.values()
            for v in (val if isinstance(val, list) else [val]))
    raw = re.sub(r"^\s*#.*$", " ", raw, flags=re.M)
    return re.sub(r"<[^>]+>", " ", raw)


def main():
    print("population: %d deliverable(s)\n" % len(DELIVERABLES))
    print("  %-34s %-9s %-9s %s" % ("document", "products", "statement", "verdict"))
    problems = []
    for p in DELIVERABLES:
        t = text_of(p)
        named = sorted({b for b in ALLOWED_ONCE if b in t})
        overused = [b for b in named if t.count(b) > 1]
        leftovers = sorted({m for m in PHRASE.findall(t)
                            if m not in COMMON and m not in ALLOWED_ONCE})
        has = bool(NO_COMMISSION.search(t))
        names_product = bool(named)

        if names_product and not has:
            verdict = "FAIL names a product, no statement"
            problems.append("%s: names %s and carries no no-commission statement"
                            % (p.name, ", ".join(named)))
        elif overused:
            verdict = "FAIL %s appears >1" % ", ".join(overused)
            problems.append("%s: %s appears more than once" % (p.name, ", ".join(overused)))
        elif names_product:
            verdict = "ok"
        else:
            verdict = "ok, names none"
        print("  %-34s %-9s %-9s %s"
              % (p.name[:34], ",".join(named) or "none", "yes" if has else "no", verdict))
        if leftovers:
            print("        candidates to eyeball: %s" % ", ".join(leftovers[:6]))

    print()
    if problems:
        print("%d problem(s):" % len(problems))
        for x in problems:
            print("  " + x)
        return 1
    print("every deliverable that names a product carries the statement, "
          "and no brand appears more than once in any one document")
    return 0


if __name__ == "__main__":
    sys.exit(main())
