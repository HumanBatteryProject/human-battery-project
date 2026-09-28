# The Human Battery Project™ Brand Style

Version 3, "Dawn". Source: the Human Battery Brand design system, updated September 27, 2026 with the ™ rule. This file overrides any older colour, logo or type choice in the repo.

Received from the owner on 2026-09-27. `brand/tokens.json` is generated to agree with section 3, `program-docs/design.py` implements sections 2, 4 and 5 for the PDFs, and `scripts/check_brand.py` enforces section 8.

## 1. The direction: Dawn

The field is deep indigo, the hour before sunrise, not pure black. The copper wordmark sits on it unchanged. On indigo the copper reads as first light rather than polished metal. Black is kept only for the book jacket.

**One amber moment per view.** Amber is the most tempting colour here and the easiest to overuse. Use it for one figure, one call to action or one rule per view. Everything else is indigo, ivory and copper.

## 2. The mark

- Squared geometric capitals, wide tracking, a polished copper gradient with a specular highlight. "THE" sits above, "PROJECT" below between two lens-flare rules.
- Use the supplied file only (`hbp-wordmark-copper-on-black.png`, 2172 x 724). Never recreate it in type.
- Show it on the field: `surface-field` #0E1424, or `surface-night` #000000 on the book jacket only. Never on ivory, a photograph or copper.
- Clear space: `space-6` (64px) or the cap height of HUMAN, whichever is larger, on all four sides.
- Never recolour it, add a glow, outline it, stretch it, set it in another face, or separate "PROJECT" from the wordmark.

### Flat fallback

The gradient cannot survive one-colour print, embroidery, a favicon, an email signature, or anything under about 120px wide. For those, use a flat mark:

- flat `copper` #B4794F on `surface-field`
- flat `copper-ink` #5E3823 on ivory

A flat mark is correct. A muddy gradient is not.

### Trademark ™ (new)

- Every appearance of the logo carries a ™ after the mark, set small at the upper right of the wordmark, beside the end of HUMAN BATTERY.
- The ™ is a separate element placed next to the logo. Never edit the logo file to add it.
- ™ colour matches the mark: copper or copper-light on the field, copper-ink on ivory.
- In text, add ™ the first time "The Human Battery Project" appears in a document, page or email. Later mentions do not need it.
- Use ™, not ®. Switch to ® only once the USPTO registration is granted.

## 3. Colour tokens

| Token | Ivory (page) | Field (dark) | Use |
| --- | --- | --- | --- |
| `surface-page` | #FBF9F5 | #000000 | The page. Ivory for documents, the book, PDFs |
| `surface-raised` | #F4EFE4 | #1C2742 | Panels, callouts, table headers. No shadows |
| `surface-field` | #0E1424 | #0E1424 | The brand field: covers, site header, title pages, anywhere the wordmark appears |
| `surface-night` | #000000 | #000000 | Book jacket only |
| `ink` | #1A1714 | #F6F1E7 | Body text |
| `ink-muted` | #6E655C | #A8A096 | Captions, secondary labels |
| `rule` | #E4DED2 | #2A3550 | Hairlines, borders, dividers. Never text |
| `copper` | #B4794F | #B4794F | Identity on the field only |
| `copper-light` | #D9A87A | #D9A87A | Copper text on dark. The only copper that passes on a raised panel |
| `copper-deep` | #7A4A2E | #7A4A2E | Headings and rules on ivory |
| `copper-ink` | #5E3823 | #5E3823 | Copper body text and small text on ivory |
| `copper-mid` | #9C603C | #9C603C | Large accents and figure strokes on ivory, 18pt and up |
| `specular` | #FEFBF6 | #FEFBF6 | The highlight on the mark. Decoration only, never text |
| `dawn-deep` | #2E4A6B | #2E4A6B | A fill on the field, never text on it |
| `dawn-ember` | #C25A3A | #C25A3A | Emphasis, large text only, never a large area |
| `dawn-amber` | #E8A24A | #E8A24A | First light. Once per view |
| `chart-1` | #BC6630 | #D2732F | First data series |
| `chart-2` | #2A78D6 | #3987E5 | Second data series |
| `chart-3` | #1BAF7A | #199E70 | Third data series. Always direct-labelled |
| `status-good` | #1F6B4A | #3FA97D | Pass states, always with an icon and a word |
| `status-warn` | #8A5A0F | #D9A441 | Caution and out-of-range |
| `status-critical` | #A32E22 | #E0705E | Failure and out-of-reference |

### Two grounds, two coppers

The brand copper fails body text on ivory (3.45:1 against a 4.5:1 requirement). Documents use `copper-deep` for headings and `copper-ink` for text. The field is for covers, title pages, the site header and the mark.

### Two surfaces

- **The app is dark.** The portal, site and dashboards sit on `surface-field` with panels on `surface-raised`.
- **Documents are ivory.** Program PDFs, the book, the Battery Kitchen and anything printed sit on `surface-page`.

## 4. Type

| Role | Family | Rules |
| --- | --- | --- |
| Display | Michroma | Wordmark text and eyebrows only. Always tracked out (0.18em wordmark, 0.30em eyebrow). Never below 11px, never running text |
| Headings, labels, figures | Archivo | h1 34/40 700, h2 24/30 700, h3 17/24 600 +0.02em |
| Reading text | Spectral | body 16/26, small 13/20. The book and program documents |

Uppercase labels carry at least 0.08em tracking. Headings use `text-wrap: balance`. Reading measure stays near 65 characters.

## 5. Spacing and corners

- Spacing: `space-1` 4px, `space-2` 8px, `space-3` 16px, `space-4` 24px, `space-5` 40px, `space-6` 64px (page margin and wordmark clear space).
- Corners: `radius-none` 0px is the default because the mark is squared. `radius-sm` 4px for chips and badges. `radius-md` 10px is the largest radius anywhere. No rounded-everything cards.

## 6. Charts

- Up to three series only: `chart-1`, `chart-2`, `chart-3`. Past three, fold into "Other" or use small multiples.
- Sequential data: one hue, light to dark. Diverging: copper against blue with a warm grey middle, never copper against green.
- Status colours are separate from series colours and always come with an icon and a word.

## 7. Writing style (all member-facing copy)

- Third-to-fifth grade reading level. Every instruction says what to do and why.
- No em dashes. Use commas or periods.
- Credentials in marketing: "Dr. Micah Pittman," UCSD cell biology degree, 25 years in health care. Not positioned around chiropractic.

## 8. Retired values (any file still using these is stale)

| Old | Hex | Replace with |
| --- | --- | --- |
| `--carbon` | #05090C | `surface-field` |
| `--teal` | #2AAFC0 | `copper-light` for UI, `chart-2` for data |
| `--steel` | #6E908C | `ink-muted`, or `rule` for borders |
| `--ice` | #ECF3F4 | `ink` (dark theme) |
| `--blue` | #218BBE | `chart-2` for data, `surface-raised` for fills |
| `--silver` | #B6BDBC | `ink-muted` |
| `--green` | #157A5C | `chart-3` for series, `status-good` for state |
| `--copper` | #B4653A | the copper token for the ground |
| `--navy-2` | #13323F | `surface-raised` |
| `--navy` | #0E2530 | `surface-raised` |
| `--blue-lo` | #0E557C | `dawn-deep`, fills only |
| Newsreader font | | Spectral |
| Old atom "v4" mark | | The copper wordmark |

## 9. CSS variables

```css
:root {
  /* ivory documents */
  --surface-page:#FBF9F5; --surface-raised:#F4EFE4; --surface-field:#0E1424; --surface-night:#000000;
  --ink:#1A1714; --ink-muted:#6E655C; --rule:#E4DED2;
  --copper:#B4794F; --copper-light:#D9A87A; --copper-deep:#7A4A2E; --copper-ink:#5E3823; --copper-mid:#9C603C; --specular:#FEFBF6;
  --dawn-deep:#2E4A6B; --dawn-ember:#C25A3A; --dawn-amber:#E8A24A;
  --chart-1:#BC6630; --chart-2:#2A78D6; --chart-3:#1BAF7A;
  --status-good:#1F6B4A; --status-warn:#8A5A0F; --status-critical:#A32E22;
  --font-display:Michroma,"Eurostile","Bank Gothic",sans-serif;
  --font-body:Archivo,"Helvetica Neue",Helvetica,Arial,sans-serif;
  --font-reading:Spectral,Georgia,"Times New Roman",serif;
  --space-1:4px; --space-2:8px; --space-3:16px; --space-4:24px; --space-5:40px; --space-6:64px;
  --radius-none:0px; --radius-sm:4px; --radius-md:10px;
}
[data-theme="field"] {
  /* the app, the site, dark surfaces */
  --surface-page:#0E1424; --surface-raised:#1C2742;
  --ink:#F6F1E7; --ink-muted:#A8A096; --rule:#2A3550;
  --chart-1:#D2732F; --chart-2:#3987E5; --chart-3:#199E70;
  --status-good:#3FA97D; --status-warn:#D9A441; --status-critical:#E0705E;
}
```

## 10. Logo files

| File | Use |
| --- | --- |
| `hbp-wordmark-copper-on-black.png` | The master file, 2172 x 724. Print and anywhere black is correct |
| `hbp-wordmark-field.png` | The master with the black made transparent, for placing on `surface-field` indigo |
| `hbp-wordmark-flat-copper-ink.png` | Flat fallback for ivory pages and small sizes |
