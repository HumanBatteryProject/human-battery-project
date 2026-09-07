# CLAUDE.md

Project context for Claude Code. Read this before doing anything in this repo.

---

## What this is

The Human Battery Project — a 90-day measured health program. Participants get bloodwork at day 0 and day 90, follow a protocol, and log daily in a portal. The logged data is structured so it can support longitudinal research years later.

Cohorts are 25–30 people, one shared start date, $1,000. A new cohort every 90 days. Participants pay for their own lab work, food and supplements.

**The person directing this work is not a programmer.** Explain what you are about to do in plain language before doing it. When something goes wrong, say what broke and what you are going to try, not a stack trace.

---

## Stack

- **Static HTML + CSS.** No framework, no build step, no bundler. Do not introduce React, Next.js, Tailwind, or a build pipeline without being asked.
- **Cloudflare Pages** serves `public/`. Cloudflare Pages Functions in `functions/` run server-side.
- **Supabase** (Postgres) holds all data. The portal talks to it directly from the browser.
- **Stripe** for payments. **Resend** for email.
- Fonts are self-hosted. Michroma for display, Newsreader for body. Both SIL Open Font License.

---

## Rules that must not be broken

**1. The service key never enters `public/`.**
Anything under `public/` is served to the browser. `SUPABASE_SERVICE_KEY` bypasses row-level security entirely and belongs only in `functions/`, read from environment variables. The **anon** key in `public/portal/config.js` is correct and safe — RLS is what protects the data.

**2. Migrations are append-only.**
Never edit a `.sql` file in `database/migrations/` that has already been run against production. Write a new numbered file. Editing an applied migration makes the repo lie about the database.

**3. Never change the Battery Score method mid-cohort.**
`score_methods` rows are versioned. Publish a new version rather than editing one. Activating a new method between someone's day 0 and day 90 invalidates their comparison, and everyone else's in that cohort.

**4. Structured logging, never free text.**
Every food and exercise entry points at a reference row by ID. There is exactly one free-text field in the whole daily log (`daily_logs.note`) and it is optional. This is the difference between a queryable dataset and a pile of sentences, and it cannot be retrofitted.

**5. Backfill stops at yesterday.**
`canLogDate()` in `public/portal/app.js` enforces it. A log written a week later is a reconstruction and it corrupts the circadian timestamps that make this program different from every other coaching program.

**6. Evidence tiers are load-bearing.**
Protocol content carries `established`, `contested`, or `working_model`. Anything tagged `working_model` shapes the design of the protocol and must never appear as a claim in marketing copy, a consent form, or a results write-up. See `docs/HBP-Integration-Architecture.md`.

**7. No health claims in marketing copy.**
Specific outcome promises, disease claims, and anything implying medication is unnecessary are out. The program measures and reports; it does not promise. "Our opinion" is not a legal shield in health marketing.

---

## Design decisions worth knowing

**Adherence is a percentage, never a streak.** A broken streak makes people quit. A 78% makes them push for 85%. Do not add streak counters.

**Off-protocol food is logged, not hidden.** Excluded foods appear in the log in copper and set `off_protocol` on the entry. A program that shames people into silence produces a record of good days only.

**Rest day is a first-class answer,** sitting alongside movement options rather than being their absence.

**The log autosaves.** There is no Save button, because a Save button is a thing people forget and a reason to lose a day of data. Taps write immediately; text debounces at 700ms. Target is under 60 seconds on a phone — if a change would slow that down, say so.

**The Battery Score scores against a program-optimal band, not the lab reference range.** A result at the edge of "normal" scores around 50. That is deliberate and it is the whole thesis.

---

## Layout

```
public/              served to the browser
  index.html         marketing page
  simple.html        plain-language version, ~grade 3 reading level
  privacy.html · consumer-health-data.html · terms.html · disclaimer.html
  styles.css         marketing styles
  portal/            client portal — its own README
functions/api/       server-side: waitlist, checkout, stripe-webhook
database/migrations/ 001–015, run in order, once
brand/               v4 logo system + guide
docs/                the model, panel spec, evidence tiers, build list
```

---

## Verify before claiming something works

Do not say a change works because it looks right.

- **SQL** — run it. Postgres is not installed by default here; if it is unavailable, say so rather than assuming the migration is fine.
- **JavaScript** — `node --check` on the file.
- **HTML** — check tags actually close.
- **Portal changes** — the most common breakage is an RLS policy rejecting a query that looks correct in the JS. If a query returns empty when it should not, check the policy before debugging the JavaScript.

---

## Two files that are placeholders on purpose

- `public/portal/config.js` — needs the real Supabase URL and anon key
- `.dev.vars` — created from `.dev.vars.example`, gitignored, holds local secrets

---

## Still to build, roughly in order

1. **Onboarding flow** — consent capture and intake questionnaire on first login. Nobody should reach the daily log before their consents are recorded. This is the next thing.
2. **Admin console** — enroll clients, enter lab results, review the roster by adherence, write coach notes. Currently all of this is done by hand in Supabase.
3. **Lab entry screen** — panels and results are inserted manually right now.
4. **Content library** — protocol, approved food list and cookbook as portal pages.
5. **Daily reminder** — email or SMS nudge.
6. **De-identified research export**, gated on `has_active_consent(client, 'research')`.

See `docs/HBP-BUILD-LIST.md` for the full backlog.
