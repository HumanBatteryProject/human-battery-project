#!/usr/bin/env python3
"""The Battery Kitchen, as a program PDF.

This existed only as an artifact and was rendered to PDF once, by hand, from
an inline script. That meant it had no build step, so when the palette moved
it was the one document that did not follow: it still carried the old teal,
green, steel and navy while every other PDF had been swept. A document with
no build script is a document that silently goes stale.

    <venv>/bin/python kitchen_doc.py

Recipe data lives in kitchen_data.json beside this file, parsed once from the
artifact. The artifact builds its two grids from a JS array at runtime, so
printing the page directly produces two empty sections.
"""
import html as H
import json
import os
import pathlib

from weasyprint import HTML

HERE = pathlib.Path(__file__).resolve().parent
OUT = os.environ.get("HBP_OUT", str(HERE / "out"))
os.makedirs(OUT, exist_ok=True)

# Ivory body, per the Dawn split: documents are read at length and printed.
PAGE, RAISED = "#FBF9F5", "#F4EFE4"
INK, MUTED, RULE = "#1A1714", "#6E655C", "#E4DED2"
COPPER_DEEP, COPPER_MID = "#7A4A2E", "#9C603C"
FIELD, INK_ON_FIELD = "#0E1424", "#F6F1E7"

CSS = f"""
@page {{ size: A4; margin: 16mm 14mm 14mm; }}
body {{ font-family: Spectral, Georgia, serif; font-size: 10pt; line-height: 1.45;
        color: {INK}; background: {PAGE}; }}

/* The title page is the field. The mark goes here once the PNG lands; the
   gap is deliberate and sized to the clear-space rule, 64px at 96dpi. */
.title {{ background: {FIELD}; color: {INK_ON_FIELD}; height: 265mm;
          padding: 24mm 20mm; page-break-after: always; }}
.markgap {{ height: 17mm; margin-bottom: 8mm; }}
.title h1 {{ font-family: Archivo, Helvetica, sans-serif; font-size: 30pt;
             line-height: 1.15; margin: 0 0 6mm; }}
.title p {{ color: #A8A096; font-size: 12pt; max-width: 120mm; }}

h2 {{ font-family: Archivo, Helvetica, sans-serif; font-size: 13pt;
      color: {COPPER_DEEP}; margin: 8mm 0 3mm; padding-top: 3mm;
      border-top: 2px solid {COPPER_MID}; }}
.stand {{ color: {MUTED}; margin: 0 0 6mm; }}
.r {{ page-break-inside: avoid; margin: 0 0 6mm; padding-bottom: 4mm;
      border-bottom: 1px solid {RULE}; }}
.rn {{ font-family: Archivo, Helvetica, sans-serif; font-size: 12pt;
       font-weight: 700; margin: 0 0 1mm; }}
.meta {{ font-family: Archivo, Helvetica, sans-serif; font-size: 8pt;
         color: {MUTED}; text-transform: uppercase; letter-spacing: .08em;
         margin: 0 0 2mm; }}
.why {{ font-style: italic; color: {MUTED}; margin: 0 0 2mm;
        border-left: 2px solid {COPPER_MID}; padding-left: 3mm; }}
.lbl {{ font-family: Archivo, Helvetica, sans-serif; font-size: 8pt;
        letter-spacing: .1em; text-transform: uppercase; color: {MUTED};
        margin: 2mm 0 1mm; }}
ul, ol {{ margin: 0 0 0 5mm; padding: 0; }}
li {{ margin: 0 0 .8mm; }}
.note {{ font-size: 8.5pt; color: {MUTED}; background: {RAISED};
         border: 1px solid {RULE}; padding: 3mm; margin: 4mm 0 0; }}
"""


def esc(s):
    return H.escape(s)


# The sections, in order, and what each one is called. A meal value in
# kitchen_data.json that has no entry here is a FAILURE, not a recipe to skip:
# the old code filtered with `x["meal"] == meal` against a hardcoded pair, so
# thirty lunch recipes added to the data would have been dropped from the page in
# silence while the cover went on claiming forty meals.
SECTIONS = [
    ("breakfast", "The First Meal",
     "Nothing before light. Once you have been outside, this is where the day starts."),
    ("lunch", "The Middle Meal",
     "Inside the window, built the same way as the others: protein first, fat over "
     "everything. At the tighter windows this is the last meal of the day."),
    ("dinner", "The Last Meal",
     "Finished at least three hours before bed. Build it around the protein, "
     "put fat over everything."),
]

WORDS = {0: 'No', 20: 'Twenty', 30: 'Thirty', 34: 'Thirty-four', 40: 'Forty',
         50: 'Fifty', 60: 'Sixty', 64: 'Sixty-four', 90: 'Ninety', 94: 'Ninety-four'}


def count_word(n):
    """The count in words, or the digits when the word is not known.

    The cover used to read "Forty meals ... Twenty for the first meal, twenty for
    the last", typed. Three numbers a person had to remember to change, on the one
    page that states what the document contains.
    """
    return WORDS.get(n, str(n))


def sentence(parts):
    """The per-section counts as one sentence, capitalised, with an Oxford-free and."""
    if not parts:
        return "No recipes yet."
    joined = (parts[0] if len(parts) == 1
              else " and ".join(parts) if len(parts) == 2
              else ", ".join(parts[:-1]) + " and " + parts[-1])
    return joined[0].upper() + joined[1:] + "."


def build():
    recs = json.loads((HERE / "kitchen_data.json").read_text(encoding="utf-8"))

    known = {k for k, _, _ in SECTIONS}
    stray = sorted({r["meal"] for r in recs} - known)
    if stray:
        raise SystemExit(
            f"kitchen_data.json has recipe(s) for meal(s) with no section: "
            f"{', '.join(stray)}. Add a section to SECTIONS or the recipes will "
            f"not appear in the document.")

    per = {k: [r for r in recs if r["meal"] == k] for k, _, _ in SECTIONS}
    parts = [f"{count_word(len(per[k])).lower()} for {t.lower()}"
             for k, t, _ in SECTIONS if per[k]]
    out = [f"<meta charset='utf-8'><style>{CSS}</style>",
           "<div class='title'><div class='markgap'></div>",
           "<h1>The Battery Kitchen</h1>",
           f"<p>{count_word(len(recs))} meals built only from the approved list in "
           f"your Dietary Guidelines. "
           + sentence(parts) + "</p></div>"]
    for meal, title, note in SECTIONS:
        if not per[meal]:
            continue          # no recipes yet, so no empty section on the page
        out.append(f"<h2>{title}</h2><p class='stand'>{esc(note)}</p>")
        for r in per[meal]:
            tiers = ("All tiers" if r["tiers_raw"].strip() == "A"
                     else ", ".join(t.capitalize() for t in
                                    json.loads(r["tiers_raw"])) + " only")
            out.append(
                f"<div class='r'><p class='rn'>{esc(r['name'])}</p>"
                f"<p class='meta'>{esc(tiers)} &nbsp;·&nbsp; {esc(r['time'])}"
                f" &nbsp;·&nbsp; {esc(r['tech'])}</p>"
                f"<p class='why'>{esc(r['why'])}</p>"
                "<p class='lbl'>Ingredients</p><ul>"
                + "".join(f"<li>{esc(i)}</li>" for i in r["ing"]) +
                "</ul><p class='lbl'>Method</p><ol>"
                + "".join(f"<li>{esc(s)}</li>" for s in r["steps"]) +
                "</ol></div>")
    out.append(
        "<p class='note'>A recipe marked for a tier you are not in is not "
        "forbidden forever. It is out for ninety days, which is long enough to "
        "find out what your body does without it. Ingredients are named by "
        "specification and not by brand, and we take no commission on anything "
        "named here. The Human Battery Project. Educational wellness program, "
        "not medical treatment. If you take prescription medication, review any "
        "dietary change with your prescriber.</p>")
    path = f"{OUT}/HBP-Battery-Kitchen.pdf"
    HTML(string="".join(out)).write_pdf(path)
    print(path)


if __name__ == "__main__":
    build()
