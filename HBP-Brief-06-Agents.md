# Brief 06: the corpus, then every agent

One session if it fits, several if it does not, but the order is fixed and each phase is committed and verified before the next starts. Nothing here needs a question back. Where a decision is genuinely mine and not made below, build the code path, leave the decision as a named constant with the safe value, and list it in the report.

Two inputs arrive with this brief:
- `book_rev318.md`: the complete manuscript, current revision, figures replaced by their caption lines. Commit it to `corpus/book/` unchanged. It is the source of truth for the coach's voice and claims. Do not edit it; edits happen in the manuscript, not the repo.
- The eleven deliverables already build from source in the repo. They are corpus sources too.

---

## §0. Rules that outrank everything else

1. Treat any figure in this brief as unverified until recomputed.
2. A check that cannot fail is not a check. Every verification you write must be shown to fail on a seeded defect before it is trusted.
3. Never rebuild a file's contents from tool output. Edit in place or regenerate from source.
4. Commit per phase. Prohibitions suite, `check_deliverables`, `check_claims`, `check_css` clean before each commit.
5. No supplement mention, no brand, no price, anywhere an agent can say it. The agents inherit the deliverables' prohibitions and the suite runs against agent output fixtures, not only PDFs.
6. US spelling in everything a user reads, including agent output.
7. No em dashes in any user-facing string, agent output included. Add it to the prohibitions suite if it is not there.
8. Finish the in-flight work first: the removal branch upload, decisions 1 to 3, hero wordmark size. The Chapter 21 migration must be merged before Phase 3 starts, because the corpus tags passages with canonical marker names. Any of the 9 unadjudicated markers with no canonical name is listed in the report by alias and left unmapped, never guessed.

---

## §3. The corpus and its loader

**What it loads.** `corpus/book/book_rev318.md`, the source text of all eleven deliverables, and nothing else this session. No web content, no external papers, no notes. The corpus is the program's own material.

**Chunking.** Split on headings, then into passages of roughly 150 to 400 words that end on a sentence. Never split a table, a list, or a figure caption from the paragraph that introduces it. Every passage carries:
- `source` (book or deliverable id), `part`, `chapter`, `section`, `passage_index`
- `dimension` where the section is about one (FLOW, CAPACITY, TIMING, STRUCTURE, ENVIRONMENT) or null
- `markers[]` by canonical Chapter 21 name, only where the passage names a marker
- `evidence_tier` where the passage states a claim the book tiers, else null
- `reference_ids[]` for every citation the passage makes, resolved against the book's reference lists
- `is_authors_model` true where the book itself marks the idea as Dr. Micah's

Tiering is read from the text, not inferred. Where the book does not tier a claim, the passage has no tier and the coach treats it as `unsupported` for the purposes of making a claim. That is a feature: the coach may quote it as context but may not present it as established.

**Embeddings.** One model, named in a constant, recorded on every row with its version. Store the raw passage text separately and immutably from the embedding so a re-embed is a rerun, not a reload.

**Loader.** `scripts/load_corpus.py`, idempotent, keyed on content hash, so rerunning after a manuscript revision updates changed passages and leaves the rest. It reports counts per source and per chapter, and it fails if any chapter yields zero passages.

**Verification that can fail.** Seed a passage with a supplement brand, run the loader, confirm the prohibitions suite rejects the load. Then remove the seed. Query five known facts from the book by paraphrase and confirm the top hit is the right chapter. Record the five queries and their hits in the report.

---

## §4. The coach

`functions/api/coach.js`. The rules:

1. **Retrieval first, then answer.** Every reply is built from retrieved passages. The coach does not answer from the model's own knowledge of nutrition, light, or medicine.
2. **Claims carry tier.** When the coach states something as true, the passage it came from must carry an `evidence_tier` other than null or `unsupported`, and the reply renders the consumer wording for that tier ("We know this", "We are confident", "Early evidence", "Published, and argued about", "Dr. Micah's idea, being tested"). A passage with no tier can be offered as "the book discusses" but never as a claim.
3. **The coach declines outside the corpus.** If retrieval returns nothing above the similarity floor, the coach says it does not have that in the program and suggests the member ask their prescriber or bring it to the trend review. It does not improvise.
4. **Medical boundary.** Medication changes, dose changes, diagnosis, and anything in the medication screening table route to "ask your prescriber" with the relevant table row quoted. Build this as a classifier step before retrieval, not as a hope in the system prompt.
5. **The Score disclaimer.** Verbatim, whenever the Score is shown or discussed.
6. **Voice.** Second person, plain, the book's register. No motivational filler. Test by fixture: ten member questions with expected tier, expected decline or not, expected prescriber routing or not.
7. **Log every turn** with the passage ids retrieved and the tier rendered, so a wrong answer is traceable to a passage.

---

## §5. Cron worker and the morning brief

`workers/brief.js` and `/api/brief-run`. The brief is assembled, not generated: yesterday's logged inputs, today's timing targets from the member's protocol, one retrieved passage relevant to the weakest dimension, and one action. The model writes only the connective sentences. Idempotent per member per day, keyed so a rerun does not send twice. Timezone from the member record, never the server. The portal screen that reads the table with 0 rows now has rows.

Failure mode to design against: a member with no logged data. The brief for that member is short and asks for the one input that matters most today. It is not a zero-filled report.

---

## §6. The analysis agent

`functions/api/analyze.js`. Labs in, coaching out, through the marker mapping and nothing else.

1. A lab value enters only under a canonical Chapter 21 marker name. Unknown marker names are held, not scored, and appear in the admin results screen as held.
2. `marker_role` governs: `scored` markers move a dimension, `referable` markers are shown and flagged out of range but never scored. Vendor composites stay referable.
3. Units are normalized on ingest with the conversion recorded. A value with no unit is held.
4. Each scored dimension recomputes from its markers with the missing-data rule: a missing marker is missing, not zero, and the dimension shows its coverage.
5. The coaching text for a result is retrieved from the corpus by marker and dimension, tiered as in §4. The analysis agent never states what a marker means from model knowledge.
6. Out-of-range values that the medication screening table or the book flag as needing a physician route to the prescriber message, above the coaching, not below it.

`battery_scores` should have rows after this phase, from the test member.

---

## §7. Trend agent and the proposal queue

`functions/api/trend.js` plus a `proposals` table. The trend agent runs weekly, compares this week's dimensions and logged inputs to the prior four, and writes proposals. A proposal is a suggested change to the member's protocol with the passage ids that justify it and the tier of that justification.

**Nothing the trend agent proposes takes effect on its own.** Proposals sit in the queue until approved in the admin screen. Build the admin approve/reject path in this phase, with who approved and when. A proposal whose justification tier is below "Early evidence" is written but flagged, so the queue shows it as weak.

The counter-evidence schema from the earlier proposal is built here, minimally: a proposal can carry a `counter_evidence` passage id, and the queue shows both sides.

---

## §8. Completion agent, cycle chaining, intensity multiplier

`functions/api/complete.js`. At day 90: a completion summary from stored scores and logs, a next-cycle protocol carried forward with the approved proposals applied, and the intensity multiplier as specified. Chaining creates the next cycle's rows and links them; it never mutates the completed cycle. Runnable against the test member with a forced end date, because no real member will reach day 90 for three months and Stripe is parked.

---

## §9. What "as complete as possible" means for the report

For each of §3 through §8: what exists now that did not, the verification and the seeded defect it caught, the fixtures and whether they pass, and what is still open. Then:

- Corpus counts by source and chapter, the five retrieval checks with their hits.
- The unmapped marker aliases by name.
- The list of every constant left for my decision, with the safe value you set.
- The one question, in words: can a member who enrolled today get a brief tomorrow, a coach answer that cites a tier, and a scored dimension once labs arrive? If any of the three is no, say which surface is holding it.
