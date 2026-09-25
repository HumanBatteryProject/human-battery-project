# Pillar mapping proposal, for approval before canonical_rules is built

Ruling 3 of 25 September: the six pillars of master prompt C1 govern. Each of the
protocol's nine sections maps onto one of them. This is the proposal. Nothing is
built until it is approved.

The nine sections are taken verbatim from `program-docs/tier_doc.py`, which is
the source that generates the tier documents, not from any summary of them.

## The proposed mapping

| # | Protocol section | Proposed pillar | Clean fit |
|---|---|---|---|
| 01 | THE CLOCK, circadian protocol | Morning daylight | **No, spans two** |
| 02 | WATER, water and minerals | Hydration | Yes |
| 03 | MOVEMENT | Movement | Yes |
| 04 | FOOD | Food timing | **Partly** |
| 05 | HEAT AND COLD | *none of the six* | **No pillar exists** |
| 06 | SLEEP | Sleep | Yes |
| 07 | ENVIRONMENT, equipment and sourcing | Nighttime darkness | **Weak** |
| 08 | THE NINETY DAYS, three phases | *not a rule domain* | **No** |
| 09 | EVERY DAY, daily checklist | *not a rule domain* | **No** |

Four of nine map cleanly. Five do not, and each one is a decision rather than a
detail.

## The five problems, and what I recommend

**1. Section 01 covers two pillars, not one.** The circadian protocol is morning
light AND evening darkness. C1 lists those as two separate pillars, and C5 says
every rule belongs to one. Splitting 01 into its morning rules and its evening
rules is the only way both pillars get rules at all.

Recommended: split section 01. Morning light rules to Morning daylight, evening
and pre-sleep light rules to Nighttime darkness.

**2. Nighttime darkness has no section of its own.** It exists inside 01 and is
supported by the glasses and bulbs in 07. If 01 is not split, this pillar has
zero rules and one of the six is decorative.

**3. Heat and cold has no pillar, and this one has teeth.** Sauna and cold are
not any of the six pillars, yet they are the most safety relevant interventions
in the program: both appear in the medication screening table, both have hard
caps (`sauna_min` 25, `cold_min` 10), and both have per tier ranges in
`protocol_parameters`. Under C1 as written, no sauna or cold rule can exist,
which means the protocol's dosed heat and cold either ships with no rule
governing it or does not ship.

Three ways out, and this is yours to pick:
  - Add a seventh pillar, "Heat and cold". Departs from C1's list.
  - Fold it under Movement as deliberate physical stress. Defensible, and it
    puts a contraindicated intervention under a pillar whose other rules are
    low risk, which I would rather not do quietly.
  - Leave heat and cold out of the V1 action catalog entirely, keep it in the
    protocol documents as instruction, and generate no daily actions for it.

Recommended: the third. It is the only one that changes neither C1 nor the risk
profile of a pillar, and Part D4 asks for one to three **low risk** actions. It
means a member still reads their sauna and cold protocol; the software just does
not put it in the daily plan in V1.

**4. Section 04 FOOD is broader than "food timing".** The section is protein
first, fat for fuel, inside a window that closes early. Only the window is
timing. The pillar list has no pillar for what a person eats.

Recommended: map the window rules to Food timing, and treat composition as
education rather than as daily actions in V1. The Dietary Guidelines already
carry it.

**5. Sections 08 and 09 are not rule domains.** 08 is the phase structure of the
ninety days and 09 is the daily checklist. Neither generates a canonical rule:
08 is program state, which D1 already covers, and 09 is the check-in itself,
which is D3. They belong in the plan, not in the catalog.

Recommended: exclude both from canonical_rules and record why, so it is clear
they were considered rather than forgotten.

## What this produces, if approved as recommended

| Pillar | Sections feeding it | Rules expected |
|---|---|---|
| Morning daylight | 01, morning half | Yes |
| Hydration | 02 | Yes |
| Movement | 03 | Yes |
| Food timing | 04, window only | Yes |
| Sleep | 06 | Yes |
| Nighttime darkness | 01 evening half, 07 | Yes |

Six pillars, all six with rules, nothing invented, and heat and cold explicitly
out of the V1 catalog rather than silently missing.

## The one thing I will not decide

Whether heat and cold gets a seventh pillar, gets folded into Movement, or stays
out of V1. It changes what the software is allowed to tell a person to do with a
contraindicated intervention.
