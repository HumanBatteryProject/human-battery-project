# Brief 07: continuation, science intake, and what Briefs 05 and 06 left unbuilt

Same rules as §0 of Brief 06. One commit per numbered item, suites clean before
each, and the standing rule from 06A: **a change is not done until it is live
and its version is reported.**

Two inputs already exist and are not to be rebuilt: `is_internal` with the
`participant_memberships` view, and the chaining columns on `memberships`
(`cycle`, `previous_membership_id`, `intensity_multiplier`,
`completion_summary_id`).

---

## §A. Continuation membership

After day 90 a member can continue at a monthly fee and keep everything: the
portal, the daily brief, the coach, the trend agent, logging, wearables, and
the seasonal and local-supply screens. Continuing is the default shape of the
relationship, not an upsell bolted on the end.

**Cycle chaining from Phase 8 IS the continuation.** The next 90-day cycle
starts automatically with the approved changes applied, and the completion
agent runs at every cycle boundary rather than once. Phase 8 already writes a
new linked membership row and never mutates the completed one; that behavior
is the mechanism and does not change.

Constants, with safe values to set and list:
- `CONTINUATION_MONTHLY_CENTS`, default **3900**
- `CONTINUATION_ANNUAL_CENTS`, an annual option at a stated discount
- Both live in `program_settings`, never in code. CLAUDE.md already says
  prices live there, and `check_deliverables` now fails on a price in any
  deliverable, so `$39` must never reach a PDF or the corpus.

**Internal members are never billed.** `is_internal` already exists and
`participant_memberships` is the supported view. Every billing query and every
cohort statistic reads the view, not the table.

What has to be decided rather than assumed: what happens at day 90 if the
member does nothing. Lapse, or continue and charge. Build the path for both,
set the safe value to **lapse**, and list it.

---

## §B. Science intake, two lanes

A weekly intake agent scans for new papers on the five dimensions and on every
intervention the protocol contains, summarizes each relevant paper **in the
book's register**, proposes an evidence tier, and writes it to a review queue.

**Nothing enters the corpus without approval in the admin screen.** Approved
entries carry citation, tier, and approver. `knowledge_sources.kind` already
allows `citation_summary`, which is what these are.

**The two lanes, and they are deliberately different speeds:**

1. **Informing.** The daily brief gets a "What is new" item drawn **only from
   approved entries**, always showing the tier. New science reaches members as
   soon as a human approves it.
2. **Changing.** The trend agent may cite approved entries, but the
   bounded-autonomy tier floor from 06A A3 is **unchanged**: a change
   auto-applies only on `established` or `strong`. So a paper can be told to a
   member the week it lands and still not move their protocol until its tier
   reaches the floor.

Constants: scan cadence, source list, and the tier floor.

Rules the summaries inherit, because they become corpus and therefore become
the coach's voice:
- No em dashes. The prohibitions suite now scans the corpus and agent
  fixtures, so a summary carrying one fails the commit.
- No supplement, no brand, no price.
- US spelling.
- A summary states the tier it is standing on.

---

## §C. Science intake sources, in priority order

1. **The Nature family**, Nature, Nature Metabolism, Nature Medicine, Nature
   Aging, Nature Communications, Scientific Reports. Via Crossref and the
   journals' own feeds.
2. **PubMed broadly.**
3. **The preprint servers.**

**Every queue entry records whether the summary came from the full text (open
access) or from the abstract only, and that flag shows in the review screen.**

**Never summarize from a paywalled full text the agent has not actually read.**
A summary that reads like full-text analysis but was written from an abstract
is the most dangerous output this system could produce: it is confident, it is
plausible, and nothing downstream can tell it apart from a real one. The flag
is not a nicety, it is the thing that makes the queue reviewable.

Constant: the journal list, **editable without a deploy**. That means a table,
not an array in a file.

Existing verification rules apply and are not to be re-litigated:
- **PubMed is the primary metadata source**; Crossref confirms the DOI
  resolves and that the record is the same paper. Where they disagree, PubMed
  wins unless there is a stated reason.
- **Use `efetch`, not `esummary`**, `esummary` truncates titles, and in this
  project it truncated the one clause a citation existed to carry.
- A failed lookup is not evidence a reference is dead. Retry three times, then
  check a second way.
- `study_type` comes from PublicationType where it names a design; where it
  does not, read the methods and say in the report that PublicationType could
  not supply it.

---

## §D. Stripe

Four products:
- one-time program price
- founding cohort price
- monthly continuation
- annual continuation

`is_internal` members are **never billed**, at any of the four.

CLAUDE.md rule 8c still binds: going live means swapping **two** secrets, not
one. `STRIPE_SECRET_KEY` without `STRIPE_WEBHOOK_SECRET` fails in the worst
available way, the payment succeeds, the webhook 500s on signature
verification, every retry fails, and no membership and no onboarding is created
for somebody who has paid. Verify a live test charge creates a `memberships`
row before the first real client pays.

---

## §E. Carried forward from Briefs 05 and 06, still not built

Ordered as I would build them. The first four are mostly credentials rather
than code and they unblock everything else.

| # | Item | Why it blocks |
|---|---|---|
| 1 | **Stripe**, both variables still literal placeholders | nobody can enroll; blocks every other item |
| 2 | **Supabase auth config**: Site URL, allowlist, `{{ .TokenHash }}` template | sign-in is broken for everyone; needs one `sbp_` token, script is written and hardened |
| 3 | **Voyage embeddings**: 370 passages, 0 vectors | retrieval is lexical and puts the DHA question in the wrong chapter; one command, `load_corpus.py --reembed` |
| 4 | **Deploy `workers/brief.js`**: never deployed, no `wrangler secret put` | nothing fires on a schedule even for a member who exists |
| 5 | **Five-dimension dashboard**: 13 uses of `s-charge/s-drain/s-output/s-reserve`, 0 screens read `dimension_scores` | the interface draws a model the database no longer holds |
| 6 | **Tier badges**: 0 files | six `evidence_tier` values are live in the database and invisible everywhere |
| 7 | **Wearables**: HRV, heart rate recovery | TIMING's named instruments; **TIMING can never score without them** |
| 8 | **Functional test capture**: nothing writes `functional_tests` or `measurements` | **CAPACITY can never score without it** |
| 9 | **Onboarding does not collect ZIP** | §A6 reads `postal_code`; only the internal member has one, set by hand |
| 10 | **Marker adjudication**: 24 flagged `needs_review`, three formerly scored | `glucose-fasting`, `triglycerides`, `homa-ir` were demoted by the default rule |
| 11 | **The 23 held color alias uses** | `--copper` and `--teal` have no canonical name; unresolvable until item 5 |
| 12 | **Counter-evidence schema**: `passage_links` does not exist | only the minimal `proposals.counter_evidence` column was built |
| 13 | **Corpus loader automation** | a manuscript revision leaves the corpus silently stale |
| 14 | **Admin results screen never surfaces `lab_results_held`** | two held rows are invisible right now |
| 15 | **Seasonality by region and month** | current data is season-level and national; the columns already exist for state extension guides |

---

## §F. What the report must carry

Per section: what exists that did not, the seeded defect each check caught,
the fixtures and whether they pass, and what is still open. Then:

- the continuation constants with their safe values, and the day-90 default
- the science queue: entries scanned, proposed, approved, and the full-text
  versus abstract-only split
- the journal list as loaded, and where it is edited
- the four Stripe products with a live test charge proving a `memberships` row
- and the three-part question again: can a member who enrolls today get a brief
  tomorrow, a coach answer that cites a tier, and a scored dimension once labs
  arrive, with what still blocks each.
