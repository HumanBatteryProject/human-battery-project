# CLAUDE.md

Project context for Claude Code. Read this before doing anything in this repo.

---

## What this is

The Human Battery Project. A 90-day measured health program built on one idea: health depends on the body's ability to create, maintain and coordinate electrical gradients across cellular membranes. The body is not one battery. It is trillions of coordinated cellular batteries.

People get bloodwork at day 0 and day 90, plus VO₂max, grip strength and a required Omega-3 Index. In between they follow a protocol organized around one daily sequence, Light → Water → Movement → Food → Movement → Light → Darkness, and log every day. The daily log is structured so it can support longitudinal research.

**Open enrollment.** Anyone can start on the 1st or 15th of any month. The first start wave is 1 January 2027, held in `program_settings`. Each person runs their own 90-day clock. One weekly one-hour Zoom is open to everyone. There are no cohorts and no individual coaching calls.

**Four tiers** by how the person already lives: Pro, Advanced, Intermediate, Beginner. Placement uses the seven-row table in `docs/HBP-Protocol-Complete.md`. Each tier has its own protocol PDF. A client can move up. After 90 days, someone who improved is invited back at the next tier, or at Pro with 20 percent more intensity.

**Five agents** run the platform: onboarding, analysis, morning brief, the coach, and the trend agent, plus the completion agent. All reason from a knowledge corpus with evidence tiers. See `docs/HBP-Platform-v2-Spec.md`.

**The person directing this work is not a programmer.** Explain what you are about to do in plain language before doing it. When something breaks, say what broke and what you will try. No stack traces unless asked. Never ask him to paste a secret into the chat; ask him to put it in `.dev.vars` or Cloudflare.

---

## The canonical documents, in order of authority

1. `docs/HBP-Foundational-Model.md`: what the program is built on. Where anything conflicts with it, it wins.
2. `docs/HBP-Platform-v2-Spec.md`: how the platform works: enrollment, agents, schema, build order.
3. `docs/HBP-Protocol-Complete.md`: the four-tier protocol in full, including placement.
4. `docs/HBP-Integration-Architecture.md`: the three evidence tiers and what may be claimed where.
5. `docs/HBP-Panel-and-Battery-Score.md`: the markers and the scoring method.

---

## Stack

- Static HTML and CSS. No framework, no build step, no bundler. Do not introduce React, Next.js, Tailwind or a build pipeline.
- Cloudflare Pages serves `public/`. Cloudflare Pages Functions in `functions/` run server-side. Cloudflare Workers with cron triggers run the scheduled agents, with their own secrets.
- Supabase on the Pro plan holds all data, with pgvector for the knowledge corpus and database webhooks for event-driven agents. The portal talks to it directly from the browser with the publishable key. Migrations are applied with `psql` and `SUPABASE_DB_URL` from `.dev.vars`.
- Supabase uses the new key types: `sb_publishable_` in the browser, `sb_secret_` server-side as `SUPABASE_SERVICE_KEY`. The legacy JWT anon and service_role keys are retired. Never reintroduce them.
- Anthropic API for every agent, from server-side code only: `claude-sonnet-5` for anything written per client, `claude-opus-5` for the weekly trend agent. Voyage AI for embeddings. Stripe for payments. Resend for email.
- Fonts self-hosted in `public/fonts/`: Michroma for display, Newsreader for body.
- PDFs: Python 3.12 and weasyprint 70 from Homebrew, in a venv outside the repo. Generators in `program-docs/` resolve paths from their own location.

---

## Rules that must not be broken

**1. The Supabase secret key, the Anthropic key and the Voyage key never enter `public/`.** Everything under `public/` is served to the browser. The publishable key in `public/portal/config.js` is correct and safe. Row-level security protects the data.

**2. Migrations are append-only.** Never edit a `.sql` file that has been run against production. Write a new numbered file at the next free number. 001 through 017 have run.

**3. Never change the Battery Score method mid-program.** `score_methods` rows are versioned. Publish a new version rather than editing one.

**4. Structured logging, never free text.** Every food and exercise entry points at a reference row by ID. One optional note field exists. Nothing else is free text.

**5. Backfill stops at yesterday.** Enforced in `public/portal/app.js`.

**6. Evidence tiers are load-bearing.** Content is tagged `established`, `contested` or `working_model`. Working-model claims never appear in marketing copy, a consent form, or a results write-up. The coach and every agent state which tier they are standing on.

**7. No health claims.** No outcome promises, no disease claims, nothing implying medication is unnecessary.

**8. Light is timing information.** `docs/HBP-Foundational-Model.md` is canonical. Never describe light as charging the body, as energy absorbed, or as a solar panel. Morning light tells the body what time it is. That is the claim. The body is trillions of coordinated batteries, never one battery with a single charge. Tissue-appropriate voltage, never maximum voltage.

**9. Never recommend manipulating potassium or other electrolytes to hyperpolarize the body.** Balance and correction of genuine deficiency only.

**10. Protocol changes proposed by the trend agent are never applied automatically.** They land in the admin queue. A human approves. Only then does a PDF regenerate.

**11. Every function and agent verifies the Supabase JWT.** Never trust a user id from a request body. Every database webhook carries a shared secret header, kept in Supabase Vault and Cloudflare, never in a migration or the repo.

**12. No em dashes** in anything a client reads.

**13. Test rows are deleted** before a phase is called done, and the deletion is stated.

---

## The coach and agent guardrails

Every agent that produces text a client will read:

- Never diagnoses, never interprets a lab marker as evidence of a condition, never advises on medication
- Reminds the client that any out-of-range result has been referred to a physician
- Stays inside the client's tier
- Never promises an outcome
- Stops and says seek care now for chest pain, fainting, shortness of breath at rest, BP over 160/100, glucose over 200, or any new neurological symptom
- Does not give eating advice to anyone describing restriction or distress about food
- Says "I don't know" rather than inventing
- States the evidence tier it is standing on
- Points to the weekly call or `admin@thehumanbatteryproject.com` when it cannot answer

---

## Design decisions to preserve

- Adherence is a percentage, never a streak.
- Off-protocol food is logged, not hidden.
- Rest day is a first-class answer.
- The log autosaves. No Save button. Under 60 seconds.
- The Battery Score scores against a program-optimal band, not the lab reference range.
- Missing markers are excluded from the score, never imputed.
- The Omega-3 Index is required at day 0 and day 90 for every tier.
- Day 90 panels can serve as the next cycle's day 0 if within 30 days.
- Intensity scaling has hard caps: sauna 25 minutes, cold 10 minutes and never below 38°F, one extended fast per week.
- Prices, the return price, the first wave date, the Zoom link and schedule, and the coach's daily limit live in `program_settings`, never in code.

---

## Layout

```
public/              served to the browser
  index.html         marketing page
  simple.html        plain-language version, ~grade 3
  fonts/             Michroma, Newsreader
  portal/            client portal, its own README; admin/ for staff screens
functions/api/       server-side: waitlist, checkout, webhooks, onboard, coach, analyze, complete
workers/             scheduled agents with cron triggers: morning-brief, trend
database/migrations/ 001 onward, run in order, once
program-docs/        the PDFs and their generators
  build.py           data and entry point
  design.py          shared CSS and illustrations, brand palette only
  tier_doc.py        the four tier protocols
  diet_doc.py        dietary guidelines
  tests_doc.py       Your Tests, Explained
  first_steps_doc.py Your First Steps, one per tier
  tier/, shared/     the committed PDFs, mirrored in the program-docs bucket
scripts/             load_corpus.py and other one-off tools
corpus/              research sources for the knowledge base, with manifest.yaml
brand/               v4 logo system
docs/                the model, the spec, the protocol, the strategy
```

---

## Verify before claiming something works

- SQL: run it. If Postgres is unavailable, say so.
- JavaScript: `node --check`.
- HTML: confirm tags close.
- PDFs: regenerate and open, check page count and that nothing orphaned onto its own page. Identical extracted text is the reproducibility test, not identical bytes.
- Reading level: `simple.html` at roughly grade 3, Beginner content at grade 3 to 4, measured with textstat.
- Portal queries returning empty are almost always RLS, not the JavaScript.
- An agent's output is checked against the guardrails above before it is shown as done.

---

## Secrets and where they live

- `.dev.vars`, gitignored: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFY_EMAIL`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `WEBHOOK_SECRET`
- Cloudflare Pages environment variables: the same names. A change needs a redeploy.
- Cloudflare Worker secrets: set per Worker with `wrangler secret put`. Workers do not see the Pages variables.
- `public/portal/config.js`: the Supabase URL and the publishable key only.

---

## Build order

`PROMPT-foundational-model-and-coach.md` Job 1 first, to Checkpoint 1. Then `PROMPT-platform-v2.md`, eight phases with checkpoints. Phases 1 and 2 are the launch. Do not skip checkpoints.
