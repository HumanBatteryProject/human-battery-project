#!/usr/bin/env python3
"""The JavaScript claim-shape audit has not fallen behind the Python one.

    python3 scripts/check_claimshape_parity.py
    python3 scripts/check_claimshape_parity.py --seed

WHY THERE ARE TWO AUDITS AT ALL.

scripts/check_prohibitions.py runs over the repository in the commit gate. The
research agent writes a summary paragraph straight into the database, where the
coach retrieves it and speaks in its voice. That paragraph is never a file, so
the Python audit cannot see it, and by the time anyone could read it the coach
has already said it. So functions/api/_claimshape.js runs the same audit at
write time, in the runtime.

Two copies of a rule drift, and the copy that drifts is always the one nobody
is reading. This check is the thing that makes the drift loud.

WHAT IT COMPARES. Pattern NAMES, in both directions:

  - a text pattern in the Python audit that the JavaScript lacks is a hole: a
    claim shape the gate catches in a file and the coach would say out loud.
  - a pattern in the JavaScript that the Python lacks is the opposite problem
    and is still a disagreement, so it fails too.

WHAT IT DOES NOT COMPARE. The regular expressions themselves. Two regexes can
differ in syntax and agree in meaning, and Python and JavaScript genuinely
differ on some of it. Comparing the source strings would fail on correct code
and would then be weakened until it passed, which is worse than not having it.
What holds the behaviour together is that every pattern carries a canary and
both sides fire every canary: see auditCanaries() in the JavaScript and the
canary pass at the top of check_prohibitions.py.

COLOUR PATTERNS ARE DELIBERATELY OUT OF SCOPE, and the list is named below
rather than inferred. A research summary is a paragraph of prose with no
stylesheet, no hex value and no inline style attribute, so a retired brand
colour cannot appear in one. Naming them here means adding a twelfth colour
pattern to the Python audit does not silently fail this check, and adding a
twelfth PROSE pattern does.
"""
import importlib.util
import re
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
JS = ROOT / "functions" / "api" / "_claimshape.js"
PY = ROOT / "scripts" / "check_prohibitions.py"

# Named, not inferred. See the docstring.
COLOUR_ONLY = {
    "retired-hex-b4653a",
    "plain-copper-on-a-raised-panel",
    "status-colour-without-a-word",
    "more-than-one-amber-per-view",
}


def python_pattern_names():
    spec = importlib.util.spec_from_file_location("check_prohibitions", PY)
    mod = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, [str(PY), "--parity-probe"]
    try:
        spec.loader.exec_module(mod)
    except SystemExit:
        pass
    finally:
        sys.argv = argv
    pats = getattr(mod, "PATTERNS", None)
    if not pats:
        raise SystemExit("could not read PATTERNS out of %s" % PY.name)
    return {p["name"] for p in pats}


def js_pattern_names(text=None):
    src = text if text is not None else JS.read_text()
    # The names live in `name: '...'` entries inside the PATTERNS array. Read
    # them from the file rather than running node, so this check has no
    # runtime dependency and can run anywhere the gate runs.
    names = set(re.findall(r"^\s*name:\s*'([a-z0-9-]+)'", src, re.M))
    if not names:
        raise SystemExit("could not read any pattern names out of %s" % JS.name)
    return names


def compare(py_names, js_names):
    text_only = py_names - COLOUR_ONLY
    missing_in_js = sorted(text_only - js_names)
    extra_in_js = sorted(js_names - py_names)
    stale_exclusions = sorted(COLOUR_ONLY - py_names)
    return missing_in_js, extra_in_js, stale_exclusions


def main():
    py_names = python_pattern_names()
    js_names = js_pattern_names()
    missing, extra, stale = compare(py_names, js_names)

    if missing or extra or stale:
        print("  CLAIM-SHAPE PARITY FAILED:")
        for n in missing:
            print("    %s is in the Python audit and not in the JavaScript one." % n)
            print("      The gate would catch it in a file and the coach could still say it.")
        for n in extra:
            print("    %s is in the JavaScript audit and not in the Python one." % n)
        for n in stale:
            print("    %s is excluded as colour-only but no longer exists in the "
                  "Python audit. Remove it from COLOUR_ONLY." % n)
        return 1

    print("  claim-shape parity ok: %d prose patterns in both, %d colour patterns "
          "excluded by name, %d total in the Python audit"
          % (len(js_names), len(COLOUR_ONLY), len(py_names)))
    return 0


def seed():
    """
    Prove this check can fail, in both directions.

    A parity check that has only ever seen two files that agree is a check that
    has never been asked a question.
    """
    print("  check_claimshape_parity --seed\n")
    py_names = python_pattern_names()
    js_names = js_pattern_names()
    bad = 0

    # 1. Python gains a prose pattern the JavaScript lacks.
    m, e, s = compare(py_names | {"a-new-prose-pattern"}, js_names)
    ok = m == ["a-new-prose-pattern"]
    bad += 0 if ok else 1
    print("    %-7s a new prose pattern in Python is reported missing from the JavaScript"
          % ("ok" if ok else "FAILED"))

    # 2. The JavaScript loses one it should have.
    dropped = sorted(js_names)[0]
    m, e, s = compare(py_names, js_names - {dropped})
    ok = dropped in m
    bad += 0 if ok else 1
    print("    %-7s a pattern deleted from the JavaScript is reported missing (%s)"
          % ("ok" if ok else "FAILED", dropped))

    # 3. A colour pattern in Python is NOT reported, which is the exclusion
    #    doing its job rather than the check being blind.
    m, e, s = compare(py_names, js_names)
    ok = not m and not e and not s
    bad += 0 if ok else 1
    print("    %-7s the four colour patterns are excluded and the real set agrees"
          % ("ok" if ok else "FAILED"))

    # 4. A stale exclusion is caught.
    m, e, s = compare(py_names - {"retired-hex-b4653a"}, js_names)
    ok = s == ["retired-hex-b4653a"]
    bad += 0 if ok else 1
    print("    %-7s an exclusion for a pattern Python no longer has is reported stale"
          % ("ok" if ok else "FAILED"))

    print()
    if bad:
        print("  %d seeded case(s) did not behave as described." % bad)
        return 1
    print("  the check fails in both directions and the exclusion list is live.")
    return 0


if __name__ == "__main__":
    sys.exit(seed() if "--seed" in sys.argv else main())
