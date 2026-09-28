# Dawn: what the software does with the design system

The design system is the source of truth and is now at version 3. Every
figure in it was recomputed here and all of them reproduce, including the
nine status pairings added in addendum 3. The three that previously
disagreed are corrected at source and are not repeated here.

## The split

The app is dark. The portal, the site and the dashboards sit on
`surface-field` #0E1424 with panels on `surface-raised` #1C2742. Documents
are ivory: the eleven programme PDFs sit on `surface-page` #FBF9F5.

## Figures this repo computed that the source does not state

| Pairing | Ratio | Note |
| --- | --- | --- |
| `rule` dark #2A3550 on field | 1.51 | Borders only, never text |
| `chart-1` dark #D2732F on field | 5.45 | |
| `chart-2` dark #3987E5 on field | 5.04 | |
| `chart-3` dark #199E70 on field | 5.39 | Direct label still required |

All three dark chart values clear 4.5:1 on the field, which the light-theme
values do not on ivory. `chart-3` ships with a direct label regardless: the
rule is about colour-blind separation, not contrast.

## Still open in the software

The four data splits. `--teal`, `--blue`, `--green` and `--copper` are
deprecated aliases pointing at the UI answer, which is the common case.
Every use that encodes a DATA SERIES still has to be found and moved to a
chart token by hand. Grep the alias names to find them.

`--green` has a third destination the others do not: a success STATE takes
`status-good`, not `chart-3`. Those are different axes.

## The rule that keeps two greens apart

`status-good` and `chart-3` are both green and never meet. Nothing about
the hues separates them. What separates them is that **every status colour
ships with an icon and a word**, so colour alone never carries state.
Enforced by `status-colour-without-a-word` in scripts/check_prohibitions.py.

## The gradient floor, and where the flat wordmark is required

The gradient wordmark needs room for the gradient to read. Below a rendered
width of **120px** it stops being a gradient and becomes mud, so anything
narrower than that takes `wordmark-flat-copper.png` instead.

This figure was not written down anywhere in this repo before 2026-09-24. It
came from the brand brief and is recorded here so the next person does not have
to be told it.

**The header was in breach at every viewport, not just on a phone.** `.top img`
is `height:38px` with `width:auto`, and the asset is 2172x724, which is exactly
3.0:1, so the header wordmark rendered at **114px wide on every screen size**.
It was never a mobile-only problem; a phone was just where it was noticed.
Every header on the site now uses the flat asset.

The hero wordmark on the home page is the one place the gradient is correct: it
renders at 262px on a 390px phone and up to 760px on a desktop.

`wordmark-flat-ink.png` is the ivory-document variant. It measures 1.81:1 on
`surface-field` and must never be used on a dark surface.

## The home page header carries no wordmark. Logged and left.

The home hero IS the wordmark, so the header would put the same lockup on
screen twice. Reveal-on-scroll was built and removed: showing the brand makes
the header taller, which pushes the hero down, which moves the offset the
reveal is measured against. The measured threshold shifted from 505px to 595px
the moment the brand appeared, and headless Chrome fired no scroll event on the
return trip, so the class stuck on.

Accepted on 2026-09-24 as the answer, not as a gap to close later. Nothing is
lost: the header wordmark's job is to be the link home, and on the home page
that link points at the page you are already reading. Every other page keeps
its header wordmark unchanged.

## The version ladder has been exercised deliberately, outside a repair

On 2026-09-24 HBP-Battery-Kitchen was bumped v3 to v4 with byte-identical
content, on purpose, to prove the ordinary path works when nothing is wrong.
The new bytes went to a NEW path, the v3 row kept its path and gained
`retired_at`, and the v3 bytes were fetched back afterwards and still matched.
The bump changed the row, not the bytes, and destroyed nothing. That is the
shape rule 3b asks for, and it had only ever been walked while fixing damage.

## The trademark, and where it sits

Ruled 27 September 2026. **Every appearance of the mark carries a trademark
symbol beside it, and the first time "The Human Battery Project" appears as text
in any document it carries one too.**

The symbol is a SEPARATE element placed next to the mark. The logo files are
never edited, never recoloured, never outlined and never given a glow, so the ™
is positioned against the artwork rather than drawn into it.

**Where it goes.** Upper right of the wordmark, against the end of HUMAN BATTERY,
which is the widest of the three lines. These fractions were measured off the
alpha channel of `public/assets/wordmark.png` and hold for all three assets,
because all three share the same 2172x724 canvas:

| Measurement | Value | As a fraction |
|---|---|---|
| image aspect | 2172 x 724 | exactly 3.000 |
| THE | y 184 to 239 | |
| HUMAN BATTERY | y 262 to 394, x 116 to 2090 | |
| PROJECT | y 398 to 505 | |
| cap height of HUMAN | 133 px | 0.1837 of height |
| right edge of HUMAN BATTERY | x 2090 | 0.9622 of width |
| top of HUMAN BATTERY | y 262 | 0.3619 of height |

**Which asset, and which colour.** The metallic lockup is for dark grounds only.

| Ground | Asset | Trademark colour |
|---|---|---|
| Dark, Carbon Black or Deep Navy | `wordmark.png` | copper-light `#D9A87A` |
| Ivory document pages | `wordmark-flat-ink.png` | copper-ink `#5E3823` |
| Light, where full copper is wanted | `wordmark-flat-copper.png` | copper-brand `#B4794F` |

**Size.** The symbol is proportional to the cap height of HUMAN, at 0.55 of it,
with a floor of 1.4mm. The floor matters: at a 26mm footer mark strict proportion
gives 0.74mm, about 2pt, which does not reliably print or show on screen. The
floor is the one place the mark's own proportions are not followed and it is
deliberate.

**Clear space.** This ruling sets clear space at the cap height of HUMAN on all
four sides. **That is not what the printed brand guide says.** The guide's usage
page reads "Clear space on all sides equals the diameter of the top sphere." The
two rules are different and the ruling governs. The guide is now out of date on
this point and should be reissued.

The assets already carry transparent padding of 1.38 cap above and 1.64 below,
but only 0.87 left and 0.61 right, so padding is applied to all four sides of the
image box rather than to the short sides only. Clear space is a floor, not a target.

**One rule cannot currently be met.** The guide also says "Below 64 px, switch to
the reduction, never scale the full mark down." There is no reduction asset in
this repository. A 26mm footer mark is about 87 px tall at print resolution, which
clears the rule, but about 33 px on a screen at 96dpi, which does not. Until a
reduction mark exists, small placements of the full wordmark break that rule.

**Implementation.** `program-docs/design.py` has `mark()`, `cap_mm()` and
`tm_mm()`. Use them rather than positioning a symbol by hand, so a future document
cannot drift from these numbers.
