#!/usr/bin/env python3
"""The brand guide, as a PDF built from the brand style rather than by hand.

    <venv>/bin/python brand_doc.py

WHY THIS EXISTS. brand/HBP-Brand-Guide.pdf had no generator. It was made once,
by hand, and then the palette moved twice and the mark changed and nothing
rebuilt it, so the file that tells everyone what the brand is was the one file
still showing the old atom mark and the retired teal and steel palette. A brand
guide that goes stale is worse than no brand guide, because people follow it.

Everything here is read from the same places the documents read: the tokens come
from design.T and design.FIELD, the faces and the mark come from design, and the
retired list comes from brand/tokens.json. If a token changes, this rebuilds to
match instead of disagreeing.
"""
import json
import os
import pathlib

from weasyprint import HTML

import design as D

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = os.environ.get("HBP_OUT", str(HERE / "out"))
os.makedirs(OUT, exist_ok=True)

TOK = json.load(open(ROOT / "brand" / "tokens.json", encoding="utf-8"))
T, F = D.T, D.FIELD

CSS = (D.font_faces() + D.mark_css() + D.footer_css("bottom-left") +
       "@page cover{@bottom-center{content:none}}" + f"""
@page{{size:letter;margin:18mm 16mm 16mm;
  @bottom-center{{content:counter(page);font-family:'Spectral';font-size:8pt;
                  color:{T['ink-muted']};margin-bottom:9mm}}}}
*{{box-sizing:border-box}}
body{{margin:0;font-family:{D.FONT_READING};font-size:10pt;line-height:1.5;
      color:{T['ink']};background:{T['surface-page']}}}
.page{{page-break-after:always}}
.page:last-child{{page-break-after:auto}}
.cover{{page:cover;background:{T['surface-field']};color:{F['ink']};
        height:279.4mm;width:215.9mm;padding:0 22mm;display:flex;
        flex-direction:column;justify-content:center;align-items:center;
        text-align:center}}
.cover .t{{font-family:{D.FONT_DISPLAY};font-size:15pt;letter-spacing:.06em;
           margin-top:14mm;color:{F['ink']}}}
.cover .s{{font-family:{D.FONT_DISPLAY};font-size:7.5pt;letter-spacing:.24em;
           color:{T['copper']};margin-top:5mm}}
.cover .d{{font-size:11pt;color:{F['ink-muted']};margin-top:8mm;max-width:120mm;
           line-height:1.55}}
h1{{font-family:{D.FONT_BODY};font-weight:700;font-size:21pt;line-height:1.2;
    margin:0 0 3mm;color:{T['ink']}}}
h2{{font-family:{D.FONT_BODY};font-weight:700;font-size:13pt;margin:8mm 0 2mm;
    color:{T['copper-deep']};padding-top:2.5mm;
    border-top:2px solid {T['copper-mid']}}}
h3{{font-family:{D.FONT_BODY};font-weight:600;font-size:10.5pt;letter-spacing:.02em;
    margin:5mm 0 1.5mm;color:{T['ink']}}}
.kicker{{font-family:{D.FONT_DISPLAY};font-size:7pt;letter-spacing:.3em;
         color:{T['copper-deep']};margin-bottom:3mm}}
.lede{{font-size:11.5pt;color:{T['ink-muted']};margin:0 0 6mm;max-width:150mm}}
p{{margin:0 0 2.5mm;max-width:158mm}}
.small{{font-size:8.6pt;color:{T['ink-muted']}}}
table{{width:100%;border-collapse:collapse;margin:3mm 0 5mm;font-size:8.6pt}}
th{{text-align:left;font-family:{D.FONT_BODY};font-weight:600;font-size:7.6pt;
    letter-spacing:.08em;text-transform:uppercase;color:{T['ink-muted']};
    border-bottom:1px solid {T['rule']};padding:2mm 2mm 1.5mm}}
td{{padding:1.8mm 2mm;border-bottom:.35pt solid {T['rule']};vertical-align:top}}
.sw{{display:inline-block;width:9mm;height:5mm;border:.35pt solid {T['rule']};
     vertical-align:middle;margin-right:2mm}}
.mono{{font-family:{D.FONT_BODY};font-size:8pt}}
.note{{background:{T['surface-raised']};border-left:2px solid {T['copper-mid']};
       padding:3mm 3.5mm;margin:4mm 0;font-size:9pt}}
.bad{{border-left-color:{T['status-critical']}}}
.field-demo{{background:{T['surface-field']};color:{F['ink']};padding:6mm;
             margin:3mm 0 5mm;text-align:center}}
ul{{margin:0 0 3mm 5mm;padding:0}}
li{{margin:0 0 1.2mm}}
""")


def swatches(d, note=""):
    rows = "".join(
        f"<tr><td><span class='sw' style='background:{v}'></span>"
        f"<span class='mono'>{k}</span></td><td class='mono'>{v}</td></tr>"
        for k, v in d.items())
    return f"<table><tr><th>Token</th><th>Hex</th></tr>{rows}</table>{note}"


def build():
    retired = "".join(
        f"<tr><td class='mono'>{k}</td><td>{v}</td></tr>"
        for k, v in TOK["retired"].items())

    doc = f"""<meta charset="utf-8"><style>{CSS}</style>
{D.footer_mark()}
<div class="cover">
  {D.mark(D.WORDMARK_DARK, 96)}
  <div class="t">Brand Style</div>
  <div class="s">VERSION 3 &middot; DAWN</div>
  <div class="d">The field is deep indigo, the hour before sunrise, not pure
  black. The copper wordmark sits on it unchanged. On indigo the copper reads as
  first light rather than polished metal.</div>
</div>

<div class="page">
  <div class="kicker">01 / THE DIRECTION</div>
  <h1>Dawn</h1>
  <p class="lede">One amber moment per view. Amber is the most tempting colour
  here and the easiest to overuse.</p>
  <p>Use it for one figure, one call to action or one rule per view. Everything
  else is indigo, ivory and copper.</p>
  <h2>Two surfaces</h2>
  <p><b>The app is dark.</b> The portal, site and dashboards sit on surface-field
  with panels on surface-raised.</p>
  <p><b>Documents are ivory.</b> Program PDFs, the book, the Battery Kitchen and
  anything printed sit on surface-page.</p>
  <h2>Two grounds, two coppers</h2>
  <p>The brand copper fails body text on ivory at 3.45:1 against a 4.5:1
  requirement. Documents use copper-deep for headings and copper-ink for text.
  The field is for covers, title pages, the site header and the mark.</p>
</div>

<div class="page">
  <div class="kicker">02 / THE MARK</div>
  <h1>The wordmark, and the trademark beside it</h1>
  <p class="lede">Squared geometric capitals, wide tracking, a polished copper
  gradient with a specular highlight.</p>
  <div class="field-demo">{D.mark(D.WORDMARK_DARK, 82)}</div>
  <h3>Rules</h3>
  <ul>
    <li>Use the supplied file only. Never recreate it in type.</li>
    <li>Show it on the field, surface-field, or surface-night on the book jacket only.
        Never on ivory, a photograph or copper.</li>
    <li>Clear space: space-6, 64px, or the cap height of HUMAN, whichever is larger,
        on all four sides.</li>
    <li>Never recolour it, add a glow, outline it, stretch it, set it in another
        face, or separate PROJECT from the wordmark.</li>
  </ul>
</div>

<div class="page">
  <div class="kicker">02 / THE MARK, CONTINUED</div>
  <h1>The flat fallback, and the trademark</h1>
  <p class="lede">The gradient cannot survive one-colour print, embroidery, a
  favicon, an email signature, or anything under about 120px wide.</p>
  <p>Use flat copper on the field, and flat copper-ink on ivory. A flat mark is
  correct. A muddy gradient is not.</p>
  <p style="text-align:center;margin:6mm 0">{D.mark(D.WORDMARK_INK, 72)}</p>
  <h2>The trademark</h2>
  <ul>
    <li>Every appearance of the logo carries a trademark symbol, set small at the
        upper right of the wordmark, beside the end of HUMAN BATTERY.</li>
    <li>It is a separate element placed next to the logo. Never edit the logo file
        to add it.</li>
    <li>Its colour matches the mark: copper or copper-light on the field,
        copper-ink on ivory.</li>
    <li>In text, add it the first time {D.PROGRAM_NAME_TM} appears in a document,
        page or email. Later mentions do not need it.</li>
    <li>Use the trademark symbol, not the registered symbol. Switch only once the
        registration is granted.</li>
  </ul>
  <div class="note">Placement is measured, not judged by eye. The cap height of
  HUMAN is 0.1837 of the image height, the right edge of HUMAN BATTERY is 0.9622
  of the width and its top is 0.3619 of the height. All three assets share one
  2172 x 724 canvas, so one set of numbers serves all of them.</div>
  <div class="note bad">One rule cannot currently be met. Clear space is space-6,
  16.93mm, or the cap height, whichever is larger. The page bottom margin is
  14mm, so a footer mark cannot satisfy it without repaginating every document.
  Footer placements run at 2.5mm and need a ruling.</div>
</div>

<div class="page">
  <div class="kicker">03 / COLOUR</div>
  <h1>The tokens</h1>
  <p class="lede">Documents are ivory. These are the values a PDF, the book or
  anything printed uses.</p>
  {swatches(T)}
</div>

<div class="page">
  <h2>On the field</h2>
  <p>The same names, on indigo. The app, the site and any dark surface.</p>
  {swatches(F)}
  <h2>Charts</h2>
  <ul>
    <li>Up to three series only. Past three, fold into Other or use small multiples.</li>
    <li>Sequential data is one hue, light to dark. Diverging is copper against
        blue with a warm grey middle, never copper against green.</li>
    <li>Status colours are separate from series colours and always come with an
        icon and a word.</li>
  </ul>
</div>

<div class="page">
  <div class="kicker">04 / TYPE</div>
  <h1>Three faces, three jobs</h1>
  <table>
    <tr><th>Role</th><th>Family</th><th>Rules</th></tr>
    <tr><td>Display</td><td class="mono">Michroma</td>
        <td>Wordmark text and eyebrows only. Always tracked out, 0.18em wordmark,
            0.30em eyebrow. Never below 11px, never running text.</td></tr>
    <tr><td>Headings, labels, figures</td><td class="mono">Archivo</td>
        <td>h1 34/40 700, h2 24/30 700, h3 17/24 600 +0.02em.</td></tr>
    <tr><td>Reading text</td><td class="mono">Spectral</td>
        <td>body 16/26, small 13/20. The book and program documents.</td></tr>
  </table>
  <p>Uppercase labels carry at least 0.08em tracking. Headings use balanced
  wrapping. Reading measure stays near 65 characters.</p>
  <div class="note">This page is set in those three faces. Until September 2026
  none of them was installed, so every document in the repository declared them
  and rendered in Georgia and Helvetica instead.</div>
  <h2>Spacing and corners</h2>
  <p>space-1 4px, space-2 8px, space-3 16px, space-4 24px, space-5 40px,
  space-6 64px, which is the page margin and the wordmark clear space.</p>
  <p>radius-none 0px is the default because the mark is squared. radius-sm 4px for
  chips and badges. radius-md 10px is the largest radius anywhere.</p>
</div>

<div class="page">
  <div class="kicker">05 / WRITING</div>
  <h1>How it reads</h1>
  <ul>
    <li>Third to fifth grade reading level. Every instruction says what to do and why.</li>
    <li>No em dashes. Use commas or periods.</li>
    <li>Credentials in marketing: Dr. Micah Pittman, UCSD cell biology degree,
        25 years in health care. Not positioned around chiropractic.</li>
  </ul>
  <h2>Retired values</h2>
  <p>Any file still using one of these is stale. This list is read from
  brand/tokens.json, and scripts/check_brand.py fails a commit that reintroduces one.</p>
  <table><tr><th>Old</th><th>Replace with</th></tr>{retired}</table>
</div>
"""
    path = f"{OUT}/HBP-Brand-Guide.pdf"
    HTML(string=doc, base_url=str(ROOT)).write_pdf(path)
    print(path)


if __name__ == "__main__":
    build()
