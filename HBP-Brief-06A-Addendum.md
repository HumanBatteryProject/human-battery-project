# Brief 06A: addendum to Brief 06

Run after Brief 06's phases, before its §9 report. Same rules as §0 of Brief 06. One commit per numbered item. Every item that touches a deliverable ends with rebuild, upload as a new version, client-pulled byte and text verification, supersede the previous. Report per Brief 06 §9, with the additions named below.

---

## A1. Hero wordmark legibility

Measured from a phone screenshot of the live home page: half the wordmark's pixel area is below 3:1 against surface-field and the darkest tenth is 1.4:1. The gradient floor is the problem, not the field. Do not change the background.

Regenerate the wordmark PNG with the gradient floor raised: darkest stop is copper #B4794F, midtone copper-light #D9A87A, highlight no lighter than #F5D7AF, keyed alpha as before, same 2172x724 canvas. Replace the file at the path the hero and header load. Screenshot the rendered hero at 390px viewport width, measure the mark pixels against the field, and report the 10th, 50th and 90th percentile contrast. Pass is 10th percentile at or above 4.5:1. If not, raise the floor further and repeat. Regenerate favicons and the OG image from the same source.

## A2. Medication screening table and retired rasters

1. Every row carries "Physician clearance." The blood pressure row is missing it.
2. brand/png: list the nine v4 rasters, grep the repo and the live site for any reference to each, delete the unreferenced ones, report any still referenced rather than deleting them. Scan proves gone.

## A3. Brief 06 §7 changes: bounded autonomy replaces approval

Proposals no longer wait for approval. The trend agent applies its own changes, bounded as follows, and anything outside the bounds goes to the review queue instead of being applied.

A change auto-applies only when all of these hold:
1. It moves a parameter the protocol already defines (window length, wake time, light minutes, sauna or cold dose, sodium, water) within that parameter's published range for the member's tier. It never adds an intervention the tier does not include.
2. The justifying passages carry evidence_tier at "We are confident" or above. "Early evidence", "Published, and argued about" and "Dr. Micah's idea, being tested" can be cited in the explanation but cannot by themselves trigger a change.
3. The member has no screening flag on the intervention being changed. A flagged intervention is never auto-changed; it goes to the queue with the flag shown.
4. The change is within the weekly step limit for that parameter, a constant per parameter. Set conservative defaults and list them.
5. Data coverage for the dimension being acted on is above the confidence floor. A missing week is not a signal.

Everything else stands: the proposal is written with passage ids and tier, the member sees a plain statement of what changed and why in the next morning brief and can decline it from the portal, and the admin queue shows applied changes with one-click revert. Log every applied change with the rule that permitted it.

Constant AUTONOMY_MODE: bounded (default) or review_all. Fixtures: one change that applies, one blocked by each of the five rules, one member decline, one admin revert.

## A4. Lab panels

Build three panel definitions from the live markers table, not from any list in this brief.

- **Panel 1 (Score):** every marker with marker_role = scored and a blood specimen, plus hs-CRP and vitamin D as referable. Report the list; it should be six. The Score computes from the scored four only; the two referable markers are returned and flagged and do not enter it.
- **Panel 2 (Core):** Panel 1 plus every referable marker the Chapter 21 migration named explicitly (needs_review = false), plus fasting glucose, triglycerides and HOMA-IR, which cost nothing extra.
- **Panel 3 (Complete):** Panel 2 plus every referable marker that fell to the default (needs_review = true). Total should be 33. If it is not, report the discrepancy rather than padding.

Add panel_id to the application flow so a member declares their panel. The analysis agent reads it: a marker missing from a member's declared panel is "not in your panel", never "missing" or "out of range". Add one sentence to Your Tests Explained and to every First Steps document, verbatim: "Your Human Battery Score is identical at every panel. Higher panels add context, not points." No prices anywhere; the draw-site specification stays as written.

Report the three lists by canonical name.

## A5. Vitamin D carve-out

The deliverables currently say nothing about vitamin D. Add this to the Dietary Guidelines and to Your Tests Explained beside the vitamin D marker, verbatim: "Vitamin D comes from sunlight first and from cold-water fish second (sardines, herring, mackerel, salmon). If a winter blood test shows the level has fallen and sun is not available, D3 may be needed to bring it back up. That is the last step, not the first." Amend the supplement check to allow the token D3 only inside that exact sentence, and prove the check still fails on D3 anywhere else. No brand, no dose.

## A6. Seasonal foods and local supply

1. **Onboarding** collects ZIP code (US) or postal code plus country. Derive and store timezone, latitude, hemisphere. Do not store a street address. The morning brief, light timing and the winter vitamin D sentence read these fields. Season is computed from latitude and date, hemisphere-aware.

2. **Seasonal food list.** Build seasonality data for every food already in kitchen_data.json and the Dietary Guidelines, by US region and month, from a stated public source (USDA SNAP-Ed Seasonal Produce Guide and state extension guides; record which). Do not invent seasonality; a food with no sourced entry is marked unknown and left off the seasonal list. Add a portal screen and a Dietary Guidelines section, "In season near you now", listing the program's foods in season for the member's region this month, ordered by how often they appear in the protocol. The PDF shows the table by region and month; the portal shows the member's own.

3. **Local supply.** Portal section "Find it near you" linking out, filtered by the member's ZIP, to the USDA Local Food Directories (farmers markets, CSAs, on-farm markets, food hubs) and to public directories for pasture-raised meat and sustainable seafood. Verify each directory is live and accepts a ZIP query before linking; report which you verified and the date. No hand-curated supplier list, no named businesses, and the no-commission statement appears on this screen.

Fixtures: a northern and a southern hemisphere member in the same month get different seasonal lists; a member in a region with no data sees the unknown state, not an empty table presented as nothing in season.

---

## Report additions

Beyond Brief 06 §9: the hero contrast percentiles; the medication table verbatim; the three panel lists by canonical name; the seasonality source and the count of foods with unknown seasonality; the directories verified and the date; the weekly step-limit constants.
