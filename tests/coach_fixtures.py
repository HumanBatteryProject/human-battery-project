#!/usr/bin/env python3
"""Ten member questions, each with what the coach must do with it.

    python3 tests/coach_fixtures.py

Brief 06 section 4 rule 6. These exercise the parts that are decided in CODE,
not by the model: the medical classifier, the screening-row quoting, the tier
gate and the Score disclaimer. That is deliberate. A fixture that asserts on
model prose tests the weather; a fixture that asserts on the branch tests the
design.

The classifier is re-implemented here only in the sense of being IMPORTED
through a small JS shim, so the thing under test is the shipped file and not a
copy of it. If functions/api/_medical.js changes, this moves with it.
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

CASES = [
    # question, expected route, must quote a screening row, score disclaimer
    ("Should I stop taking my blood pressure medication now that I am doing the sauna?",
     "prescriber", True,  False),
    ("I am on lithium. Is the sauna safe for me?",
     "prescriber", True,  False),
    ("I take levothyroxine every morning. Does the eating window change that?",
     "prescriber", True,  False),
    ("I have been having chest pain when I walk up the stairs.",
     "urgent",     False, False),
    ("Can I halve my metformin dose if my glucose comes down?",
     "prescriber", True,  False),
    ("Do I have diabetes?",
     "prescriber", False, False),
    ("Why does morning light matter so much in this program?",
     "coach",      False, False),
    ("What is my Battery Score actually measuring?",
     "coach",      False, True),
    ("What does the book say about structured water?",
     "coach",      False, False),
    ("Should I take creatine with breakfast?",
     "coach",      False, False),
]

SHIM = """
import { classify } from '../functions/api/_medical.js';
import { SCORE_TRIGGER } from '../functions/api/_evidence.js';
const qs = JSON.parse(process.argv[2]);
console.log(JSON.stringify(qs.map(q => {
  const v = classify(q);
  return { route: v.route, rows: v.rows.map(r => r.on), score: SCORE_TRIGGER.test(q) };
})));
"""


def run_shim(questions):
    p = ROOT / "tests" / "_shim.mjs"
    p.write_text(SHIM, encoding="utf-8")
    try:
        r = subprocess.run(["node", str(p), json.dumps(questions)],
                           capture_output=True, text=True, cwd=str(ROOT))
        if r.returncode:
            print("shim failed:\n" + r.stderr[:600])
            sys.exit(2)
        return json.loads(r.stdout)
    finally:
        p.unlink(missing_ok=True)


def screening_matches_source():
    """The screening rows in _medical.js must still match the protocol."""
    doc = (ROOT / "docs" / "HBP-Protocol-Complete.md").read_text(encoding="utf-8")
    i = doc.index("## Medication check at intake")
    j = doc.index("## Who skips what")
    rows = [l for l in doc[i:j].split("\n")
            if l.startswith("| ") and "---" not in l and "On this" not in l]
    src = (ROOT / "functions" / "api" / "_medical.js").read_text(encoding="utf-8")
    missing = []
    for r in rows:
        on = r.split("|")[1].strip()
        if on and ("'" + on + "'") not in src and ('"' + on + '"') not in src:
            missing.append(on)
    return len(rows), missing


def main():
    n_rows, missing = screening_matches_source()
    print("screening table: %d row(s) in the protocol, %d missing from _medical.js"
          % (n_rows, len(missing)))
    if missing:
        print("  MISSING: %s" % missing)

    got = run_shim([c[0] for c in CASES])
    print("\n%-62s %-11s %-11s %s" % ("question", "expected", "got", "verdict"))
    bad = 0
    for (q, want_route, want_row, want_score), g in zip(CASES, got):
        ok = g["route"] == want_route
        if want_row and not g["rows"]:
            ok = False
        if g["score"] != want_score:
            ok = False
        if not ok:
            bad += 1
        print("%-62s %-11s %-11s %s%s" % (
            q[:62], want_route, g["route"], "ok" if ok else "FAIL",
            "" if not g["rows"] else "  rows=" + ",".join(g["rows"])))
    print("\n%d of %d cases pass" % (len(CASES) - bad, len(CASES)))
    return 1 if (bad or missing) else 0


if __name__ == "__main__":
    sys.exit(main())
