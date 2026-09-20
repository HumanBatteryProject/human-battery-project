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


if __name__ == "__main__":
    main()
