#!/usr/bin/env python3
"""Cross-check citation claim ids against the markup, both directions.

Run this AFTER every edit to citations.json or to either page, and run it last
before a commit. It was reported clean once from a stale run: the drawers were
regenerated afterwards, which wiped a data-claim attribute, and the stale
result said fourteen of fourteen while the tree actually had thirteen. A check
is only worth the moment it was run.

    python3 scripts/check_claims.py
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = {"index": "public/index.html", "science": "public/science.html"}



# ---------------------------------------------------------------------
# Undeclared empirical claims.
#
# Checks A to D only ever see claims that were DECLARED. A sentence that
# asserts something about the world and carries no data-claim passes all of
# them silently, which is the gap this closes.
#
# This is a RAW count and it needs a human. It over-reports: a sentence about
# what the program does, or a boundary statement, trips the same vocabulary.
# Judge by what the sentence asserts, the same standard as the model audit.
# Do not "fix" a number here by loosening the pattern.
# ---------------------------------------------------------------------
EMPIRICAL = re.compile(
    r"\b(studies?|research|evidence|trial|cohort|meta[- ]analysis|literature|"
    r"predicts?|predictor|associated|association|correlat\w*|linked|causes?|"
    r"shown|found|showed|mortality|risk of|reduces?|increases?|lowers?|raises?|"
    r"live[sd]? (roughly|about|around)|turn over|half[- ]life|reflects?|captures?|"
    r"is the most|most responsive|years before|percent|%)\b", re.I)

# the site describing its own process is not an empirical claim about the world
SELF = re.compile(
    r"\b(we (measure|take|draw|check|log|score|send|ask|show|talk|use|do|will|"
    r"sell|give|tell|report|refer)|you (get|give|follow|log|tap|start|pay|apply|"
    r"can|will|book)|the protocol|this program|the portal|your portal|"
    r"applying|application|the fee|costs?|billed?|payment)\b", re.I)

BLOCK = re.compile(r"<(p|li|h2|h3|summary|b)\b[^>]*>(.*?)</\1>", re.S)


def undeclared():
    import html as _html
    out = {}
    for page, f in PAGES.items():
        t = (ROOT / f).read_text()
        t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S)
        t = re.sub(r'<details class="refs">.*?</details>', " ", t, flags=re.S)
        hits = []
        for m in BLOCK.finditer(t):
            raw = m.group(0)
            declared = "data-claim=" in raw
            if not declared:
                k = t.rfind("<p", 0, m.start())
                if k != -1 and "data-claim=" in t[k:m.start() + 4]:
                    declared = True
            if declared:
                continue
            txt = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
            for s in re.split(r"(?<=[.!?])\s+", txt):
                s = s.strip()
                if len(s.split()) < 5:
                    continue
                if EMPIRICAL.search(s) and not SELF.search(s):
                    if s not in hits:
                        hits.append(s)
        out[page] = hits
    return out


def main():
    cits = json.loads((ROOT / "public/data/citations.json").read_text())["citations"]

    declared = {}
    for c in cits:
        for s in c["supports"]:
            declared.setdefault((s["page"], s["claim"]), []).append(c["id"])

    markup = {}
    for page, f in PAGES.items():
        for m in re.finditer(r'data-claim="([^"]+)"', (ROOT / f).read_text()):
            k = (page, m.group(1))
            markup[k] = markup.get(k, 0) + 1

    problems = []
    for k in sorted(declared):
        if k not in markup:
            problems.append("in the JSON, not in the markup: %s %s (cited by %s)"
                            % (k[0], k[1], ", ".join(declared[k])))
    for k in sorted(markup):
        if k not in declared:
            problems.append("in the markup, no citation: %s %s" % k)
    for k, n in sorted(markup.items()):
        if n > 1:
            problems.append("duplicate claim id on a page: %s %s x%d" % (k[0], k[1], n))

    ids = {c["id"] for c in cits}
    for page, f in PAGES.items():
        t = (ROOT / f).read_text()
        for m in re.finditer(r'href="#cite-([^"]+)">(\d+)<', t):
            cid, shown = m.group(1), int(m.group(2))
            if cid not in ids:
                problems.append("marker cites an id not in the file: %s %s" % (page, cid))
            elif 'id="cite-%s"' % cid not in t:
                problems.append("marker has no drawer entry: %s %s" % (page, cid))
            else:
                k = t.index('id="cite-%s"' % cid)
                n = int(re.search(r'<span class="cite-n">(\d+)</span>', t[k:k + 300]).group(1))
                if n != shown:
                    problems.append("number mismatch: %s %s marker %d drawer %d"
                                    % (page, cid, shown, n))

    # every doi or url must be present; never both null
    for c in cits:
        if not c.get("doi") and not c.get("url"):
            problems.append("no doi and no url: %s" % c["id"])

    print("claim ids declared %d, in markup %d" % (len(declared), len(markup)))
    if problems:
        for p in problems:
            print("  " + p)
        sys.exit(1)
    print("ok: both directions match, no duplicates, every marker resolves")

    u = undeclared()
    total = sum(len(v) for v in u.values())
    print("undeclared empirical claims (raw, needs judgement): %d  [%s]"
          % (total, ", ".join("%s %d" % (k, len(v)) for k, v in sorted(u.items()))))
    for page in sorted(u):
        for s in u[page]:
            print("    %-8s %s" % (page, s[:118]))


if __name__ == "__main__":
    main()
