# The Human Battery Project: database

Postgres schema for Supabase. Thirty tables, one view, fifty-six row-level security policies.

Every migration has been executed against Postgres 16 and the access rules verified with a real multi-user test, not just parsed.

---

## Running it

Supabase → SQL editor → run in order:

```
001_foundations.sql     extensions, enums, shared triggers
002_identity.sql        profiles, cohorts, pods, memberships, auth helpers
003_consent.sql         versioned consent documents + client grants
004_intake.sql          demographics, question bank, responses, measurements
005_reference.sql       foods, exercises, practices, lab markers, recipes
006_daily_log.sql       the daily log and its four child tables
007_labs_scores.sql     lab panels, results, Battery Score, delta view
008_ops.sql             applications, payments, coach notes, audit, data requests
009_rls.sql             row-level security policies
010_seed.sql            reference vocabularies (safe to re-run)
```

`010_seed.sql` is idempotent. The rest are not, run them once, on a clean project.

---

## The four decisions this schema encodes

**1. Structured logging, not free text.**
Every food and exercise entry points at a reference row by ID. `log_foods.food_id`, not `log_foods.description`. Free text exists in exactly one place, `daily_logs.note`, and it's optional. This is the difference between a dataset you can query in 2031 and a pile of sentences. It cannot be retrofitted after forty clients have logged ninety days each.

**2. Consent before collection.**
`consent_documents` stores versioned text with a SHA-256 of the exact wording shown. `client_consents` records the grant against that specific version, with IP and timestamp. Research consent is `is_required = false` and always separate. A client can decline it and still receive everything the program offers. Gate every research read on `has_active_consent(client_id, 'research')`.

**3. Labs parsed, not filed.**
`lab_panels.document_path` holds the PDF in private object storage. `lab_results` holds one row per marker with value, unit, and the reference range printed on that specific report. Markers carry LOINC codes so results stay interoperable. The `marker_deltas` view does day 0 versus day 90 per marker with direction of change.

**4. Access enforced at the database.**
RLS means a missed `WHERE` clause in a route handler produces a rejected query, not a data leak. Verified behaviour:

| Actor | Sees |
|---|---|
| Client | Own rows only. Never coach notes. |
| Coach | Own rows, plus clients in pods they lead. Nothing outside their pod. |
| Admin | Everything. |
| Service key | Bypasses RLS, used only by server-side functions. |

---

## Table reference

### Identity and structure

| Table | Purpose |
|---|---|
| `profiles` | One row per user. Extends `auth.users`. Carries role and state of residence. |
| `cohorts` | A ninety-day run. Seats, dates, price. |
| `pods` | Coach-led group inside a cohort. Exists from day one so scaling to hundreds is a data change, not a migration. |
| `memberships` | A client's enrolment. `day_zero` anchors every relative date. |

`profiles.state` exists because Washington's My Health My Data Act, Nevada SB 370 and the Texas TDPSA apply based on where the client lives, not where the business operates. Capture it at signup and apply the strictest applicable regime.

### Consent

| Table | Purpose |
|---|---|
| `consent_documents` | Versioned text + hash. Never edit in place; publish a new version. |
| `client_consents` | Grants and withdrawals. Withdrawal is recorded, not deleted. |

### Intake

| Table | Purpose |
|---|---|
| `demographics` | Stable attributes. Medications and supplements are free text by design. This is coaching, not a medical record. |
| `questions` | Question bank as data. Intake can change between cohorts without a migration, and old answers stay interpretable because they point at a versioned row. |
| `intake_responses` | Typed columns, not a JSON blob, so cross-client aggregates don't need parsing. Captured at day 0 and again at day 90. |
| `measurements` | Non-blood numerics over time. Includes grip strength, cheap, objective, strongly predictive, and a non-blood outcome measure. |

### Reference vocabularies

| Table | Purpose |
|---|---|
| `foods` | Tier drives the daily list and the off-protocol flag. Allergen columns so someone who can't eat eggs gets an alternative path rather than quitting or lying in the log. |
| `exercises` | Modality, movement pattern, minimum phase. |
| `circadian_practices` | Light, sleep, cold, heat. `is_daily_five` marks the non-negotiables. |
| `lab_markers` | LOINC-coded, assigned to a subsystem, with a lab reference range and a narrower program-optimal band. |
| `recipes` / `recipe_items` | Composed from `food_id`. Same IDs as the log, so a cooked meal can eventually be logged in one tap. |

**Food tiers:** `daily` (non-negotiable), `approved` (free within protocol), `occasional` (limited), `excluded` (off protocol). Logging an excluded food sets `log_foods.off_protocol`, a deviation to be recorded, never a reason to hide it.

### The daily log

| Table | Purpose |
|---|---|
| `daily_logs` | One row per client per date. Sleep and light as timestamps, not durations: circadian analysis needs *when*. |
| `log_foods` | Food ID, meal slot, quantity, off-protocol flag. |
| `log_exercises` | Modality, duration, intensity, time of day. |
| `log_practices` | Boolean plus timestamp per protocol practice. |
| `log_behaviors` | The second scoring axis. Five domains, 0-4 each. |

The five behavioural domains, from the daily log rather than from blood:

- `connection`: social contact and sense of purpose
- `cognitive`: deliberate learning versus passive consumption
- `movement`: movement and muscle
- `light_sleep`: light exposure and sleep timing
- `emotional`: stress and emotional load

Blood measures the biology twice. This measures the inputs every day. The pairing is the thing nobody else has.

**Enforce in application code, not the schema:** backfill is limited to yesterday. Retroactive logging is fiction and it corrupts every circadian timestamp. Set `is_backfilled` when it happens.

**Adherence is a percentage, not a streak.** A broken streak makes people quit. A 78% makes them push for 85%.

### Labs and scoring

| Table | Purpose |
|---|---|
| `lab_panels` | One draw. Holds the PDF path, review status, and whether a referral was made. |
| `lab_results` | One row per marker per panel. |
| `score_methods` | Versioned methodology with subsystem weights. A score computed in 2026 stays interpretable in 2031. |
| `battery_scores` | Per-subsystem plus composite, with a `detail` JSON showing how each marker contributed so the score can be explained line by line. |
| `marker_deltas` (view) | Day 0 vs day 90 per marker, with `improved` derived from each marker's `better_direction`. |

`lab_panels.referral_made` and `referral_note` exist so the abnormal-result referral protocol leaves a searchable trail. Any out-of-range result gets referred to a physician. That's a written protocol, and this is where it's recorded.

The Battery Score is a composite index for tracking change. It is not diagnostic, not validated for clinical use, and must never be presented to a clinician as a medical measurement.

### Operations

| Table | Purpose |
|---|---|
| `applications` | The marketing form. Name, email, state, source. No health questions. That's what keeps the public page's compliance surface small. |
| `payments` | Mirrors Stripe. Three plans: paid in full, two payments, three monthly. |
| `coach_notes` | Staff only. A client can never read these. |
| `audit_log` | Who saw or changed what, and about whom. |
| `data_requests` | Access, export, deletion, consent withdrawal, appeal. Defaults to a 45-day due date, which is the statutory window. |

---

## Seeded data

- **30 lab markers** across the four subsystems, LOINC-coded, with reference ranges, program-optimal bands, and a `better_direction` so improvement can be computed rather than eyeballed.
- **10 circadian practices**, five flagged as daily non-negotiables.
- **25 foods** as a starter vocabulary across all four tiers. The full list is content work, not schema work, but the shape is set.
- **Battery Score v1** with weights charge 0.30, drain 0.25, output 0.25, reserve 0.20.

---

## Still to build on top

- Score computation function: currently `battery_scores` is a table waiting for a writer.
- Program-day trigger to populate `daily_logs.program_day` from `memberships.day_zero`.
- De-identification view for research export, gated on `has_active_consent`.
- Audit triggers. The table exists; nothing writes to it yet.
