# CLAUDE.md

Project context for Claude Code. Read this before doing anything in this repo.

---

## What this is

The Human Battery Project. A 90-day measured health program built on one idea: health depends on the body's ability to create, maintain and coordinate electrical gradients across cellular membranes. The body is not one battery. It is trillions of coordinated cellular batteries.

People get bloodwork at day 0 and day 90, plus VO₂max, grip strength and a required Omega-3 Index. In between they follow a protocol organized around one daily sequence, Light → Water → Movement → Food → Movement → Light → Darkness, and log every day. The daily log is structured so it can support longitudinal research.

**Open enrollment.** Anyone can start on the 1st or 15th of any month. The first start wave is 1 January 2027, held in `program_settings`. Each person runs their own 90-day clock. One weekly one-hour Zoom is open to everyone. There are no cohorts and no individual coaching calls.

**Four tiers** by how the person already lives: Pro, Advanced, Intermediate, Beginner. Placement uses the seven-row table in `docs/HBP-Protocol-Complete.md`. Each tier has its own protocol PDF. A client can move up. After 90 days, someone who improved is invited back at the next tier, or at Pro with 20 percent more intensity.

**Six agents** run the platform: onboarding, analysis, morning brief, the coach, completion, and trend. All reason from a knowledge corpus with evidence tiers. See `docs/HBP-Platform-v2-Spec.md`.

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

**2. Migrations are append-only.** Never edit a `.sql` file that has been run against production. Write a new numbered file at the next free number. 001 through 027 have run.

**3. Never change the Battery Score method mid-program.** `score_methods` rows are versioned. Publish a new version rather than editing one.

**4. Structured logging, never free text.** Every food and exercise entry points at a reference row by ID. One optional note field exists. Nothing else is free text.

**5. Backfill stops at yesterday.** Enforced in `public/portal/app.js`.

**6. Evidence tiers are load-bearing.** Content is tagged `established`, `contested` or `working_model`. Working-model claims never appear in marketing copy, a consent form, or a results write-up. The coach and every agent state which tier they are standing on.

**7. No health claims.** No outcome promises, no disease claims, nothing implying medication is unnecessary.

**8. Light is timing information.** `docs/HBP-Foundational-Model.md` is canonical. Never describe light as charging the body, as energy absorbed, or as a solar panel. Morning light tells the body what time it is. That is the claim. The body is trillions of coordinated batteries, never one battery with a single charge. Tissue-appropriate voltage, never maximum voltage.

**8b. The Omega-3 kit gate is posting, not the result.** The dried blood spot fixes the sample at collection, so a result that arrives in week two is still a day 0 number. What has to be true before day 1 is that the drop is on the card and the card is in the mail. This is why `minimum_lead_days` is 14 and not 28, and it must not drift back. The Omega-3 Index is the most responsive marker on the panel, so a client who has not posted by day 1 is offered a move to the next wave rather than starting without a baseline, because that comparison cannot be recovered later.

**8c. Going live on Stripe means swapping TWO secrets, not one.** Test mode and
live mode are separate endpoints with separate signing secrets. Swapping
`STRIPE_SECRET_KEY` to the live key without also swapping
`STRIPE_WEBHOOK_SECRET` to the live endpoint's secret fails silently in the
worst possible way: the payment succeeds at Stripe, the webhook fails
signature verification with a 500, Stripe retries and every retry fails, and
no membership and no onboarding is created for someone who has paid. The money
arrives and the program does not start. Verify a live test charge creates a
`memberships` row before the first real client pays. Payments are parked until
HBP is incorporated and Stripe is set up under the new entity; both variables
are the literal placeholders `sk_test_` and `whsec_` until then, and
`checkout.js` and `stripe-webhook.js` are not to be edited meanwhile.

**9. Never recommend manipulating potassium or other electrolytes to hyperpolarize the body.** Balance and correction of genuine deficiency only.

**10. Protocol changes proposed by the trend agent are never applied automatically.** They land in the admin queue. A human approves. Only then does a PDF regenerate.

**11. Every function and agent verifies the Supabase JWT.** Never trust a user id from a request body. Every database webhook carries a shared secret header, kept in Supabase Vault and Cloudflare, never in a migration or the repo.

**12. No em dashes** in anything a client reads, and that includes every source in `corpus/`. A corpus document stops being internal the moment the loader runs: the coach retrieves from it and writes in its voice, so an em dash heavy source produces an em dash heavy coach, and that is almost impossible to trace back afterwards. Corpus sources follow the client-facing style rules because they become the agents' voice. Check every file before the loader runs, not after.

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
  index.html         the front door, plain-language version, ~grade 3, served at /
  science.html       the longer version, served at /science
  _redirects         /simple and /simple.html 301 to /, permanently
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
- Reading level: `index.html`, the front door, at roughly grade 3, Beginner content at grade 3 to 4, measured with textstat.
- Portal queries returning empty are almost always RLS, not the JavaScript.
- CSS cache version: bump with `./scripts/bump_css_version.sh styles` or `... portal`, never by hand. It picks one above the highest value ever used in history. Hand-edited seds have twice set it wrong, once lower than it already was and once to a value it already had, and reusing an old number serves a cached old stylesheet against new markup.
- An agent's output is checked against the guardrails above before it is shown as done.
- Foundational-model audit: match any **sentence** that gives **light, sun, earth or water** a
  property the model does not carry. For light and sun that is charge, energy, power, fuel or
  battery. For earth it is electrons, charge, current, voltage, free radicals or antioxidants.
  For water it is structured, hexagonal, coherent, exclusion zone, EZ or fourth phase.
  Never a keyword grep, and never a search that names only the noun. Three misses, each the
  same shape: a grep for `charging` and `solar panel` passed documents that said "Afternoon
  sun charges the battery"; an audit scoped to light and sun missed "The earth carries a
  natural electric charge"; a pattern for `structured water` missed "Water is the medium.
  Structured, mineralized, and adequate" because the two words were in different sentences.
  Match the **claim shape**, not the vocabulary, and run it over the whole repo.
  When a sentence trips the pattern but is innocent, **reword the sentence, do not
  whitelist the phrase**. "It is the battery light, and you get to watch your number
  move" on the front door matched on light and battery in one sentence, meaning the
  warning lamp on a phone and nothing about light supplying energy. It is now "the
  warning light". A keyword exception would have been the easier fix and would have
  put a hole in the audit that every later pass inherits. There are no exceptions to
  this audit, only sentences that no longer need one.

  The audit also flags **negations**, and a negation is the model being stated
  correctly, not broken. "Light does not deliver energy into you" and "the
  protocol treats light as timing information rather than as an energy input"
  both match on light plus energy in one sentence. They are the claim the model
  wants on the page. Judge what the sentence **asserts**, not which words it
  contains: a sentence that denies the forbidden claim is the opposite claim
  shape. This is not a keyword exception and must not become one. Read the
  sentence.

  **The near-infrared paragraph on /science is settled and stands.** Widen the
  light property list past the banned nouns to the energy machinery itself
  (`mitochondria`, `ATP`, `respiratory chain`, `cytochrome`) and this sentence
  matches:

  > Red and near-infrared light come up often here, so it is worth saying where
  > they sit. In the laboratory those wavelengths interact with cytochrome c
  > oxidase in the respiratory chain, and studies report changes in mitochondrial
  > enzyme activity under narrow conditions of wavelength, dose and distance.
  > That work is contested, most of it is cell culture or device work rather
  > than sunlight, and it is not part of this program. Nothing on your panel
  > measures it. It is named here because it is the honest edge of the timing
  > claim, not because it is something you will be doing.

  It matches deliberately and it is not a violation. The banned claim is *light
  delivers energy into you*. This says a wavelength interacts with an enzyme
  under narrow laboratory conditions, and the very next sentence withdraws it
  from the program and from the panel. A mechanism named with its limits is not
  a promise. Cited to Wong-Riley 2005, tier contested, claim id
  `science-science-08`, `/science` only and never the front door.

  Two notes for whoever runs this next. The phrase was `mitochondrial output`
  and is now `mitochondrial enzyme activity`: `Output` is the name of one of the
  four subsystems on that same page, so the original could be read as a claim
  about a client's Output score, and enzyme activity is what the paper measured
  anyway. And a widened run flags two `lightning` sentences on both pages as
  false positives, because `lightning` contains `light` as a substring. Bound
  the subject pattern on word edges.
- Verifying a DOI or a reference: **a failed request is not evidence a reference
  is dead, and one source's metadata is not authoritative.** Retry a failed
  lookup at least three times, then check it a second way before recording it as
  unresolvable. `10.1111/joim.12496` failed three consecutive Crossref lookups
  while resolving perfectly at doi.org, and a naive check would have dropped a
  real paper. This applies to the corpus loader in Phase 3, which does the same
  lookups.

  **For anything indexed in PubMed, PubMed is the primary metadata source and
  Crossref only confirms it.** Take title, author list, journal and year from
  PubMed. Use Crossref to check that the DOI resolves and that the record is the
  same paper, not to supply the fields. Where the two disagree, PubMed wins
  unless there is a specific reason it is wrong, and that reason goes in the
  report. For a work Crossref indexes and PubMed does not (a book chapter, a
  physics or chemistry paper, a preprint), Crossref is the source and the lack
  of a PubMed record is stated.

  This is not a preference, it is two corruptions, and both times the part
  Crossref lost was the part that mattered:

  - **Kodama 2009.** Crossref returns **one** author. PubMed returns **twelve**.
    The twelve is right. Recording Crossref's would have credited a twelve-author
    pooled analysis to a single name.
  - **Wong-Riley 2005.** Crossref truncates the title at the colon and drops
    `: role of cytochrome c oxidase`. PubMed carries it whole. The dropped
    fragment is the entire reason the citation is on the page, so Crossref's
    title would have hidden what the source was cited for.
- `study_type` in `citations.json`: **PubMed's PublicationType is the source when
  it names a design.** Randomised Controlled Trial, Observational Study,
  Meta-Analysis, Review and the rest map straight onto the enum and are not a
  judgement call. But PublicationType is a bibliographic tag, not a design
  field, and it often carries nothing but `Journal Article` plus Research
  Support funding tags. **When it names no design, read the methods, pick the
  enum value the design actually fits, and say in the report that
  PublicationType did not supply it.** Never record a guess as though the index
  gave it to you, and never stretch `Journal Article` into a design.

  The worked example is **Wong-Riley 2005** (`10.1074/jbc.M409650200`), whose
  PublicationType is `Journal Article` plus three Research Support tags and
  names no design at all. The methods are primary cultured neurons, so the
  value is `cell`, and the report said in as many words that PublicationType
  could not supply it.

- **The repo and the live database are the only sources of truth about the repo
  and the database.** A file outside this working tree is never evidence of
  current state, however similar its name, however plausibly it is a copy of
  something here. Read it to understand intent if someone hands it to you; never
  cite it as what is. The same goes for a second clone: it answers `git` commands
  confidently and is still not this repo.

  Worked example: the agent inventory reported that the coach migration
  `018_coach.sql` collided with the applied `018_open_enrollment.sql`. It did
  not. The repo's `PROMPT-foundational-model-and-coach.md` already read "A
  migration at the next free number, named `coach` (the number 018 is taken by
  open enrollment)". The collision existed only in
  `~/Downloads/human-battery-delta-files/`, a two-week-old drop outside the
  working tree, and that stale copy was reported as current state. Known stale
  copies as of 2026-09-21: `~/Downloads/human-battery-delta-files/`,
  `~/Downloads/human-battery-project-2/` (a full clone, `main` at `a5fe0a1`, 15
  migrations against this repo's 28), `~/Downloads/program-docs-redesigned/`,
  and `~/Downloads/human-battery-v2-package.zip`.

  Before reporting the state of a file, run `git ls-files` or read it by a path
  under the working tree. Before reporting the state of a table, query the
  database.

- **A check that cannot find the thing is not evidence the thing is absent.**
  Before reporting a zero result, confirm the query is capable of returning a
  non-zero one. Run it against a case you know is present, or widen it until it
  finds something, then narrow back. Two worked examples, both from the same
  night:
  - The claim cross-check reported "14 declared, 14 in markup" from a run made
    *before* the last edit. The real state at commit was 14/13. (`d265b8a`,
    fixed in `68036f6`)
  - A schema-wide scan for an email address reported "no matches anywhere"
    because it filtered on `data_type`, and `citext` reports as `USER-DEFINED`.
    It skipped the one column that held the value. Filter on `udt_name`.
  In both cases the reassuring answer came from a query that could not have
  produced any other answer. Prove the negative before stating it.

- **Any number in a report that was not produced by a command run after the last
  edit is not a verified number.** Do not state it as one. Re-run the check as
  the last thing before committing, and paste what it printed rather than
  retyping it from earlier in the session.

  The worked example: the claim id cross-check was reported as "14 declared, 14
  in markup, none missing either way" in commit `d265b8a`. That had been true
  when it ran. Afterwards the citation drawers were regenerated from
  `citations.json`, which removed a `data-claim` attribute, and the check was
  never re-run. The tree at commit was 14 declared and **13** in the markup,
  with a citation pointing at a claim id that was not on the page. Fixed in
  `68036f6`.

  Two habits follow. Run `scripts/check_claims.py` last, after the final edit,
  every time. And after any edit to `public/data/citations.json`, run
  `scripts/build_drawer.py` first, because the drawer is derived data and
  editing the source without rebuilding leaves the page showing the old text.

---

## Secrets and where they live

- `.dev.vars`, gitignored: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `FROM_EMAIL`, `NOTIFY_EMAIL`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `WEBHOOK_SECRET`
- Cloudflare Pages environment variables: the same names. A change needs a redeploy.
- Cloudflare Worker secrets: set per Worker with `wrangler secret put`. Workers do not see the Pages variables.
- `public/portal/config.js`: the Supabase URL and the publishable key only.

---

## Build order

`PROMPT-foundational-model-and-coach.md` Job 1 first, to Checkpoint 1. Then `PROMPT-platform-v2.md`, eight phases with checkpoints. Phases 1 and 2 are the launch. Do not skip checkpoints.
