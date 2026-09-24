# Dawn: what the software does with the design system

`brand/tokens.json` and `brand/README.md` are copies of the design system,
which is the source of truth. This file records only what is specific to the
software, and the three places the source still disagrees with itself.

## The split

The app is dark. The portal, the site and the dashboards sit on
`surface-field` #0E1424 with panels on `surface-raised` #1C2742. Documents are
ivory: the eleven programme PDFs sit on `surface-page` #FBF9F5.

## Figures that did not reproduce when recomputed

Every contrast figure in the source was recomputed. These three did not match,
and the source should be corrected rather than this file kept as a patch:

| Claim | Source says | Computed |
| --- | --- | --- |
| `ink` dark on `surface-raised` | 14.04 | **13.15** |
| `ink-muted` dark on `surface-raised` | 6.12 | **5.74** |
| `chart-3` on ivory, in the Charts prose | 2.74 | **2.68** |

The first two are claimed about 6.7 percent high, consistently, which suggests
the panel used in the calculation was slightly darker than #1C2742. Both still
pass 4.5:1 comfortably, so nothing is blocked. The third is already correct in
the source's own table; only the prose paragraph still says 2.74.

The source's "What this replaces" table also still lists the book's figure
palette (gold #C8952A, teal #2F6F7E and so on), which addendum 2 said was
removed. None of those hexes exist in this repo. Zero hits, checked.

## Figures computed here that the source does not state

| Pairing | Ratio |
| --- | --- |
| `rule` dark #2A3550 on field | 1.51, borders only, never text |
| `chart-1` dark #D2732F on field | 5.45 |
| `chart-2` dark #3987E5 on field | 5.04 |
| `chart-3` dark #199E70 on field | 5.39 |

All three dark chart values clear 4.5:1 on the field, which the light-theme
values do not on ivory. `chart-3` still ships with a direct label regardless,
because the rule is about colour-blind separation, not contrast.
