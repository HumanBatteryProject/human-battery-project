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
