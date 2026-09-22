# Proposed marker to dimension mapping

**Status: proposal. Not applied. No migration written.**

Seven of the 33 markers are already mapped and are not in question: the six
fuel-handling markers moved from the old `charge` subsystem to `flow` in
migration 031, and `omega3-index` went to `structure`.

This document proposes a home for the remaining 26, against the five scored
dimensions: **flow, capacity, timing, structure, environment**.

`leak` is frontier as of 031, so any marker whose only honest home was leak is
on the no-home list rather than being pushed somewhere it does not belong.

---

## Proposed

| Marker | To | Why |
|---|---|---|
| `aa-epa-ratio` | structure | Arachidonic acid to EPA, measured in the same red cell membrane assay as the Omega-3 Index. It is a membrane composition number, not an inflammation number. |
| `tsh` | flow | Thyroid sets metabolic rate. TSH is the control signal for how fast substrate is oxidised. |
| `free-t3` | flow | T3 is the active hormone driving mitochondrial biogenesis and substrate oxidation. The most direct hormonal input to flow on the panel. |
| `free-t4` | flow | The precursor pool for T3. Belongs with it or the thyroid picture is split across dimensions. |
| `magnesium-rbc` | flow | Magnesium is required for ATP to function at all: the biologically active form is Mg-ATP. Measured in red cells, so it reflects status rather than a recent meal. |
| `hdl` | flow | The other half of the triglyceride to HDL ratio, which is already in flow. Splitting a ratio from its own component across two dimensions would make both harder to read. |
| `cortisol-am` | timing | The only hormone on the panel whose timing is the point. A morning draw is a position on the curve, not a quantity. Note: it gives no amplitude, and timing's definition was narrowed in 031 to stop implying otherwise. |
| `vitamin-d` | environment | Made in skin from sunlight. Under the corrected light position this is job two, the small real chemistry, and it is the closest thing the panel has to a biomarker of light exposure. |
| `ferritin` | capacity | Iron status governs oxygen carrying and the electron transport chain. Capacity is the dimension that asks what the system can do under load. |
| `iron-saturation` | capacity | Same axis as ferritin, and the better read of usable iron when ferritin is raised by inflammation. Keep the pair together. |
| `dhea-s` | capacity | Androgen precursor, part of the anabolic axis that sets what the system can build and sustain. |
| `testosterone-total` | capacity | Same axis. Total is the pool. |
| `testosterone-free` | capacity | Same axis. Free is the fraction that acts. |
| `shbg` | capacity | Determines the free fraction. Meaningless apart from the testosterone pair, so it goes with them. |
| `igf-1` | capacity | Growth and repair signalling, and a reasonable read of whether training is producing adaptation rather than only fatigue. |

**15 of 26 proposed.**

---

## No home

Eleven markers. Nine of these were `drain`, and drain's honest successor is
`leak`, which is now frontier. They are listed rather than placed.

| Marker | Why not |
|---|---|
| `hs-crp` | Inflammation. Its only honest home is leak. |
| `wbc` | Immune activation. Leak. |
| `kyn-trp-ratio` | Tryptophan degradation driven by inflammation. Leak. |
| `alt` | Liver. Not fuel handling, capacity, timing, structure or environment. |
| `ast` | Liver. Same. |
| `ggt` | Liver, and often read as an oxidative stress proxy, which is exactly the substitution 031 refused. |
| `homocysteine` | Methylation and B-vitamin sufficiency. Could be argued into structure, but it is a damage marker, not a membrane composition marker, and the argument is thin. |
| `uric-acid` | Has a real flow argument through fructose handling and insulin resistance, and a real leak argument as an antioxidant and a damage marker. Genuinely ambiguous, so it is your call rather than mine. |
| `albumin` | Protein status and oncotic pressure. No dimension fits without stretching one. |
| `vitamin-b12` | Methylation and nerve maintenance substrate. Structure is arguable and weak. |
| `folate` | Same as B12, and they should move together or not at all. |

---

## Three things to decide

**1. Capacity is carrying seven markers, five of them hormonal.** The
testosterone and DHEA cluster is the largest single group in the proposal and
the weakest scientifically: the anabolic axis is related to work capacity, but
VO2max already measures work capacity directly and measures it better. Two
honest options: accept that capacity becomes "capacity and the anabolic axis",
or leave the hormones unmapped and let capacity be VO2max alone. The second is
cleaner and loses five markers from the score.

**2. Eleven of 33 markers with no home is a third of the panel.** That is not
a mapping failure, it is what happens when a panel built for four subsystems
meets a five-dimension model where the dimension those markers served is now
frontier. They can stay on the panel as clinician-referable results without
entering any score, which is probably right: an out-of-range ALT still matters
to the person, it just is not a Human Battery dimension.

**3. `vitamin-d` to environment is the most interesting call here and the one
most worth pushing back on.** It is a nutrient status marker being used as an
exposure biomarker. It is confounded by supplementation, which the protocol
recommends, and a participant taking D3 will read as well-lit when they may not
be. If environment is meant to measure what the participant actually did,
supplementation breaks it.
