#!/usr/bin/env python3
"""Fail the build when the product states something the canon forbids.

A prohibition that lives only in a markdown file gets violated by the next
person who writes marketing copy. This is that file turned into a check.

    python3 scripts/check_prohibitions.py        # exit 1 on any hit

Source of truth is docs/HBP-Canonical-Positions.md section 6. When that file
changes, this one changes with it, and the PATTERNS list below says which
clause each rule came from.

TWO THINGS THIS SCRIPT GETS RIGHT ON PURPOSE
--------------------------------------------
1. It matches SENTENCES, not keywords. The model audit in CLAUDE.md learned
   this the hard way three times: a grep for "charging" passed "Afternoon sun
   charges the battery". A pattern that names only the noun finds nothing.

2. It proves it can fail. Every pattern carries a `canary`, a string the
   pattern MUST match. The canaries run first, and if any pattern fails to
   catch its own canary the script exits non-zero and says the check is
   broken. A linter that cannot fail is worse than no linter, because it
   reports "clean" forever. This is the prove-the-negative rule from
   CLAUDE.md applied to the checker itself.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Participant-facing surfaces, coach prompt templates and marketing copy.
SCAN = [
    "public/*.html",
    "public/portal/*.html",
    "public/portal/*.js",
    "public/data/citations.json",
    "program-docs/*.py",
    "functions/api/*.js",
    "database/migrations/*.sql",
]

# Rule files STATE the prohibitions, which means they quote the forbidden
# phrases. Same shape as the negation case in the model audit: a sentence that
# forbids a claim is the opposite of that claim. Exempt by path, deliberately
# short, and each one says why.
EXEMPT = {
    "docs/HBP-Canonical-Positions.md": "is the prohibition",
    "functions/api/_canon.js":         "compiled copy of the prohibition",
    "CLAUDE.md":                       "is the rules",
    "scripts/check_prohibitions.py":   "is this check",
}

# Sentences that deny a forbidden claim are the model stated correctly. This
# is not a keyword exception and must stay narrow: it requires an explicit
# negation or a refusal verb in the same sentence.
NEGATION = re.compile(
    r"\b(not|never|no|cannot|does not|do not|is not|are not|without|"
    r"forbidden|prohibited|refus\w*|declin\w*|withdrew|withdrawn|"
    r"superseded|not accepted|no evidence|unevidenced|error|mistake|wrong|"
    r"myth|disqualif\w*|would commit|must not|may not|rather than)\b", re.I)

PATTERNS = [
    dict(
        name="antioxidant-as-mitochondrial-energy",
        clause="6: no claim that antioxidant content, ORAC value, redox potential "
               "or electrochemical measurement is an energy input to mitochondria",
        subject=r"\b(antioxidant\w*|ORAC|polyphenol\w*|flavonoid\w*|redox potential|"
                r"electrochemical|reducing capacity)\b",
        predicate=r"\b(energy input|fuel\w*|power\w*|charge\w*|energi[sz]\w*|"
                  r"feed\w*|deliver\w*|donat\w*)\b.{0,40}\b(mitochondri\w*|cell\w*|ATP|body)\b"
                  r"|\b(mitochondri\w*|ATP)\b.{0,40}\b(energy|fuel|power)\b",
        canary="The antioxidants in the berries deliver energy to your mitochondria.",
    ),
    dict(
        name="summer-food-carries-more-energy",
        clause="6: no presentation of seasonal eating as 'summer food carries more "
               "energy', and no presentation of season as a single antioxidant dial",
        subject=r"\b(summer|seasonal|in.season|out.of.season)\b.{0,40}\b(food|fruit|produce|berr\w*|veg\w*)\b"
                r"|\b(food|fruit|produce|berr\w*)\b.{0,30}\b(summer|season\w*)\b",
        predicate=r"\b(more energy|higher energy|more antioxidant\w*|richer|"
                  r"carries? (more|a message|information)|energy electron\w*|"
                  r"higher.energy electron\w*)\b",
        canary="Summer fruit carries more energy than winter fruit.",
    ),
    dict(
        name="structured-or-energized-water",
        clause="6: no claim that a particular water is structured, energized or "
               "informational",
        # Adjacency, not co-occurrence. "Structured logging" seventy characters
        # from "hydration" on a diagram is not a claim about water.
        phrase=r"\b(structured|energi[sz]ed|informational|hexagonal|ionized)\s+water\b"
               r"|\bwater\s+(is|are|was|becomes|gets)\s+"
               r"(structured|energi[sz]ed|informational|ordered into)\b"
               r"|\bwater\s+(remembers|stores? information|holds? information|has memory)\b"
               r"|\bexclusion.zone water\b|\bfourth phase of water\b|\bEZ water\b",
        # Naming a book, or saying where a term came from, is a reference and
        # not an assertion. The reading list on /science does both on purpose.
        # The reading list cites Pollack's book by name. A title is a
        # reference, not an assertion, and the entry beside it says plainly
        # that the larger claim is not accepted.
        unless=r"\bthe term\b|Pollack|<i>|comes from\b|\bnot accepted\b"
               r"|Beyond Solid, Liquid and Vapor",
        canary="Drinking structured water changes your cells.",
    ),
    dict(
        name="sunlight-charges-the-body",
        clause="3.1: still forbidden, that sunlight charges the body the way a "
               "charger fills a phone",
        subject=r"\b(sun|sunlight|light|photon\w*)\b",
        predicate=r"\b(charge[sd]?|charging|recharge\w*|fill\w*)\b.{0,30}"
                  r"\b(you|your body|the body|your batter\w*|cells?)\b",
        canary="Morning sunlight charges your body the way a charger fills a phone.",
    ),
    dict(
        name="coverage-or-n-of-eight",
        clause="2, rule 2: no coverage figure, fraction, or 'n of 8' string",
        subject=r"\b(dimension\w*|score|model|batter\w*)\b",
        predicate=r"\b\d+\s*(of|/)\s*8\b|\bcoverage\b|\bpercent of the model\b|"
                  r"\b\d+\s*of\s*eight\b",
        canary="Your score covers 5 of 8 dimensions.",
    ),
    dict(
        name="vitamin-d-as-light-exposure-proxy",
        clause="6: serum vitamin D is never a proxy for light exposure",
        subject=r"\b(vitamin ?d|25.oh|serum d)\b",
        predicate=r"\b(proxy|measure\w*|tells? us|indicat\w*|stands? in)\b.{0,40}"
                  r"\b(light|sun\w*|exposure)\b",
        unless=r"\bon the panel\b|\breferable\b|\bsupplement\w*\b",
        canary="We use vitamin D as a proxy for your light exposure.",
    ),
    dict(
        name="measuring-cellular-charge-or-redox",
        clause="6: no feature claiming to measure cellular charge or redox state "
               "in a participant",
        subject=r"\b(we|this|your|the (test|panel|score))\b",
        predicate=r"\b(measur\w+|read\w+|report\w+|show\w+)\b.{0,40}"
                  r"\b(your|participant.s|the client.s)?\s*"
                  r"(cellular charge|membrane potential|redox state|mitochondrial redox)\b",
        canary="We measure your mitochondrial redox state from the panel.",
    ),
]


def sentences(text, path=""):
    # Internal comments are not participant-facing. A SQL comment explaining
    # why a rule exists is not the product asserting it.
    if path.endswith(".sql"):
        text = re.sub(r"^\s*--.*$", " ", text, flags=re.M)
    if path.endswith(".py"):
        text = re.sub(r"^\s*#.*$", " ", text, flags=re.M)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    # Prose splits on sentence ends. Source splits on lines as well, so a
    # subject in one string literal cannot meet a predicate in another.
    sep = r"(?<=[.!?])\s+|\n\n+"
    if path.endswith((".py", ".sql", ".json")):
        sep = r"(?<=[.!?])\s+|\n"
    for raw in re.split(sep, text):
        s = " ".join(raw.split())
        if len(s) >= 12:
            yield s


PROXIMITY = 120


def hits_for(sentence, pat):
    unless = pat.get("unless")
    if unless and re.search(unless, sentence, re.I):
        return False
    if pat.get("phrase"):
        if not re.search(pat["phrase"], sentence, re.I):
            return False
        return not NEGATION.search(sentence)
    subs = [m for m in re.finditer(pat["subject"], sentence, re.I)]
    preds = [m for m in re.finditer(pat["predicate"], sentence, re.I)]
    if not subs or not preds:
        return False
    # A subject and a predicate in the same sentence but 200 characters apart
    # are usually two unrelated labels on one diagram, not a claim. Require
    # them close enough to actually be about each other.
    near = any(abs(s.start() - p.start()) <= PROXIMITY for s in subs for p in preds)
    if not near:
        return False
    return not NEGATION.search(sentence)


def main():
    # ---- canaries first. A checker that cannot fail is not a checker. ----
    broken = []
    for pat in PATTERNS:
        if not hits_for(pat["canary"], pat):
            broken.append(pat["name"])
    if broken:
        print("CHECK IS BROKEN. These patterns did not catch their own canary:")
        for b in broken:
            print("  %s" % b)
        print("\nA clean result from this script would have meant nothing.")
        return 2
    print("canaries: %d/%d patterns caught their own test string" % (len(PATTERNS), len(PATTERNS)))

    files = []
    for g in SCAN:
        files.extend(sorted(ROOT.glob(g)))

    findings = []
    for f in files:
        rel = str(f.relative_to(ROOT))
        if rel in EXEMPT:
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except Exception:
            continue
        for s in sentences(text, rel):
            for pat in PATTERNS:
                if hits_for(s, pat):
                    findings.append((rel, pat["name"], pat["clause"], s))

    print("scanned %d files across %d globs, %d exempt by path"
          % (len(files), len(SCAN), len(EXEMPT)))

    if not findings:
        print("\nno prohibited claims found")
        return 0

    print("\n%d prohibited claim(s):\n" % len(findings))
    for rel, name, clause, s in findings:
        print("  %s" % rel)
        print("    rule    %s" % name)
        print("    clause  %s" % clause)
        print("    said    %s" % (s[:220] + ("..." if len(s) > 220 else "")))
        print()
    return 1


if __name__ == "__main__":
    sys.exit(main())
