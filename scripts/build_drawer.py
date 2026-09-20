#!/usr/bin/env python3
"""Regenerate the citation drawers and marker numbers from citations.json.

The drawer is derived data. Editing citations.json without running this leaves
the page showing the old text, and it has already happened twice: once leaving
two markers pointing at a source with no drawer entry, once leaving a relevance
note that had been rewritten in the JSON.

Run this after ANY edit to public/data/citations.json, then run
scripts/check_claims.py last.

    python3 scripts/build_drawer.py
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = {"index": "public/index.html", "science": "public/science.html"}
LABEL = {"human_rct": "Randomised trial in people",
         "human_observational": "Observational, in people",
         "animal": "Animal study", "cell": "Cell study",
         "review": "Review or meta-analysis", "theory": "Theory"}
TIERN = {"established": "1", "contested": "2", "working model": "3"}


def main():
    cits = json.loads((ROOT / "public/data/citations.json").read_text())["citations"]
    for page, f in PAGES.items():
        used = sorted((c for c in cits if any(s["page"] == page for s in c["supports"])),
                      key=lambda c: c["year"])
        num = {c["id"]: i for i, c in enumerate(used, 1)}

        rows = ""
        for c in used:
            au = ", ".join(c["authors"][:3]) + (" et al" if len(c["authors"]) > 3 else "")
            rows += ('        <li id="cite-%s">\n'
                     '          <p class="cite-head"><span class="cite-n">%d</span> %s'
                     ' <span class="tier tier-%s">%s</span></p>\n'
                     '          <p class="cite-ref">%s. %s. <i>%s</i>, %d.</p>\n'
                     '          <p class="cite-why">%s</p>\n'
                     '          <p class="cite-doi"><a href="%s" rel="noopener">%s</a></p>\n'
                     '        </li>\n'
                     % (c["id"], num[c["id"]], html.escape(LABEL[c["study_type"]]),
                        TIERN[c["evidence_tier"]], html.escape(c["evidence_tier"]),
                        html.escape(au), html.escape(c["title"]), html.escape(c["journal"]),
                        c["year"], html.escape(c["relevance"]),
                        html.escape(c["url"]), html.escape(c["doi"] or c["url"])))
        drawer = ('    <details class="refs">\n      <summary>Sources</summary>\n'
                  '      <ol class="cite-list">\n' + rows + '      </ol>\n    </details>')

        path = ROOT / f
        t = path.read_text(encoding="utf-8")
        m = re.search(r'[ \t]*<details class="refs">.*?</details>', t, re.S)
        if not m:
            raise SystemExit("%s: no drawer to replace" % f)
        t = t[:m.start()] + drawer + t[m.end():]

        def renum(mo):
            cid = mo.group(1)
            if cid not in num:
                raise SystemExit("%s: marker cites %s, which is not used on this page" % (f, cid))
            return '<a class="cite" href="#cite-%s">%d</a>' % (cid, num[cid])

        t, n = re.subn(r'<a class="cite" href="#cite-([^"]+)">\d+</a>', renum, t)
        path.write_text(t, encoding="utf-8")
        print("%s: %d sources, %d markers renumbered" % (f, len(used), n))


if __name__ == "__main__":
    main()
