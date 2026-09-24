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
