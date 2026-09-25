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
    # Brief 06 section 0.5: the agents inherit these prohibitions, so the suite
    # runs against agent output FIXTURES, not only against pages and PDFs. A
    # rule that only ever sees static files cannot catch what an agent says.
    "tests/fixtures/agent/*.txt",
    "tests/fixtures/agent/*.json",
    "corpus/book/*.md",
    "public/*.html",
    "public/portal/*.html",
    "public/portal/*.js",
    "public/data/citations.json",
    "program-docs/*.py",
    "functions/api/*.js",
    "database/migrations/*.sql",
    # SVGs were never scanned. They are nothing BUT fill and stroke
    # attributes, so they were the largest blind spot behind the largest
    # blind spot: the attribute lift above is what makes scanning them work.
    "public/assets/*.svg",
    "brand/svg/*.svg",
    "public/*.svg",
    # The portal's own pages and the legal set.
    "public/portal/admin/*.html",
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
    # The book discusses structured water and the charging claim in order to
    # REFUTE them, at length, in Chapters 4, 7 and 14. It is canonical, brief 06
    # says it is committed unchanged and edited in the manuscript rather than in
    # the repo, so the claim-shape rules cannot act on it. They still act on
    # every surface that QUOTES it. The brand and em-dash rules are NOT exempt
    # here, because those are about the text as it reaches an agent's voice.
    dict(
        name="structured-or-energized-water",
        exempt_prefix=("corpus/book/",),
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
        exempt_prefix=("corpus/book/",),
        clause="3.1: still forbidden, that sunlight charges the body the way a "
               "charger fills a phone",
        subject=r"\b(sun|sunlight|light|photon\w*)\b",
        predicate=r"\b(charge[sd]?|charging|recharge\w*|fill\w*)\b.{0,30}"
                  r"\b(you|your body|the body|your batter\w*|cells?)\b",
        canary="Morning sunlight charges your body the way a charger fills a phone.",
    ),
    dict(
        name="coverage-or-n-of-eight",
        clause="2, rule 2: no coverage figure, fraction, or 'n of 8' string "
               "about the MODEL or the composite. Narrowed 2026-09-24: brief 06 "
               "section 6 rule 4 requires a SCORED dimension to show how many "
               "of its own markers arrived, and that is a different statement. "
               "The banned one says the model is incomplete because of the "
               "participant, which it never is: charge, redox and leak have no "
               "instrument and nobody's blood could fill them. The required one "
               "says this draw was missing a marker, which is a fact about a "
               "draw and is the member's to know. So the subject is now the "
               "model and the composite, not any sentence containing the word "
               "coverage",
        subject=r"\b(the model|composite|batter\w* score|your score|dimensions?)\b",
        predicate=r"\b\d+\s*(of|/)\s*(8|eight)\b|\bcoverage of the model\b|"
                  r"\bpercent of the model\b|\bcovers?\b[^.]{0,30}\b(of|/)\s*(8|eight)\b|"
                  r"\bincomplete\b",
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
        name="d3-outside-the-vitamin-d-sentence",
        clause="brief 06A A5: the programme names no supplement, with ONE "
               "exception. The token D3 may appear only inside the agreed "
               "vitamin D sentence, which puts sunlight first, food second, "
               "and D3 last and conditional. Anywhere else it is a supplement "
               "recommendation wearing a shorter name. No brand, no dose",
        subject=r"\bD3\b",
        predicate=r".",
        # Two exemptions, and they are different in kind.
        # The first is the agreed sentence, which is the whole allowance.
        # The second is SKIN CHEMISTRY: previtamin D3 and cholecalciferol are
        # what the body makes from sunlight. Naming the molecule the skin
        # produces is not recommending a capsule, and the book and /science
        # both do it. Writing this as an exemption rather than narrowing the
        # subject keeps the rule readable: it still says "D3 is not allowed",
        # and then says exactly where it is.
        unless=r"sun is not available, D3 may be needed|previtamin D3|"
               r"cholecalciferol|D3 is made in the skin|skin makes|"
               # a citation id or any hyphenated identifier, e.g.
               # holick-1980-previtamin-d3
               r"[\-\"/]d3\b|\bd3[\-\"/]",
        canary="Take D3 at 5,000 IU with breakfast.",
        # The book is canonical, is committed unchanged, and discusses D3
        # critically in the chapter about why the supplementation trials
        # underperformed. Migrations are internal SQL comments no agent
        # reads.
        exempt_prefix=("corpus/book/", "database/migrations/"),
    ),
    dict(
        name="supplement-brand-or-price-where-an-agent-can-say-it",
        clause="brief 06 section 0.5: the agents inherit the deliverables' "
               "prohibitions. A supplement brand or a price reaching the corpus "
               "reaches the coach's mouth, and check_deliverables only ever "
               "looks at the eight deliverables, so nothing was watching the "
               "corpus or the agent fixtures at all",
        phrase=r"Dragon Herbs|Pure Encapsulations|Baja Gold|Life Extension|BioPure|"
               r"Gaia Herbs|Quicksilver|Thorne|Nutrex|Sun Chlorella|Vital Proteins|"
               r"Cowboy Colostrum|BLUblox|BlockBlueLight|Bon Charge|Ra Optics|TrueDark|"
               r"Ocushield|Crazy Water|Saratoga|Icelandic Glacial|Ice Barrel|SaunaSpace|"
               r"Any Lab Test Now|Labcorp|Ulta Lab",
        literal=True,
        canary="Take Dragon Herbs Super Adaptogen, 3 capsules each morning.",
        # The book discusses supplements critically, which is the opposite of
        # recommending them, and CLAUDE.md 8e keeps Chapters 6 and 11 as they
        # are. It names no brand: grepped, zero hits. If one ever appears there
        # this rule will say so, because the book is NOT exempt from it.
    ),
    dict(
        name="price-in-text-an-agent-retrieves",
        clause="brief 06 section 0.5: no price anywhere an agent can say it. "
               "Scoped to the corpus and the agent fixtures, NOT to the site or "
               "the migrations, where the programme fee legitimately appears as "
               "seed data. The fee belongs in program_settings and a price in a "
               "retrievable passage goes stale silently, which is the same class "
               "of problem the brand rule exists to remove",
        phrase=r"\$\s?\d",
        literal=True,
        canary="The kit is $109.95 and you order it yourself.",
        only_prefix=("corpus/", "tests/fixtures/agent/"),
    ),
    dict(
        name="em-dash-in-user-facing-text",
        clause="style: no em dashes in anything a user reads, agent output "
               "included. An em dash in a corpus source becomes an em dash in "
               "the coach's voice, because the coach writes in the register of "
               "what it retrieves, and that is almost impossible to trace back "
               "afterwards",
        phrase="\u2014",
        literal=True,
        canary="The battery is trillions of cells \u2014 not one.",
        # Migrations are SQL comments that no client and no agent ever reads,
        # and _voice.js line 132 is the STRIPPER: the regex character class that
        # removes em dashes from agent output. The rule fired on the code that
        # enforces the rule, which is the most ironic false positive available.
        exempt_prefix=("database/migrations/", "functions/api/_voice.js"),
    ),
    dict(
        name="retired-hex-b4653a",
        clause="brand: the old --copper #B4653A is retired. It differs from the "
               "brand copper #B4794F by one digit in each channel and will be "
               "'corrected' into it by someone later, so the literal string must "
               "not come back",
        phrase=r"#B4653A",
        literal=True,
        canary="The accent is #B4653A on the panel.",
    ),
    dict(
        name="plain-copper-on-a-raised-panel",
        clause="brand: plain copper #B4794F falls to 4.08:1 on surface-raised "
               "#1C2742 and fails. On a panel the only copper that passes is "
               "copper-light #D9A87A at 6.93:1",
        subject=r"(surface-raised|#1C2742|--surface-raised|\.card|\.panel)",
        predicate=r"(#B4794F|--copper-brand|var\(--copper-brand\))",
        canary="The .card heading uses #B4794F on #1C2742.",
    ),
    dict(
        name="status-colour-without-a-word",
        clause="brand: every status colour ships with an icon AND a word. "
               "Colour alone never carries state. status-good and chart-3 are "
               "both green and are kept apart by this rule, not by hue",
        # A status token applied to an element whose only content is the
        # colour. Catches the shape "<span class=x style=color:status>" with
        # no text, and a rule that sets only a status colour on a bare class.
        subject=r"(--status-(?:good|warn|critical)|#3FA97D|#D9A441|#E0705E|"
                r"#1F6B4A|#8A5A0F|#A32E22)",
        predicate=r"(content\s*:\s*[\"\']\s*[\"\']|aria-hidden|<span[^>]*>\s*</span>|"
                  r"title\s*=\s*[\"\'][\"\'])",
        canary='<span class="dot" style="color:#3FA97D" aria-hidden="true"></span>',
    ),
    dict(
        name="more-than-one-amber-per-view",
        clause="2 and the README: ONE dawn-amber moment per view. A single "
               "figure, a single call to action, a single rule. Amber "
               "everywhere turns this into a finance dashboard, which is the "
               "only way the direction fails",
        # Counted per FILE rather than per sentence, because "per view" is a
        # property of the page, not of a line. Any file naming the amber more
        # than twice is placing more than one moment: twice covers a token
        # definition plus a single use.
        per_file=dict(pattern=r"#E8A24A|--dawn-amber|dawn-amber", limit=2),
        canary="#E8A24A #E8A24A #E8A24A",
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


# A string inside a "counters" array in citations.json IS the forbidden claim,
# recorded so a citation can be attached to refuting it. Scanning it is the
# same mistake as flagging a negation: the product is not asserting it, it is
# filing the evidence against it.
COUNTER_FIELD = re.compile(r'"(counters|claims)"\s*:\s*\[.*?\]', re.S)


def sentences(text, path=""):
    if path.endswith("citations.json"):
        text = COUNTER_FIELD.sub(" ", text)
    # Internal comments are not participant-facing. A SQL comment explaining
    # why a rule exists is not the product asserting it.
    if path.endswith(".sql"):
        text = re.sub(r"^\s*--.*$", " ", text, flags=re.M)
    if path.endswith(".py"):
        text = re.sub(r"^\s*#.*$", " ", text, flags=re.M)
    # Tag stripping is for prose, but style and fill attributes live INSIDE
    # tags, and that is exactly where a brand colour hides. Lift those out
    # before the tags go, or the checker is blind to every inline style.
    # Found by reinstating a known-bad line and watching the lint stay clean:
    #   <div class="kicker" style="color:#B4653A">
    lifted = " ".join(re.findall(
        r'(?:style|fill|stroke|color|bgcolor)\s*=\s*["\']([^"\']*)["\']', text, re.I))
    text = re.sub(r"<[^>]+>", " ", text)
    if lifted:
        text = text + "\n" + lifted
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
    if pat.get("per_file"):
        return False
    unless = pat.get("unless")
    if unless and re.search(unless, sentence, re.I):
        return False
    if pat.get("phrase"):
        if not re.search(pat["phrase"], sentence, re.I):
            return False
        # A literal banned string is banned whatever surrounds it. The negation
        # guard exists so a sentence DENYING a claim is not flagged, which makes
        # sense for prose and no sense for a retired hex. Without this, CSS like
        # ".chip.no{color:#B4653A}" was excused because "no" is a negation word,
        # and the lint reported clean while three instances survived. Found by
        # grepping independently instead of trusting the check.
        if pat.get("literal"):
            return True
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
        pf = pat.get("per_file")
        if pf:
            import re as _re
            if len(_re.findall(pf["pattern"], pat["canary"], _re.I)) <= pf["limit"]:
                broken.append(pat["name"])
            continue
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
    for pat in PATTERNS:
        pf = pat.get("per_file")
        if not pf:
            continue
        import re as _re
        for f in files:
            rel = str(f.relative_to(ROOT))
            if rel in EXEMPT or rel.startswith(pat.get("exempt_prefix", ())):
                continue
            if pat.get("only_prefix") and not rel.startswith(pat["only_prefix"]):
                continue
            try:
                raw = f.read_text(encoding="utf-8")
            except Exception:
                continue
            n = len(_re.findall(pf["pattern"], raw, _re.I))
            if n > pf["limit"]:
                findings.append((rel, pat["name"], pat["clause"],
                                 "%d occurrences, limit %d" % (n, pf["limit"])))
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
                if rel.startswith(pat.get("exempt_prefix", ())):
                    continue
                if pat.get("only_prefix") and not rel.startswith(pat["only_prefix"]):
                    continue
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
