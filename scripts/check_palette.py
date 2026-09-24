#!/usr/bin/env python3
"""Is every colour the site serves on Dawn?

    python3 scripts/check_palette.py          # exit 1 if anything is off-palette

WHY THIS READS brand/tokens.json AND NOT A LIST IN THIS FILE
------------------------------------------------------------
The first version of this check carried a hand-written map of 28 old hex
values. It scored public/assets/mark-atom.svg as "Dawn" while that file held
more than twenty old-palette values in its orbit, spindle and lettering
gradients, because those particular values were not among the 28 it knew.

That is the list-versus-population failure happening INSIDE the tool built to
catch the list-versus-population failure. A check assembled from colours you
already suspect can only ever confirm your suspicion.

So membership is derived. brand/tokens.json is generated from the :root block
of public/styles.css and is the only source of brand colour. A colour passes if
it is a token, or a neutral, or a tint or shade sharing a token's hue, which is
how every Dawn ramp was built. Anything else is reported, including colours
nobody has thought of yet.
"""
import colorsys
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HEX = re.compile(r'#([0-9A-Fa-f]{6})\b')
RGBA = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)')

HUE_TOLERANCE = 0.055      # a ramp keeps its hue; this is how far it may drift
GREY_SATURATION = 0.12     # below this a colour is neutral and always allowed


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hsv(c):
    return colorsys.rgb_to_hsv(*[x / 255 for x in c])


def load_tokens():
    doc = json.loads((ROOT / "brand" / "tokens.json").read_text(encoding="utf-8"))
    return {k: rgb(v.lstrip("#")) for k, v in doc["tokens"].items()}


def classify(c, tokens):
    """token | neutral | ramp of <token> | OFF-PALETTE"""
    for name, t in tokens.items():
        if c == t:
            return "token " + name
    h, s, v = hsv(c)
    if s < GREY_SATURATION:
        return "neutral"
    best = None
    for name, t in tokens.items():
        th, ts, tv = hsv(t)
        if ts < GREY_SATURATION:
            continue
        d = abs(h - th)
        d = min(d, 1 - d)                       # hue is a circle
        if d <= HUE_TOLERANCE and (best is None or d < best[0]):
            best = (d, name)
    return "ramp of " + best[1] if best else "OFF-PALETTE"


def colours_in(path):
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return set()                            # a raster is sampled separately
    out = {rgb(m.group(1)) for m in HEX.finditer(text)}
    out |= {(int(a), int(b), int(c)) for a, b, c in RGBA.findall(text)}
    return out


def main():
    tokens = load_tokens()
    print("palette source: brand/tokens.json, %d tokens\n" % len(tokens))
    # brand/svg held the v4 originals and was deleted on 2026-09-24. The glob
    # stays so the count is visible: if it ever returns files again, someone has
    # restored the old identity and the report will say so rather than ignoring
    # a directory that is supposed to be empty.
    globs = ["public/**/*.svg", "public/**/*.css", "public/**/*.html"]
    archive = sorted(ROOT.glob("brand/svg/*.svg"))
    files = sorted({p for g in globs for p in ROOT.glob(g) if p.is_file()})
    bad = []
    scanned = 0
    for p in files:
        scanned += 1
        off = sorted({c for c in colours_in(p) if classify(c, tokens) == "OFF-PALETTE"})
        if off:
            rel = str(p.relative_to(ROOT))
            bad.append((rel, off))
    print("scanned %d served file(s) across %d glob(s)" % (scanned, len(globs)))
    print("brand/svg: %d file(s). The v4 originals were deleted; anything here is\n"
          "           a restoration and wants explaining.\n" % len(archive))
    if not bad:
        print("every colour resolves to a token, a neutral, or a token's ramp")
        return 0
    print("%d file(s) carry off-palette colour:" % len(bad))
    for rel, off in bad:
        print("  %s" % rel)
        print("      %s" % " ".join("#%02X%02X%02X" % c for c in off[:14]))
    return 1


if __name__ == "__main__":
    sys.exit(main())
