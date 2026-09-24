# Prompt for Claude Code: Platform v2

## Before you start, read the current state

As of 17 September 2026:

- Supabase project `tjfpzdpfrztqksixcjfz` is on the Pro plan. Migrations 001 through 017 are applied. 35 tables, 66 RLS policies. You apply migrations with `psql` using `SUPABASE_DB_URL` from `.dev.vars`, the same way you applied 016 and 017.
- The project uses the new Supabase key type. `public/portal/config.js` carries the `sb_publishable_` key (the variable may still be named `SUPABASE_ANON_KEY`; that is fine). `.dev.vars` and Cloudflare carry the `sb_secret_` key as `SUPABASE_SERVICE_KEY`. The legacy JWT keys are being retired. Do not reintroduce them anywhere.
- All six program PDFs are in the `program-docs` storage bucket, tier-gated, verified with real Beginner, Pro and anonymous identities.
- The application form works end to end into Supabase. A duplicate email returns success with "We already have your application." Resend delivery is confirmed only if a confirmation email has actually arrived in the owner's inbox. Check the Resend dashboard before relying on it.
- Every contact address on the site is `admin@thehumanbatteryproject.com`. There is no `hello@` or `privacy@` inbox. Anything you write that a client reads uses `admin@`.
- Job 1 from `PROMPT-foundational-model-and-coach.md` (light as timing, trillions of batteries, coherence named, the four-questions pass, the electrolyte rule, PDF regeneration on this machine) must be complete and at Checkpoint 1 before Phase 1 below begins. If it is not, finish it first and stop at that checkpoint.
- The PDF generators live in `program-docs/`: `build.py` (data and entry point), `design.py` (shared CSS and illustrations), `tier_doc.py`, `diet_doc.py`, `tests_doc.py`. They run on this machine with Python 3.12 and weasyprint from Homebrew. If regeneration fails, that toolchain is the first thing to check. Every new PDF uses `design.py` so it matches the six that exist.
- The first start wave is **1 January 2027**. Nobody gets a `day_zero` before that date. It lives in `program_settings` so I can change it without a code change.

## Migration numbering

Migrations are numbered in the order they are written, starting at 018. The numbers in the spec's Part 4 and in the older coach prompt (`018_coach.sql`) are intent, not fixed numbers. When a phase needs a migration, use the next free number. Never reuse a number, never edit a migration that has run.

## Models

- Everything a client reads that is generated per person (coach, morning briefs, insights, invitations): `claude-sonnet-5`.
- The weekly trend agent, which reads across everyone: `claude-opus-5`.
- The older coach prompt names `claude-sonnet-4-6`. That is superseded by the above.
- Embeddings: Voyage AI, key `VOYAGE_API_KEY`, current general-purpose text model (`voyage-3.5` as of my last check; if `docs.voyageai.com` lists a newer general model, use that and tell me). The vector column's dimension matches the model's default output. Anthropic does not offer an embeddings endpoint, so do not look for one.

## What I will need to do myself, and when

Ask for each of these at the start of the phase that needs it, not in the middle.

| Before | What I do | Where it goes |
|---|---|---|
| Phase 1, end | Give you the weekly Zoom link, the day and the time | `program_settings`, never hardcoded |
| Phase 3 | Create a Voyage AI account and paste `VOYAGE_API_KEY` into `.dev.vars` and Cloudflare, then redeploy | Cloudflare env vars |
| Phase 4 | Create an Anthropic Console account with billing and paste `ANTHROPIC_API_KEY` into `.dev.vars` and Cloudflare, then redeploy | Cloudflare env vars |
| Phase 5 | Run `npx wrangler login` once so you can deploy Workers | This machine |
| Phase 8 | Tell you the return price | `program_settings` |

I put secrets into `.dev.vars` myself. Do not ask me to paste a key into the chat.

---

Read `docs/HBP-Platform-v2-Spec.md` completely before doing anything. It replaces the cohort model with open enrollment, individual 90-day clocks, and six agents. Read `CLAUDE.md` and `docs/HBP-Foundational-Model.md` too. The guardrails in both still apply to every agent.

Build in the eight phases the spec lays out. Stop at the end of each phase, show me what it looks like, and wait. Do not start the next phase until I say so.

---

## Phase 1: Open enrollment and individual clocks

**Migration `018_open_enrollment.sql`** as specified: cohorts become start waves with no seat cap, a function `next_wave_date()` that returns the next 1st or 15th on or after `first_wave_date`, a function `create_waves(months_ahead)` that inserts wave rows and is safe to run twice, `weekly_calls` and `call_questions` tables with RLS, plus `memberships.cycle`, `memberships.intensity_multiplier`, `memberships.previous_membership_id`, the `completion_invitations` table and `program_settings`, all as the spec describes.

Seed `program_settings` with: `first_wave_date` = 2027-01-01, `weekly_call_day`, `weekly_call_time`, `weekly_call_timezone` = America/Chicago, `weekly_call_zoom_url` (empty until I give it to you), `return_price_cents` (empty until Phase 8), `coach_daily_message_limit` = 20. Generate waves twelve months ahead in the migration.

**Checkout and webhook.** When Stripe confirms payment, set `memberships.day_zero` to `next_wave_date()` and status to `enrolled`. Remove the seat-count check from `checkout.js`. Keep the accepted-application gate. The membership row joins the wave that matches its `day_zero`, because `memberships.cohort_id` is still required.

**Dashboard rebuild** of `public/portal/index.html`: Day N of 90 large with the phase name, tier badge with a "ready to move up?" link, today's brief placeholder, the log button, the next weekly call with its link and the archive, and their documents. Before day 1, show the countdown to day zero with the actual date and the First Steps checklist instead.

**Weekly call screen** `public/portal/calls.html`: next call, past recordings, and a form to submit a question in advance. Read the schedule and link from `program_settings`.

**Tier change request** from the dashboard: writes to `tier_history`, updates `memberships.tier`, and the Program tab reflects it immediately.

**Site copy.** Wherever the marketing site or the plain version says a group of 25 to 30, a cohort, one shared start date, "the next cohort", "the next group", a 5 to 10 minute check-in, or a weekly individual check-in, change it to: open enrollment, start on the 1st or the 15th of any month, your own 90-day clock, one weekly one-hour call open to everyone. Keep the plain version at grade 3, measured with textstat. No em dashes.

**CHECKPOINT 1.** Show me the new dashboard, the calls page, and the changed marketing copy. Ask me for the Zoom link, day and time. Wait.

---

## Phase 2: First Steps documents and the onboarding agent

**The placement questions.** The application form does not yet ask how the person lives. Add the seven placement rows from the Placement table in `docs/HBP-Protocol-Complete.md` (training, cold, sauna, fasting, food, morning light, sleep) as seven rows in the `questions` bank, each with four options matching the four columns, and add them to the application form as a required section. Store the answers in `intake_responses`. Placement rule, exactly as the protocol states it: four or more answers in one column places the person in that tier; mixed results place them in the lower of the two closest tiers. Applications that predate this section have no answers; place them at Beginner and flag them to me.

**Four PDFs** from a new `program-docs/first_steps_doc.py` that uses `design.py`, one per tier, titled "Your First Steps," with the six sections from the spec: what happens next and when the clock starts, the blood panel with ordering instructions (Any Lab Test Now, same as in Your Tests Explained), the Omega-3 Index as a required test with the OmegaQuant kit instructions, the functional tests, the optional tests with costs, and their tier. The Omega-3 Index is required at day 0 and day 90 for every tier. Say why in the document, at the tier's reading level: DHA is what the membranes that receive the light signal are built from, the retina most of all, so low DHA means the signal lands on a degraded receiver. Same brand as the tier protocols. Store at `program-docs/tier/<tier>/HBP-First-Steps-<TIER>.pdf`, upload to the bucket at the same path, and register them in `program_documents`.

**Onboarding function** `functions/api/onboard.js`, triggered by a Supabase database webhook on `applications.status = 'accepted'`: compute the tier from the placement answers, create the auth user and profile if they do not exist, send the welcome email through Resend with the First Steps PDF for their tier attached, and create a `memberships` row in `invited` status. `day_zero` is set later by payment. The webhook carries a shared secret in a header; the function refuses anything without it.

**CHECKPOINT 2.** Show me one First Steps PDF, the placement section on the form, and a test run of the onboarding webhook. Wait.

---

## Phase 3: The knowledge corpus

**Migration** (next free number, `knowledge`): enable pgvector, `knowledge_sources` and `knowledge_passages` as specified, with the vector dimension matching the Voyage model, and an index on the embedding column.

**Loader script** `scripts/load_corpus.py`: reads every file in `docs/`, every PDF in `program-docs/`, and every file in a new `corpus/` folder, splits into passages of roughly 400 tokens with overlap, generates embeddings with Voyage, and inserts them with source metadata. Each source needs an evidence tier and the subsystems it bears on; put a `corpus/manifest.yaml` alongside the files that declares these, and refuse to load any file not in the manifest. Loading is idempotent: running it twice does not duplicate passages.

Put the research source list from `docs/HBP-Platform-v2-Spec.md` Part 2 into the manifest as entries with title, authors, year and evidence tier, so I can drop the PDFs in as I get them. Every file in `docs/` gets an entry too. The Foundational Model is tagged `established` for its physiology and is marked canonical.

**Retrieval function** `functions/api/_retrieve.js`: takes a query and optional filters (subsystem, evidence tier, max tier for the client), embeds it with Voyage, returns the top passages with their source and evidence tier.

**CHECKPOINT 3.** Load the docs that exist, run five test queries, show me the passages that come back with their evidence tiers. Wait.

---

## Phase 4: The coach

Build it exactly as the earlier coach spec in `PROMPT-foundational-model-and-coach.md` Job 2, with these changes:

- The system prompt includes retrieved passages from the corpus for each message rather than the whole foundational model inline. The foundational model stays as a short summary; the retrieval fills in the specifics.
- Model `claude-sonnet-5`, not `claude-sonnet-4-6`.
- The coach migration takes the next free number, not 018.
- Escalation points to the weekly call and to `admin@thehumanbatteryproject.com`.
- The daily limit reads `coach_daily_message_limit` from `program_settings`.

All guardrails as written. All ten test conversations.

**CHECKPOINT 4.** System prompt and the ten test results. Wait.

---

## Phase 5: The morning brief agent

**Migration** (next free number, `agents`): `client_insights`, `morning_briefs`, `agent_runs`.

**Worker** `workers/morning-brief/` with an hourly cron. Workers do not share the Pages environment variables. Set `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and `RESEND_API_KEY` as Worker secrets from `.dev.vars`. Tell me before the first deploy so I can run `npx wrangler login`.

Each run: find every active client whose local time is 8am, using `profiles.timezone`, and for each, generate one brief. Once a day, also call `create_waves(12)` so there are always waves ahead.

The generation prompt gets: tier, program day, phase, yesterday's log summary, most recent insight if any, the last three briefs so it does not repeat, and five retrieved passages relevant to their phase and their biggest gap. It writes 150 to 250 words at the tier's reading grade, one idea, one thing to do today, no em dashes. Store it. Check the reading grade with textstat after generation; if Beginner comes back above grade 4, regenerate once with a stricter instruction.

The dashboard shows today's brief. A brief archive page shows all of them. Reading one is logged.

Send it by email too, through Resend, with a link back to the portal.

**CHECKPOINT 5.** Generate briefs for four test clients, one per tier, at day 3, day 30, day 60 and day 88. Show me all sixteen with their measured reading grades. Wait.

---

## Phase 6: The analysis agent

**Function** `functions/api/analyze.js`, triggered by database webhooks on inserts to `lab_panels`, `functional_tests`, `genotypes` if that table exists, and any Omega-3 Index row.

It gets everything on file for that client and the new data, retrieves relevant passages, and writes an insight per the spec: what the data shows in Human Battery terms, which subsystem, which protocol elements are most relevant, what it does not know. Every marker outside the lab's reference range gets the physician-referral line. No diagnosis, no interpretation of a marker as a condition.

Insights are stored, shown on the results page under the relevant subsystem, and included in the coach's context.

**CHECKPOINT 6.** Insert a test day 0 panel with two out-of-range markers, show me the insight it writes. Wait.

---

## Phase 7: The trend agent and the proposal queue

**Migration** (next free number, `learning`): `weekly_findings`, `protocol_proposals`, `protocol_versions`.

**Worker** `workers/trend/` with a weekly cron, on `claude-opus-5`. It reads across all clients and writes the weekly findings report and any protocol proposals. Every proposal has the current text, the proposed text, the rationale, and the data behind it. Every report states which of describing, pattern-finding or predicting it is doing, based on n.

**Admin screens** at `public/portal/admin/`: the proposal queue with approve and reject, the findings archive, and the agent run log. Admin role only, enforced by RLS and checked in the function.

**Approval flow.** Approving a proposal regenerates that tier's PDF from the generators with the change applied, bumps `protocol_versions`, uploads the new PDF, and emails clients on that tier that their protocol has a new version and what changed. Rejecting archives it. Nothing regenerates without approval.

**CHECKPOINT 7.** Run the trend agent against test data, show me a findings report and one proposal in the queue, then approve it and show me the regenerated PDF. Wait.

---

## Phase 8: Completion and the invitation back

**Refactor the generators** (`build.py` and `tier_doc.py`) so every numeric prescription that should scale with intensity is a variable marked scalable: zone 2 minutes, resistance sets, sauna minutes per round, cold minutes and temperature, interval rounds, extended fast frequency, eating window hours. The generator takes an `intensity_multiplier` and applies it to scalable values only, rounding sensibly, and enforces the caps from the spec: sauna rounds at most 25 minutes, cold at most 10 minutes and never below 38°F, at most one extended fast per week. Light, food list and supplements never scale. Generate a Pro PDF at multiplier 1.0, 1.2 and 1.44 and show me all three side by side so I can see what 20 percent looks like on the page.

**Completion function** `functions/api/complete.js`, triggered by a database webhook when a `battery_scores` row is written for a `day_90` panel. It compares to the day 0 score, applies the rules in the spec (improved: next tier up; improved and Pro: Pro at multiplier times 1.2; not improved: same tier again), writes `completion_invitations`, sends the invitation email through Resend naming every marker that improved, and returns.

**Day 90 screen** `public/portal/day90.html`: the before-and-after by subsystem, the markers that moved most, the invitation with its offered tier and what it adds, and an Accept button. Accepting creates the next `memberships` row chained to this one, with the offered tier and multiplier, and `day_zero` at the next wave. The return price comes from `program_settings`; do not hardcode it.

**Reuse of the day 90 panel.** If the client accepts within 30 days of the day 90 draw, that panel becomes the day 0 panel of the new cycle rather than requiring a fresh draw. Implement this as a link on `lab_panels`, not a copy.

**CHECKPOINT 8.** Insert test day 0 and day 90 panels for an Intermediate client who improved and a Pro client who improved, run the completion function for each, show me both invitation emails and both Day 90 screens, then accept the Pro one and show me the cycle 2 membership with its multiplier and the regenerated Pro PDF. Wait.

---

## Throughout

- Every new table has row-level security. Client rows are readable only by that client and staff.
- Every function verifies the Supabase JWT and never trusts a user id from the request body.
- Every database webhook carries a shared secret header. The secret lives in Supabase Vault and in Cloudflare, never in a migration file and never in the repo. You generate it and tell me where to paste it.
- `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` live in Cloudflare environment variables, Worker secrets and `.dev.vars`. Add both to the tables in `README.md` and `SERVICES-SETUP.md`.
- Log every agent run to `agent_runs` with tokens and status.
- Every agent states the evidence tier it is standing on.
- No em dashes in anything a client reads.
- Delete every test row you create, and say so.
- Commit at the end of each phase with a message naming the phase. Push.
- When something fails, tell me what broke in plain language, not a stack trace.

Start with Phase 1.
