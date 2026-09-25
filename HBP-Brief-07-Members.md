# Brief 07: put someone in the machine

The §9 report's sentence stands: the machine runs and has nobody in it. This brief is ordered so that each section removes one reason a member cannot exist, then makes what they see true to the model.

Rules from Brief 06 §0 apply unchanged, plus the standing rule: a change is not done until it is live and its version is reported. One commit per numbered item, merge, deploy, upload where a deliverable changed, post-deploy smoke test against the internal member, version reported. Where a credential from me is missing, build everything up to the credential, leave the named placeholder, prove the path with a fake that fails loudly, and move on. Do not wait.

## §0. Decisions already made

Constants. Every constant in the §9 table is accepted at its safe value, with one change: DEFAULT_TZ = America/Chicago.

Markers. All 24 needs_review markers remain referable. Chapter 21 is canonical; a marker scores only if the chapter names it under a dimension. The three formerly scored (glucose-fasting, triglycerides, homa-ir) stay referable for the same reason. Clear needs_review with reason "Chapter 21 canonical, referable by default". Promotion happens by editing Chapter 21 and re-running the migration, never in the database alone.

Aliases. --copper (drain) and --teal (output) have no successor and die with the dashboard in §2. --blue and --green are replaced by the five dimension tokens in §2, not recolored.

## §1. Unblock

1. Deploy the brief Worker. wrangler secret put WEBHOOK_SECRET, deploy, confirm the cron fires by watching one firing land in morning_briefs for the internal member at their local morning. Test two concurrent firings for the same member and prove exactly one row results.
2. Voyage. When VOYAGE_API_KEY exists, run load_corpus.py --reembed, then re-run the five retrieval checks. Check 3 (DHA) must land in Chapter 13. Report all five before and after. Until the key exists, prove the placeholder fails loudly and continue.
3. Auth config. When the sbp_ token exists, run set_auth_config.sh, prove sign-in end to end through /portal/confirm, report the URL the link carries. Until then, continue.
4. Corpus loader automation. load_corpus.py runs in the deploy step whenever anything under corpus/ or the deliverable sources changed, keyed on content hash. Prove it by changing one passage and deploying.
5. Onboarding collects ZIP. The application form collects ZIP or postal code plus country and derives timezone, latitude, hemisphere on submit. Backfill the internal member from its hand-set value. A6's screens read the derived fields.
6. Held results surface. The admin results screen lists lab_results_held with the reason, and lets me resolve each one: map to a canonical marker, set a unit, or discard. The two held rows become visible.

## §2. The five-dimension dashboard and tier badges

The portal draws four subsystems the database no longer holds. Rebuild the dashboard on the five dimensions, and build the tier badges in the same pass.

Layout. The Human Battery Score at the top with its disclaimer verbatim and visible, never a tooltip. Beneath it five panels in fixed order: FLOW, CAPACITY, TIMING, STRUCTURE, ENVIRONMENT. Each panel shows: the dimension score, or the sentence the analysis agent already produces when a dimension has no scored input yet, never a null that reads as zero; coverage in words per the narrowed rule 8d; the dimension's markers, each with latest value, unit, date, and a tier badge; a trend sparkline once two or more points exist, one hue, no dual axes.

Below the five: the referable set, titled as the book titles it, each marker with value, range flag, and tier badge, and one line saying these do not enter the Score. Below that: charge, redox, leak, named and shown with no number, with the book's sentence that the Score is complete across what can be measured today.

Color. Five dimension tokens added to the Dawn set, derived from the existing palette without inventing a hex: FLOW chart-2, CAPACITY chart-3, TIMING dawn-amber, STRUCTURE copper-light, ENVIRONMENT dawn-deep lightened to pass on surface-raised. Run check_css.py and the palette validator on the five against both surfaces; if a pairing fails, substitute the nearest passing token and list it. Status colors stay reserved for range flags and carry an icon and a word, never color alone. Sequential fills are one hue.

Tier badges. One component, built once against all six evidence_tier values, per Brief 05 §4: the word carries the tier, one copper, three fills (solid: established, strong; half: emerging, contested; hollow: hypothesis), radius-sm, unsupported never renders to a member. is_authors_model renders as the fifth consumer wording. The badge appears on every marker, on every coach citation, and on every "What is new" item once §6 exists.

Retire. Delete s-charge, s-drain, s-output, s-reserve, --blue, --green, --copper, --teal and every use. Grep proves zero. The 23 held alias uses are resolved by this section, not by recoloring.

Verify. Screenshot the dashboard for the internal member at 390 and 1440; five panels, the referable set, and the three frontier dimensions all present, disclaimer above the number. Seed a dimension score of null and prove the panel renders the sentence, not a zero.

## §3. Functional test capture

One portal screen, "Your tests", with an entry form per instrument the protocol names: VO2max estimate by the protocol's own field test (Figure 19.1), grip strength, sit-to-stand, walking speed, balance. Each entry writes functional_tests or measurements with value, unit, date, and method, and the analysis agent recomputes CAPACITY on write. Until wearables exist, the same screen takes manual HRV, resting heart rate, and heart rate recovery so TIMING can score from logged values. Every entry carries confidence: a manual entry is not a device reading and is tiered accordingly. Body composition, from the referable set, is entered here too. Fixtures: one entry per instrument, one out-of-range value flagged, one entry with no unit held.

## §4. Wearables

Brief 05 §5 governs, verbatim. Build Oura first with a personal access token, then Whoop. Fetch the current vendor docs before writing a line; record doc version and fetch date. Normalization schema, timezone rule, dimension mapping (TIMING and CAPACITY only; nothing to FLOW or STRUCTURE; ENVIRONMENT logged not drawn), composites referable never scored, encrypted tokens, scoped requests, retention and delete path, resumable backfill, confidence check before any scored write. Connect the internal member's own device if one exists; otherwise prove the path with the vendor sandbox and say so.

## §5. Stripe

Build against Stripe test mode now so go-live is a key swap after incorporation. Products: program one-time (constant, default $1,000), founding cohort one-time (constant, default $700, with a cap on count), monthly continuation (default $39), annual continuation (default $349). Checkout from the application flow after placement. Webhook creates the membership and cohort row on payment success; is_internal members are never billed and never see checkout. Panel choice does not change price. Test with Stripe's test cards; prove the webhook creates exactly one membership per payment and none on failure.

## §6. Continuation membership and science intake

Continuation. After day 90 a member continues at the monthly or annual fee and keeps the portal, the daily brief, the coach, the trend agent, logging, wearables, and the seasonal and local-supply screens. Cycle chaining from Phase 8 becomes the continuation: the next 90-day cycle starts automatically with the applied changes carried forward, and the completion agent runs at every cycle boundary. A lapsed subscription freezes the cycle rather than deleting it.

Science intake, two lanes. A weekly intake agent scans for new papers on the five dimensions and every intervention the protocol contains, summarizes each relevant paper in the book's register, proposes an evidence tier, and writes it to a review queue. Nothing enters the corpus without approval in the admin screen; approved entries carry citation, tier, approver, and date. The daily brief gets a "What is new" item drawn only from approved entries, always with its tier badge. The trend agent may cite approved entries, but the bounded-autonomy tier floor is unchanged.

Sources, priority order. The Nature family (Nature, Nature Metabolism, Nature Medicine, Nature Aging, Nature Communications, Scientific Reports) via Crossref and the journals' own feeds, then PubMed broadly, then the preprint servers. Each queue entry records whether the summary came from full text (open access) or abstract only, and that flag shows in the review screen. Never summarize from a paywalled full text the agent has not read. Constants: scan cadence (weekly), the journal list (editable without a deploy), the tier floor.

Fixtures: one paper approved and retrieved by the coach with its tier; one rejected and never retrievable; one abstract-only entry showing the flag; one approved entry at "Early evidence" cited in a brief but not triggering a protocol change.

## §7. Seasonality, first real region

Load the Texas A&M AgriLife month-by-month harvest calendar as region TX, with months, into the existing table. Record source and fetch date. Foods the calendar does not cover stay unknown.

## §8. Counter-evidence

Build passage_links so a passage can be linked to a passage that argues against it, with a relation type. The proposal queue and the coach's citation show the counter passage when one exists. Load the links the book already makes explicit (vitamin D trials against the observational data, antioxidant trials against the supplement claim, omega-3 trials against the index claim) as the first rows.

## §9. Report

Per section as before. Then the three-part question again, in words, with what changed since the last answer, and a fourth: can a member connect a ring and see TIMING score. Then one screen of what is still not built.
