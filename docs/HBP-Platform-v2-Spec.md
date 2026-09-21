# The Human Battery Platform

## Version 2: open enrollment, individual clocks, and the agents

*This replaces the cohort model. Everything below is what changes and how it gets built.*

---

## What changes, in one table

| | Was | Now |
|---|---|---|
| **Enrollment** | 25 to 30 per cohort, one shared start date | Open, any time. No cap. |
| **Start date** | Cohort start | The 1st or 15th of the month, whichever comes next after payment |
| **Clock** | Cohort day | Each person's own 90-day clock on their dashboard |
| **Coaching** | Weekly 5 to 10 minute call per person | One weekly one-hour Zoom, open to everyone, questions welcome |
| **Onboarding** | Manual | On acceptance, a branded document explaining what tests to get and how |
| **Tier** | Set at intake | Set at intake, can move up any time, the PDFs change with it |
| **Daily contact** | The log only | The log, plus an 8am morning brief written for them, at their tier's reading level |
| **Analysis** | Manual review | An agent reads their labs, tests and log and writes what it sees |
| **The protocol** | Static PDFs | PDFs that improve over time, with proposed changes reviewed before they go live |
| **After day 90** | Program ends | Improved on the bloodwork: invited back at the next tier up. Already Pro: invited back at Pro with 20 percent more intensity. Every cycle is a new 90-day clock. |

---

## Part 1: The mechanics

### Enrollment and start

Application stays. Someone applies, is accepted, pays. Their `day_zero` is set to the next 1st or 15th. If they pay on the 3rd, they start the 15th. If they pay on the 20th, they start the 1st. That gives everyone at least a week to get bloodwork done before the clock starts.

The first wave is 1 January 2027. Nobody starts before it, whenever they pay. The date is a setting in `program_settings`, not code, so it can move.

The `cohorts` table stops being a seat-capped group and becomes a **start wave**: one row per 1st and 15th, unlimited seats, created automatically. It exists so the weekly Zoom and the reporting can say "the March 1 wave" when useful. Nobody is limited by it.

### The onboarding document

The moment someone is accepted, they get a branded PDF: **Your First Steps**. It has six sections.

1. What happens next, and when your clock starts
2. The blood panel: the exact 33 markers, how to order it, which labs, what it costs, fasting and timing instructions
3. The Omega-3 Index: required, not optional. The OmegaQuant dried blood spot kit, how to order it, how to do the finger prick, and why it matters. DHA is the structural material of every membrane that receives the light signal, the retina most of all. Low DHA means the timing signal arrives at a degraded receiver. It is the most responsive marker on the panel and the most direct readout on whether the protocol is working.
4. The functional tests: grip strength, VO₂max options by budget, how to record them
5. Optional tests that add data: DunedinPACE and the six-variant genetic panel, with cost and what each one adds
6. Your tier, why you were placed there, and how to move up

This is one document per tier, generated once, updated when the panel changes. It is not written fresh per person. The coach handles the per-person part.

### The dashboard

When someone logs in they see:

- **Day N of 90**, large, with the phase name
- Their tier badge and a "ready to move up?" link
- Today's morning brief
- The log button
- The next Zoom call, with the link, and the archive of past ones
- Their documents

Everything else is a tab.

### The weekly Zoom

One hour, same day and time every week, everyone welcome regardless of where they are in their 90 days. The link and schedule live in the portal. Recordings are posted after, so someone at day 4 can watch last month's. Questions can be submitted in advance through the portal so you have them before the call.

### Placement at intake

The application form asks the seven placement questions from the protocol (training, cold, sauna, fasting, food, morning light, sleep), each with four answers matching the four tiers. Four or more answers in one column places the person there. Mixed results place them in the lower of the two closest tiers, because it is easier to move up than to fail. The answers live in the existing `questions` and `intake_responses` tables.

### Moving up a tier

A client can request it from their dashboard. It changes their tier, records the change in `tier_history` with the program day, and swaps which PDFs they see. The morning brief adjusts the next day. The coach adjusts immediately.

### Day 90 and the invitation back

When the day 90 panel is entered and the Battery Score is computed, the completion agent compares it to day 0 and decides the invitation.

**Improved on the bloodwork parameters.** The composite Battery Score is up, or the majority of subsystems are up. They are invited back at the next tier: Beginner to Intermediate, Intermediate to Advanced, Advanced to Pro. The invitation names what improved, marker by marker, and says what the next tier adds.

**Already Pro and improved.** They are invited back at Pro with 20 percent more intensity. Every Pro cycle after the first multiplies the numeric prescriptions by 1.2 over the previous cycle: longer zone 2 sessions, more sets, longer sauna rounds, longer and colder plunges, more interval rounds, a tighter eating window, more frequent extended fasts. Cycle two is 1.2 times cycle one. Cycle three is 1.2 times cycle two. The Pro protocol PDF is generated with the multiplier applied, so the document they receive is their document for that cycle.

**Did not improve.** They are invited back at the same tier for another 90 days, with the invitation focused on adherence and what the log showed was missed. This is not framed as failure. The most common reason a Battery Score does not move is that the protocol was not followed, and a second cycle with better adherence is the right next step.

**Mechanics.** Each 90-day cycle is its own `memberships` row, so a person's history is a chain of memberships with `cycle` 1, 2, 3 and so on. `intensity_multiplier` on the membership defaults to 1.0 and is set to 1.2 to the power of cycle minus one for Pro. The protocol generator reads the multiplier and scales every numeric prescription marked as scalable in `build.py`. Non-numeric elements, the light protocol, the food list, the supplement stack, do not scale. Safety limits cap the scaling: sauna rounds never exceed 25 minutes, cold never exceeds 10 minutes or goes below 38°F, and no more than one extended fast per week regardless of cycle.

**Price on return** is a decision you make, not the system. The invitation reads the return price from a setting, so alumni pricing can be set without a code change.

**Testing on return.** A new cycle starts with a new day 0 panel. The previous day 90 panel can serve as the new day 0 if it is less than 30 days old, so a person who continues immediately does not pay for a redundant draw.

---

## Part 2: The knowledge corpus

Everything the coach and the agents reason from lives in one place, and it is the research you have assembled.

### What goes in

- The Foundational Model, canonical
- The Working Model and all four Addenda
- The Integration Architecture with its three evidence tiers
- The Panel and Battery Score specification
- Charge Redefined
- The Protocol Complete and all four tier documents
- The Dietary Guidelines
- The Genetic Platform Strategy
- For every paper cited: its metadata, its DOI, and **your own summary of what
  it found and why it is in the protocol**, written by you

### The rule about what does NOT go in

**The corpus holds material this project wrote. Third-party published work is
never loaded as full text, and no abstract is loaded verbatim.** Not now, and
not later without counsel, per publisher.

This is a rule, not a phase note, because the tempting version of the mistake
arrives quietly: one PDF, dropped into the loader, six months from now, by
someone who reasonably thinks a corpus of papers is what a research program
should have. It is not an engineering call. Loading copyrighted papers into a
retrieval database that answers clients inside a paid product is republication
of that work inside a commercial product, and the coach quoting a passage back
to a client is the act that makes it visible.

What this costs is less than it sounds. The coach does not need Lane's prose to
explain chemiosmosis; it needs **your** explanation of chemiosmosis, with
Mitchell 1961 cited beside it, which is what a client should be reading anyway.
The summary is the thing with your judgement in it. The paper is the receipt.

So the loader takes `docs/`, `program-docs/`, and the summaries in
`public/data/citations.json`. If a passage cannot be traced to something this
project wrote, it does not belong in the corpus.

### How it is stored

Each document is split into passages. Each passage gets an embedding and is stored in Supabase with pgvector, tagged with source, evidence tier (established, contested, working model), and which of the four subsystems it bears on.

When the coach or an agent needs to answer something, it retrieves the most relevant passages and reasons from them. That is what "programmed with all of the information" means in practice: it does not memorize, it looks up, and it cites.

### The one rule

Every passage carries its evidence tier. When the coach says something, it knows whether it is standing on established science, a contested finding, or the working model, and it can say so. The whole credibility of the program rides on that distinction surviving inside the AI.

---

## Part 3: The six agents

### 1. The onboarding agent

Runs once, on acceptance. Assigns the tier from the intake rubric, generates the welcome email, attaches the right First Steps PDF, sets `day_zero` to the next wave date, and creates the client's first morning brief so there is something waiting when they log in.

### 2. The analysis agent

Runs every time new data lands: a lab panel, a functional test, a genetic result, an Omega-3 Index. It reads the new data alongside everything else on file for that person, and it writes an **insight**: what the data shows in Human Battery terms, which subsystem it bears on, which protocol elements are most relevant, and what it does not know.

It does not diagnose. It does not interpret a marker as evidence of a condition. Every out-of-range marker gets a line saying it has been referred to a physician, and that line is not optional. What it does is relate the number to the four subsystems and to the protocol, which is coaching, and it stays on that side of the line.

Insights are stored, shown to the client in plain language, and fed into the coach's context so the coach can talk about them.

### 3. The morning brief agent

Runs at 8am in each client's time zone, every day of the 90.

It writes one short piece, 150 to 250 words, for that person, on that day. It knows their tier, their program day, what they did and did not log yesterday, their most recent insight, and what phase they are in. It picks one thing from the corpus that is relevant to where they are, explains it at their tier's reading level, and connects it to something they can do today.

- **Beginner:** third grade. One idea. One thing to do. "Your body has a clock inside it. The clock is set by the sun. You missed the sun yesterday. Today, go outside first."
- **Intermediate:** fourth grade. One idea with one reason.
- **Advanced:** fifth grade. One idea, the mechanism, and the evidence tier.
- **Pro:** sixth to seventh grade. The mechanism, the evidence tier, the paper, and the open question.

**The reading grade is measured before the brief is written, never after.**
The agent generates, scores the result against the tier's target, and if it is
above target regenerates **once**. It then writes whichever of the two attempts
is closer to target and records **both** grades on the row, so a tier drifting
upward is visible in the data rather than inferred from complaints. A brief
above target is never silently accepted.

Once is deliberate. An unbounded retry loop against a fuzzy target burns tokens
and eventually ships whatever the last attempt produced; two attempts and an
honest record of both is the version that stays cheap and stays truthful.

This matters because of volume. One brief a grade above target is nothing.
Ninety of them, unreviewed, is a tier quietly rewritten at the wrong reading
level for the person least able to say so. The four onboarding runs on
2026-09-21 produced Beginner briefs at grades 4.1, 3.6, 3.6 and 4.0 against a
third-grade target, which is the drift this rule exists to catch.

Briefs are stored, so a client can scroll back through all 90.

**`read_at` records that the brief card rendered, not that anyone read it.** The portal home page stamps it when the card is drawn, so a client who opens the portal to log their day and never scrolls to the card is stamped exactly like one who reads every word. That behaviour is deliberate and stays. The warning is for whoever consumes the column: it is a proxy for "the portal was opened while this brief was newest", and nothing more. **No agent, report or protocol proposal may treat it as readership, attention or engagement**, and that applies to the trend agent in particular, which reads across every client and will reach for exactly this kind of signal. A column that measures page load, interpreted as attention, produces a confident and wrong finding about who is engaged. Real readership needs its own signal from a deliberate client action, such as expanding the card or reaching the end of the text.

### 4. The coach

The interactive one. A client asks anything, any time. It has the corpus, their protocol, their data, their insights, their briefs, and the conversation history. It answers from the corpus and says which evidence tier it is standing on.

Guardrails carry over from the earlier spec and are not softened: no diagnosis, no medication advice, refers out-of-range results, stays inside the client's tier, never promises an outcome, stops coaching and says seek care now for the red-flag symptoms, does not give eating advice to anyone describing restriction or distress about food, describes light as timing and the body as trillions of coordinated batteries, says "I don't know" rather than inventing.

### 5. The completion agent

Runs when a day 90 Battery Score is computed. Compares it to day 0, decides the invitation per the rules above, writes the `completion_invitations` row, generates the invitation email naming what improved, and shows a Day 90 screen in the portal with the before-and-after and the offer. Accepting creates the next membership with the next tier or the raised multiplier, and a new day zero at the next wave.

### 6. The trend agent

Runs weekly. Reads everything across everyone: tiers, adherence by domain, which practices are being missed, day 0 and day 90 deltas for anyone who has finished, insights, coach conversations for recurring questions.

It writes a **weekly findings report** for you: what is working, what is being skipped, which marker moved most, which tier is struggling with what, what people keep asking the coach. And it writes **protocol proposals**: specific suggested changes to a tier document, with the data behind the suggestion.

**Proposals do not go live on their own.** Each one lands in an admin queue. You read it, you approve it or reject it, and only an approved proposal regenerates the PDF and notifies the clients on that tier. The agent proposes, you decide. That gate is the single most important design decision in this whole document, because an agent silently rewriting the protocol that real people are following is a liability nobody should carry, and because your judgment on the protocol is the product.

The trend agent also does prediction, but honestly: at 25 people it is describing, at 250 it is starting to see patterns, at 2,500 it can predict. It says which of those it is doing in every report.

---

## Part 4: Schema changes

Four migrations, described here by name. They are numbered in the order they are actually written, starting at 018, because the coach migration from the earlier prompt also needs a number and phases do not run in schema order. Never reuse a number. All join to what exists.

**open_enrollment**
- `cohorts.seats` becomes nullable, cohorts become start waves, a function generates them for the 1st and 15th
- `memberships.cycle` integer default 1, `memberships.intensity_multiplier` numeric default 1.0, `memberships.previous_membership_id` linking cycles into a chain
- `completion_invitations`: id, client_id, from_membership_id, offered_tier, offered_multiplier, improved boolean, score_delta, markers_improved text[], sent_at, accepted_at, declined_at
- `program_settings`: key, value, for the first wave date, the return price, the weekly call schedule and Zoom link, the coach's daily limit, and similar
- `memberships.day_zero` set from the next wave on payment
- `weekly_calls`: id, scheduled_at, zoom_url, recording_url, topic, questions_open
- `call_questions`: id, client_id, call_id, question, submitted_at, answered

**knowledge**
- Enable pgvector
- `knowledge_sources`: id, title, authors, year, source_type, evidence_tier, url, added_at
- `knowledge_passages`: id, source_id, passage, embedding vector(n) where n is the embedding model's output size, subsystems text[], evidence_tier, sort_order
- An index on the embedding for similarity search

**agents** (the coach tables may arrive earlier in their own migration, when the coach is built)
- `client_insights`: id, client_id, trigger (lab, functional, genetic, omega3), content, subsystems, created_at, shown_at
- `morning_briefs`: id, client_id, program_day, brief_date, tier, content, reading_grade (the brief that was written), reading_grade_first (the first attempt, equal to reading_grade when no retry was needed), read_at (card rendered, not read: see above)
- `coach_conversations` and `coach_messages` as previously specified
- `agent_runs`: id, agent, started_at, finished_at, status, tokens, error, for observability

**learning**
- `weekly_findings`: id, week_of, report, n_clients, n_completed, generated_at
- `protocol_proposals`: id, tier, section, current_text, proposed_text, rationale, evidence, status (pending, approved, rejected), proposed_at, decided_at, decided_by
- `protocol_versions`: id, tier, version, published_at, changelog, pdf_path, so every client can be told exactly which version they started on

---

## Part 5: Infrastructure

**Scheduled jobs.** Cloudflare only runs cron on Workers, not on Pages, so
there is a Worker. It is a **thin scheduler and nothing else.**

The Worker wakes on its cron, POSTs to a Pages Function with the shared secret
in an `x-hbp-secret` header, and stops. It does no querying, no retrieval, no
generation and no writing. The Pages Function on the other end does all of
that, using the secrets already set on Pages.

- morning brief, hourly  ->  `POST /api/brief-run`
- trend agent, weekly    ->  `POST /api/trend-run`
- wave generator, monthly ->  `POST /api/wave-run`

**The Worker holds exactly one secret: the shared one.** Never
`ANTHROPIC_API_KEY`, never `SUPABASE_SERVICE_KEY`, never the database URL. Not
"not yet" - never. If a scheduled job appears to need a second secret in the
Worker, the work is on the wrong side of the call.

The reason is that Workers do not see Pages variables; they hold their own
copies. A second secret store is a second thing to rotate and a second thing to
forget, and the forgetting is silent: the key that was not rotated keeps working
until it is revoked, and then a job fails on a schedule nobody is watching. The
same shape as rule 8c in `CLAUDE.md`, where going live on Stripe means swapping
two secrets and swapping one leaves a paid client with no membership. One secret
in one place cannot drift out of step with itself.

This is not a new pattern here. `stripe-webhook.js` already calls `/api/onboard`
over HTTP with `x-hbp-secret` rather than importing it, so the agent has one
entry point and one auth check whichever side calls it. The scheduler is that
pattern with a clock in front of it, and `hasServiceSecret()` in `_agent.js` is
already the check on the receiving end.

What this costs: the Worker still needs its own `wrangler.toml` and its own
deploy step, so pushing to the repo will no longer be enough to ship
everything. That is real, and it is the price of cron. It is much smaller than
a second copy of every credential.

**Event-driven jobs** run as Supabase database webhooks: a new row in `lab_panels`, `functional_tests` or `genotypes` fires the analysis agent. A new accepted application fires the onboarding agent. A new payment sets `day_zero`.

**Generation** is the Anthropic API from server-side code only. `claude-sonnet-5` writes everything a client reads per person: briefs, insights, coach replies, invitations. `claude-opus-5` runs the weekly trend agent. The key never touches the browser. Workers hold their own copies of the secrets; they do not see the Pages variables.

**Retrieval** is pgvector in Supabase. Embeddings come from Voyage AI (Anthropic has no embeddings endpoint), generated once per passage when the corpus is loaded and once per query at retrieval time. The key is `VOYAGE_API_KEY`.

**Time zones.** The 8am brief uses `profiles.timezone`, which already exists and defaults to America/Chicago. The account page lets a client change it.

**Webhook security.** Every database webhook sends a shared secret in a header. The receiving function refuses anything without it. The secret lives in Supabase Vault and in Cloudflare, never in a migration file.

**The admin console** gets three new screens: the proposal queue with approve and reject, the weekly findings archive, and an agent run log so you can see what ran, when, and whether it failed.

The weekly view also carries **the reading-grade distribution per tier**, both the written grade and the first-attempt grade. Drift is a trend, not an incident: no single brief looks wrong, and the shape of a few hundred does. Seeing it weekly is the difference between correcting a prompt in week two and discovering at day 90 that Beginner has been running at fifth grade.

---

## Part 6: Cost, roughly

At 100 active clients:

- Morning briefs: 100 a day at roughly 600 tokens in and 300 out on Sonnet, well under $5 a day
- Coach: depends on use, 20 messages per client per day capped, realistically a few dollars a day
- Analysis agent: fires only on new data, negligible
- Trend agent: one large weekly run, a few dollars
- Embeddings: one-time corpus load, then per-query, negligible

Call it $200 to $400 a month at 100 clients, scaling roughly linearly. At $1,000 per client that is a rounding error.

Supabase Pro at $25 a month, mandatory now, because pgvector and database webhooks both want it and because the pause behavior would break the morning briefs.

---

## Part 7: Build order

| Phase | What | Unblocks |
|---|---|---|
| **1** | Open enrollment: waves, individual clocks, the dashboard rebuild, the weekly Zoom screen | Enrolling anyone, any time |
| **2** | The First Steps PDFs, four of them, and the onboarding agent | Acceptance to day zero with no manual work |
| **3** | `create extension vector`, the knowledge migration, the loader over HBP-authored material, then the per-passage evidence-tier tagging | Everything the AI does |
| **4** | The coach | Clients get answers |
| **5** | The thin cron Worker, then the brief logic in `/api/brief-run`, with clock tests that fake the time rather than waiting a day | Daily contact |
| **6** | The analysis agent | Labs become coaching |
| **7** | The trend agent and the proposal queue | The system starts learning |
| **8** | The completion agent, cycle chaining, and the intensity multiplier in the generator | People keep going |

Phases 1 and 2 are the launch. Phases 3 through 5 are what makes it feel like software rather than a PDF library. Phases 6, 7 and 8 are the platform.

---

## Part 8: What does not change

- Every guardrail from the earlier coach spec
- The four subsystems and the Battery Score
- The evidence tiers, and the rule that working-model claims never reach marketing copy
- Structured logging
- Row-level security on every table, including all the new ones
- The application gate before payment
- No commissions
- The line: we measure at both ends and show you exactly what changed

---

## The sentence

**Anyone can start on the 1st or the 15th. Every morning at 8, the system writes to them. Every week, you talk to all of them at once. Every lab result becomes coaching. Every ninety days, the ones who improved are invited to go harder, the protocol gets better, and you are the one who decides how.**
