# The Human Battery Project: Version 1 by October 9, 2026

The nine deliverables requested in the V1 vision document, in the order requested. Section 3 is the copy-ready master prompt for Claude Code. The vision document is the specification. The only departures from it are the five rulings the owner approved on 25 September, listed in Section 2, and every one of them is carried into the master prompt as an explicit instruction so nothing is left to the agent's reading.

---

## 1. V1 product and realistic scope

The Human Battery Project is a 90-day measured lifestyle program followed by an ongoing personalized software membership. Its operating loop is Sense → Interpret → Prioritize → Act → Verify → Learn. The software turns participant data and the approved scientific canon into a small number of explainable daily actions, remembers what happened, adapts within approved boundaries, and helps participants maintain progress after Day 90. It is wellness-support software, not an autonomous doctor, diagnostic system, emergency service, or substitute for medical care.

V1 scope, realistic for October 9: account and onboarding with consent and first/fifteenth start dates; structured manual entry of baseline and follow-up laboratory and fitness results; a daily check-in; a daily action plan of one to three actions drawn only from approved canonical rules, each fully explained; follow-through and adaptation on the next check-in; a dashboard that separates behavior from measured biology; a weekly review; the Day-90 transition; continuing membership at $39.99 monthly or $349 annual with server-side entitlements; a restricted admin interface; one orchestrated workflow with six logically separated components; scheduled jobs with idempotency; a rule-based fallback and an immediate pause for all AI recommendations. Manual check-ins make the product complete without wearables. One wearable ships only if credentials, permissions, and reliable synchronization are completed and tested by the deadline.

What exists today and is reused: a Cloudflare Pages site and functions, Supabase (Postgres with pgvector, Auth, RLS), a Cloudflare Worker cron, a corpus of the book and eleven program documents with evidence tiers, six deployed endpoints (onboard, analyze, coach, brief, trend, complete) with deterministic shared modules for medication safety, evidence tier, autonomy bounds, and unit validation, three defined lab panels, a pre-commit gate and a post-deploy smoke test, an internal test member, and an admin role. The master prompt instructs the agent to inspect and confirm all of this before changing anything.

---

## 2. Explicit assumptions and unresolved business decisions

Approved rulings (owner-approved 25 September; these are the only departures from the vision document):

1. Scoring architecture: the five dimensions of Chapter 21 (FLOW, CAPACITY, TIMING, STRUCTURE, ENVIRONMENT) are the measurable dimensions. Charge, Drain, Output, Reserve are conceptual navigation only, and Charge and Redox receive no fabricated values, progress bars, or score contributions. The six-dimension list (Fuel, Capacity, Recovery, Inflammation, Rhythm, Body/Structure) is not implemented.
2. Evidence classification: the existing six-value `evidence_tier` is kept. Mapping to the document's three classes: Established = established + strong; Emerging = emerging + contested; Working Model = hypothesis; `unsupported` never renders and never generates an action.
3. Enrollment: open, starts on the 1st and 15th, no cohort caps. The founding price, if used, is a date window, not a count.
4. Continuing membership: $39.99 monthly, $349 annual billed upfront.
5. Automated adjustment at launch: `AUTONOMY_MODE = review_all`. No automated changes to fasting windows, electrolytes, light exposure, sauna, cold, or exercise reach a participant without owner approval in the admin interface. The bounded mode remains as a flag for a later decision.

Assumptions:

- The existing stack is retained (Cloudflare Pages and Functions, Cloudflare Worker cron, Supabase, Stripe, the current AI provider, Voyage for embeddings). No wholesale rewrite.
- The approved Battery Score formula is the deterministic composite already implemented over the five dimensions; it is versioned as `formula_version = 1` and feature-flagged until the owner confirms it in the admin interface. Until then, dimension summaries and trends launch and the overall score is hidden.
- The book at revision 318 and the eleven program documents are the canon source; canonical rules are seeded from the protocol sections and approved by the owner before any action can be generated.
- The medication screening table is the contraindication source for V1.
- No clinician escalation workflow exists; the product provides clear instructions to contact an appropriate professional.

Unresolved business decisions (owner):

- Initial program price (working constant $1,000; not rendered until confirmed).
- Founding price and its date window, or none.
- Finalized laboratory panel confirmation (three panels defined: 6, 14, 33 markers).
- Testing partnerships (none; the documents specify a draw site rather than a vendor).
- Clinical staffing (none in V1).
- Name of the continuing membership ("continuing membership" until approved; "Human Battery Continuum" is not approved).
- Refund and cancellation policy text.
- Jurisdiction and legal review of terms, privacy, consent, and vendor contracts.

---

## 3. Master prompt for Claude Code (copy-ready)

```
You are building Version 1 of The Human Battery Project for a usable launch by October 9, 2026. This prompt is the specification. Follow it precisely as written. Where it says inspect, inspect. Where it says do not, do not. Where a decision is the owner's, stop that item, record it as blocked, and continue with the rest. Do not substitute your own reading for an instruction. Do not reduce, reinterpret, or rename anything in this prompt. If scope exceeds capacity, reduce scope by deferring whole items from the DEFER list and say so; never by partially building a required item.

The target date is a target, not permission to skip release safeguards.

============================================================
PART A. FIRST INSTRUCTION: INSPECT BEFORE CHANGING ANYTHING
============================================================

Before any change, inspect the repository and produce a written audit that identifies:

- Framework, database, hosting, authentication, billing, AI provider, embedding provider, background jobs, and messaging services.
- Existing onboarding, scoring, canonical rules, dashboards, and integrations.
- Repository instructions (CLAUDE.md and any rules files), environment requirements, tests, pre-commit hooks, and the deployment process.
- What is actually implemented and tested versus placeholder, mocked, or marketing copy. For each of the six existing endpoints (onboard, analyze, coach, brief-run, trend, complete) and the Worker, state whether it has been executed against the live database and what it returned.
- Every constant currently pinned by test, with its value.
- Every feature flag.

Preserve existing working functionality. Reuse the existing stack. Do not initiate a wholesale rewrite or add unnecessary infrastructure.

Report conflicts between this prompt and the repository before changing foundational product behavior. Foundational means: scoring, canon, safety exclusions, billing, permissions, and the operating loop.

============================================================
PART B. DECISIONS ALREADY MADE BY THE OWNER
============================================================

Apply these as given. They are not open for inspection or re-decision.

B1. Scoring architecture. The measurable dimensions are the five of Chapter 21: FLOW, CAPACITY, TIMING, STRUCTURE, ENVIRONMENT. Charge, Drain, Output, and Reserve are conceptual navigation only. Do not build the six-dimension list (Fuel, Capacity, Recovery, Inflammation, Rhythm, Body/Structure). Charge and Redox must not receive fabricated values, progress bars, or score contributions. Do not invent a mathematical mapping between models.

B2. Evidence classification. Keep the existing six-value evidence_tier. For any surface that presents three classes: Established = established + strong; Emerging = emerging + contested; Working Model = hypothesis. unsupported never renders to a participant and never generates an action.

B3. Enrollment. Open enrollment. Program starts on the first or fifteenth of each month. No artificial scarcity, no fixed cohort caps, no January-only launch. If a founding price exists it is a date window constant, never a count.

B4. Continuing membership. $39.99 monthly or $349 annual. Annual is billed as $349 upfront, not installments. Membership includes continued software access and daily personalized guidance. Additional labs, fitness assessments, and clinician consultations are not automatically included. Call it "continuing membership" in every surface. "Human Battery Continuum" is not approved.

B5. Automated adjustment. Set AUTONOMY_MODE = review_all. In V1 no automated change to fasting windows, electrolytes or sodium, water, light exposure, sauna, cold, or exercise reaches a participant without owner approval in the admin interface. Keep the bounded mode as a flag; do not enable it.

B6. Prices, panels, staffing, partnerships. Do not invent the initial program price, the finalized laboratory panel, clinical staffing, or testing partnerships. Inspect existing configuration (PROGRAM_PRICE, FOUNDING_PRICE, lab_panel_defs) and flag each as an unresolved owner requirement. Nothing renders a program price until the owner confirms it.

B7. Brand. Preserve the existing brand, approved wordmark, typography, and color palette. Position authority around the methodology, platform, data, and participant experience. Do not make the website founder-centered.

============================================================
PART C. SCIENTIFIC CANON AND SCORING
============================================================

C1. Canonical lifestyle pillars:
- Morning daylight
- Hydration
- Movement
- Food timing
- Sleep
- Nighttime darkness
These six are the pillars. Every canonical rule belongs to one of them. The protocol's existing sections map onto these six; do not introduce a different pillar list.

C2. Mandatory scientific distinctions, enforced in the schema and in every surface:
- MEASURED: directly observed data.
- CALCULATED: transparent calculations from measured inputs.
- FRONTIER: mechanisms or hypotheses not directly measured in the product.
Every stored value and every rendered number carries one of these three labels.

C3. Never infer actual mitochondrial membrane potential, cellular voltage, redox state, structured-water status, or inflammation from generic wearable signals.

C4. Battery Score. Inspect whether an approved formula exists (the deterministic composite over the five dimensions). If it exists:
- Implement it deterministically, outside the language model.
- Preserve raw values, units, source, timestamps, formula version, and component contributions.
- Display data coverage and freshness.
- Do not treat missing data as healthy or as zero.
- Make before-and-after comparisons only using comparable inputs and the same formula version.
- Feature-flag the overall score until the owner approves it in the admin interface.
If no approved formula exists: launch with transparent dimension summaries and trends, feature-flag the overall score, and do not let this block the daily coaching workflow.

C5. Store canonical guidance as structured, versioned records (table: canonical_rules), each with:
- Rule ID and version
- Intended population and eligibility
- Required data
- Action and allowed personalization
- Contraindications and exclusions (linked to the medication screening rows)
- Evidence classification (per B2)
- Verified source references (passage ids in the corpus)
- Expected reassessment interval
- Stop conditions
- Review status and reviewer
- Approval and retirement timestamps
Seed the rules from the approved protocol. Only rules with review_status = approved may generate actions. Emerging or Working Model content defaults to clearly labeled education, not automated interventions. The owner approves the seed in the admin interface; until then, no rule is approved and no plan is generated for a real participant.

C6. The system must not automatically rewrite its canon based on new papers or participant correlations. Any science intake writes to a review queue only.

============================================================
PART D. VERSION 1: REQUIRED END-TO-END EXPERIENCE
============================================================

D1. Account and onboarding. Implement:
- Secure account creation and sign-in (magic link through the existing confirm page).
- Consent and clear product limitations, stored with timestamp and consent version.
- Timezone and notification preferences.
- Goals, baseline symptoms, schedule, and relevant constraints.
- Minimal relevant health context, with explicit consent.
- First/fifteenth start-date selection.
- Program-day tracking using the participant's local timezone.
Explain that the software is not monitored continuously and cannot provide emergency response. Avoid collecting unnecessary sensitive data. Location is ZIP or postal code plus country, never a street address, and precise GPS is never required.

D2. Baseline and follow-up records. Support structured manual entry of approved laboratory and fitness results. For each result preserve: value and unit; measurement date; laboratory or reference range where applicable; source and verification status; relevant collection context such as fasting status. Validate units and values without silently altering them; record every conversion. Use Day 0 and Day 90 as assessment anchors but store actual test dates. Missing or delayed testing must be visible and must never generate invented results. Secure document uploads are optional for V1; if implemented, include access controls, file validation, retention rules, and a review workflow. Do not depend on automated PDF interpretation to launch.

D3. Daily check-in. A fast, mobile-friendly check-in covering: sleep timing and perceived sleep quality; energy; relevant symptoms; movement; outdoor daylight; meal timing; hydration behavior; evening light and darkness; completion or difficulty of previous actions. Brief questions, sensible optional fields, no unnecessary notification burden.

D4. Daily action plan. Generate one to three low-risk actions from approved canonical rules. Every action shows:
- What to do
- Why it was selected
- Which observations supported it
- Whether inputs are self-reported or device-derived
- What information is missing
- When the system will review it
- A simple complete, skip, or adjust control
Do not fabricate confidence percentages. Use qualitative confidence tied to defined data-quality criteria. Participants can reject, reschedule, or pause actions. A stable plan is acceptable. Do not change guidance simply to appear intelligent.

D5. Follow-through and adaptation. On the next check-in: review prior actions; ask about barriers when appropriate; simplify an overwhelming plan; update suggestions within approved rules; retain an auditable record of what changed and why. Learn preferences and adherence patterns. Do not autonomously retrain models or convert personal correlations into medical conclusions.

D6. Dashboard. Prioritize: today's plan; relevant changes; data completeness; progress over time; upcoming assessments; access to explanations and history. Separate behavior tracking from measured biological outcomes. Completing a habit must not imply that a laboratory abnormality improved.

D7. Weekly review. A concise report: what changed; what remained stable; actions completed; reported barriers; data limitations; next week's priorities. Use "associated with" for observational patterns. Never claim an action caused a change.

D8. Day-90 transition. An end-of-program summary comparing available baseline and follow-up data: symptoms and function; fitness measures; laboratory results; habits and consistency; remaining uncertainties; suggested maintenance priorities. Carry the participant's history into membership without resetting it.

D9. Continuing membership. Implement $39.99 monthly and $349 annual using the existing payment provider. Requirements: explicit subscription consent; accurate recurring-price disclosure; clear effective date and renewal date; no silent conversion from the initial protocol; checkout and billing portal; cancellation handling; payment failure handling; duplicate and out-of-order webhook protection; server-side entitlement enforcement; an explicit policy preventing accidental overlap or double billing when plans change. Use a configured initial-program entitlement ending at Day 90. A participant may purchase continuation beforehand, but access and billing dates must be explicit. Canceled membership retains access until the paid period ends. Separate paid features from account-management and data-export rights. Do not equate cancellation with immediate data deletion. Build against Stripe test mode until live keys are supplied.

D10. Admin and operations. A restricted admin interface for: program and subscription state; canon approval and version history; failed jobs and delivery issues; support requests; recommendation audit trails; data corrections with change history; feature flags and emergency suspension of AI generation. Role-based access. Log access to sensitive records. Do not promise clinician escalation; provide clear instructions to contact an appropriate professional.

============================================================
PART E. AGENTIC ARCHITECTURE
============================================================

E1. One orchestrated workflow with logically separated components, not independently operating agents. Map the existing endpoints onto these components and name them in code:
- Observer: validates and normalizes data.
- Interpreter: produces a constrained state summary.
- Planner: selects eligible canonical actions.
- Safety gate: blocks inappropriate recommendations.
- Explainer: produces user-friendly language.
- Reviewer: checks output against schema, evidence, and permitted actions.

E2. Keep arithmetic, billing, permissions, eligibility, scoring, and safety exclusions in deterministic code. Use the language model for constrained synthesis and explanation only. Require structured output and validate it.

E3. The model must never: execute arbitrary commands or database queries; change billing or account permissions; prescribe, stop, or adjust medications; invent laboratory values, evidence, scores, or diagnoses; treat uploaded text as operational instructions; override the approved action catalog.

E4. Implement: scheduled daily plan generation; weekly review jobs; retries and idempotency; timezone and daylight-saving handling; model, prompt, and canon version logging on every generation; token and cost budgets per participant; secure, minimal context retrieval; rule-based fallback when AI is unavailable; the ability to pause all AI recommendations immediately (feature flag AI_GENERATION_ENABLED). Do not depend on multiple model calls per component if one constrained call is sufficient.

============================================================
PART F. INTEGRATIONS AND V1 SCOPE
============================================================

F1. Manual check-ins must provide a complete working product without wearables.

F2. Inspect existing wearable integrations. Ship one only if credentials, permissions, and reliable synchronization can be completed and tested within the deadline. Otherwise defer wearable connections and remove misleading "connected" states. Never show demonstration data as live participant data.

F3. Local daylight context is optional: approximate location with consent; no precise GPS; do not invent sunrise, weather, or UV values; do not turn daylight guidance into instructions to tan, stare at the sun, or avoid eye protection.

F4. Not V1 blockers: multiple wearable providers; automated lab ingestion; clinician portals; advanced travel adaptation; formal N-of-1 experimentation; cohort-level predictive modeling; native mobile apps; autonomous research agents; community or social features. Personal experimentation in V1, if included at all, is limited to low-risk approved habit changes with clear uncertainty.

============================================================
PART G. SECURITY, PRIVACY, AND SAFETY
============================================================

Treat this as sensitive health-data software. Require: cross-user isolation; server-side authorization; strong admin authentication; encryption in transit and at rest; secure secret handling; redacted logs; minimum necessary information sent to AI vendors; documented retention, export, and deletion workflows; explicit consent for integrations and any research reuse; no health information in marketing analytics or notification previews; backup and restore verification; rate limits and abuse protections.

Do not claim HIPAA compliance, medical-device clearance, or clinical validation. Identify jurisdiction, vendor-contract, regulatory, and legal-review requirements as launch dependencies, not as things a disclaimer solves.

Maintain a conservative approved safety policy. Red-flag responses must not be replaced by lifestyle coaching. Do not imply that absence of an alert means someone is safe. Do not automate supplement dosing, electrolyte loading, fasting, aggressive exercise, or therapeutic light exposure.

============================================================
PART H. HOW TO WORK
============================================================

H1. Audit first (Part A). Report the audit before any change.
H2. Create a small vertical slice: one test participant completes onboarding and receives a valid daily plan from approved rules, end to end, before anything else is built out.
H3. Implement in testable milestones per the 14-day plan below. One commit per milestone. Run the full test suite, the pre-commit gate, and the post-deploy smoke test after each milestone. Deploy each milestone. A milestone is not done until it is live and its version is reported.
H4. Document deployment and rollback, and rehearse rollback once.
H5. Report honestly, every day, in four lists: implemented, tested, blocked, deferred. Never claim production readiness based on screenshots or mocked data.
H6. Where an owner prerequisite is missing (a credential, an approval, a policy text), build to a named placeholder, prove the placeholder fails loudly, record the item as blocked, and continue.
H7. Every check you write must be shown to fail on a seeded defect before it is trusted.

============================================================
PART I. 14-DAY PLAN
============================================================

Day 1: Repository audit (Part A) reported. Scope locked. Schema for canonical_rules, consents, enrollments with start dates, entitlements, daily_checkins, plan_actions, weekly_reviews, ai_calls, audit_log, feature_flags. Constants set per Part B. Done when: audit delivered; migrations applied; constants pinned by test.
Day 2: Auth and consent (D1). Done when: a new test participant signs in through the confirm page, accepts consent, and the consent row exists with version and timestamp.
Day 3: Onboarding, program state, start-date selection, baseline record entry (D1, D2). Done when: the participant has a start date, a program day computed in their timezone, and one lab result stored with unit, date, source, and fasting status.
Day 4: Daily check-in (D3). Done when: a check-in writes daily_checkins from a phone-width screen in under a minute.
Day 5: canonical_rules seeded; deterministic Planner and Safety gate; constrained AI Explainer; Reviewer; audit history; rule-based fallback (C5, D4, E1 to E4). Done when: the vertical slice passes, a contraindicated participant never receives the contraindicated action, and the fallback produces a plan with AI_GENERATION_ENABLED off.
Day 6: Follow-through and adaptation (D5); kill switch in admin. Done when: a skipped action with a barrier changes the next plan within rules and the change is audited.
Day 7: Dashboard (D6). Done when: today's plan, completeness, progress, upcoming assessments, and history render; behavior and biology are separated; score hidden behind the flag.
Day 8: Weekly review (D7); scheduled jobs; idempotency; timezone and DST fixtures. Done when: two concurrent job firings produce one plan; DST transition fixture passes; a weekly review renders.
Day 9: Admin interface (D10): program state, canon approval, failed jobs, support requests, audit trails, corrections, feature flags. Done when: the owner approves the canonical_rules seed in the interface and the approval is logged.
Day 10: Day-90 transition (D8); subscription checkout, webhooks, entitlements (D9). Done when: forced end date produces the summary and the continuation offer; test cards create exactly one entitlement; replayed and out-of-order webhooks create none.
Day 11: Security pass (Part G): cross-user isolation fixtures, RLS on every participant table, rate limits, log redaction, notification preview check, backup restore rehearsal. Done when: every acceptance test in Part J that concerns security passes.
Day 12: Accessibility at phone width; timezone and failure-mode end-to-end tests; wearable decision per F2 (ship Oura only if tested end to end today; otherwise remove every "connect" control). Done when: no connected state exists that is not real.
Day 13: Consented pilot with the owner and two people on their own phones; operational rehearsal; rollback verified. Done when: three real participants have real plans and one rollback was performed and reversed.
Day 14: Release review against Part J and the go/no-go gates. Launch only if every gate passes.

Cut order if a day slips: Oura, Texas seasonality, science intake scanning agent, weekly review email delivery (portal-only acceptable), document uploads. Never cut: consent, canonical_rules and approval, daily check-in, action explainability, kill switch and fallback, entitlements and webhooks, admin interface, security pass, pilot.

============================================================
PART J. ACCEPTANCE TESTS AND GO/NO-GO
============================================================

Verify, with fixtures that were shown to fail first:
- A new user completes onboarding and receives a valid daily plan.
- Missing labs or wearables do not produce invented values.
- Missing or stale data is visibly labeled.
- A contraindication prevents the corresponding action.
- Unapproved rules cannot generate recommendations.
- Untrusted uploaded content cannot override instructions.
- Repeated job execution does not duplicate notifications or plans.
- Timezone changes and daylight-saving transitions behave correctly.
- One user cannot access another user's records.
- Admin access is restricted and auditable.
- AI failure produces a safe fallback rather than a broken dashboard.
- Payment webhooks are idempotent and order-tolerant.
- Monthly and annual subscriptions grant correct access.
- Cancellations and failed payments follow documented policies.
- Day-90 transition preserves history and requires subscription consent.
- Score changes are reproducible under a fixed formula version.
- Data export and deletion behave as documented.
- Notifications do not expose sensitive health details.
- No unsupported medical or "cellular voltage" claims appear in the interface.

Release is blocked by any of: an unresolved critical security defect; unsafe guidance; failed billing logic; a missing production prerequisite; absence of approved rules; sign-in not working from a real mailbox; any fabricated value anywhere.

============================================================
PART K. REPORT FORMAT
============================================================

Daily: implemented, tested, blocked, deferred, with live versions. Day 14: the acceptance table with pass or fail per line, the gates, the owner prerequisites still open, and one sentence: can a stranger apply on October 15 and receive a valid plan on October 16.

Begin with Part A.
```

---

## 4. 14-day implementation plan

Embedded as Part I of the master prompt, with dependencies and objective completion criteria per day. Dependencies: Day 5 depends on Days 1 to 4; Day 9's canon approval blocks any real participant plan; Day 10 depends on Stripe test keys; Day 12's wearable decision depends on an available device; Day 13 depends on the Supabase auth configuration (sign-in from a real mailbox) and two pilot participants; Day 14 depends on legal review and Stripe live keys.

---

## 5. Data entities, service boundaries, and background jobs

Entities (new or extended; existing tables retained):
- `profiles`, `consents` (version, timestamp, text hash), `enrollments` (start_date, timezone, program_day computed), `entitlements` (program to Day 90; continuation monthly or annual; effective and renewal dates), `subscriptions`, `payments`, `webhook_events` (idempotency key, received order).
- `canonical_rules` (Part C5 fields), `rule_reviews`, `rule_versions`.
- `lab_results`, `functional_tests`, `measurements` (value, unit, date, reference range, source, verification status, fasting status, MEASURED/CALCULATED/FRONTIER label, conversion record), `lab_results_held`.
- `daily_checkins`, `daily_plans`, `plan_actions` (rule id and version, reasons, supporting observations, input provenance, missing data, review date, status: complete/skip/adjust, barrier), `weekly_reviews`, `day90_summaries`.
- `dimension_summaries` (per dimension: value, coverage, freshness, formula version), `score_snapshots` (formula version, component contributions, feature-flagged).
- `ai_calls` (model, prompt version, canon version, tokens, cost fields), `feature_flags`, `job_runs` (idempotency key, status, retries), `audit_log`, `support_requests`, `notifications` (no health content), `documents` (optional).

Service boundaries:
- Auth and consent. Program state (enrollment, day, timezone). Records (validation and normalization: Observer). Canon (rules, versions, approvals). Orchestrator (Interpreter → Planner → Safety gate → Explainer → Reviewer). Scoring (deterministic, versioned, flagged). Billing and entitlements (Stripe webhooks, server-side enforcement). Notifications. Admin. Audit.

Background jobs (all idempotent, retried, timezone-aware):
- Daily plan generation per participant at local morning. Check-in reminder. Weekly review. Day-90 transition. Billing reconciliation and failed-payment handling. Failed-job retry. Cost rollup per participant per day. Backup verification. Corpus reload on source change.

---

## 6. Launch acceptance checklist

The Part J list, each line with a fixture that was shown to fail first, plus: consent version recorded for every participant; canonical_rules seed approved by the owner in the admin interface; AI_GENERATION_ENABLED off produces a plan and an unchanged dashboard; every rendered number carries MEASURED, CALCULATED, or FRONTIER; no "connected" state without a live token; program price not rendered unless confirmed; terms, privacy, and consent text legally reviewed; rollback rehearsed; pilot run with real people on real phones.

---

## 7. Defer until after launch

Multiple wearable providers and aggregators; automated lab ingestion and PDF interpretation; clinician portals and practitioner licensing; advanced travel adaptation; formal N-of-1 experimentation; cohort-level predictive modeling; native mobile apps; autonomous research agents (the science intake scanning agent; the review queue with manual entry may ship); community or social features; regional seasonality beyond national data; counter-evidence links; the supplement guide; SMS.

---

## 8. Cost-control plan

Measure, do not invent. Every model and embedding call writes an `ai_calls` row with participant, component, model, prompt version, input and output tokens, and timestamp. A daily per-participant token budget is a constant; on breach, the Planner and Explainer fall back to rule-only output for the rest of the day and the event is logged. The admin interface shows tokens per active participant per month; the owner enters the provider's rate per million tokens, and the interface computes cost per active participant against $39.99 and $349/12. Infrastructure (Cloudflare, Supabase, Stripe fees) is entered as monthly figures by the owner and divided by active participants. Targets are set by the owner after the first month of real data; the plan does not assume provider prices. Design choices that bound cost: one constrained call per component, minimal context retrieval, plan stability (no regeneration without a trigger), and the rule-only fallback.

---

## 9. Production prerequisites requiring owner action

1. Supabase personal access token, to set Site URL, redirect allowlist, and the token-hash email template so sign-in works from a real mailbox.
2. Voyage API key, then one re-embed command, so retrieval works by meaning.
3. Stripe live keys after incorporation; refund and cancellation policy text.
4. Confirm the program price and the founding price window, or none.
5. Approve the canonical_rules seed in the admin interface (Day 9).
6. Re-read and confirm the medication screening table (the contraindication source).
7. Confirm the Battery Score formula in the admin interface, or leave it flagged off at launch.
8. Legal review: terms, privacy policy, consent and limitations text, no-emergency statement, jurisdiction, and vendor contracts for health data (Supabase, Cloudflare, AI provider, Voyage, Stripe).
9. Two pilot participants with phones for Day 13.
10. An Oura ring if a wearable is to ship.
11. The AI provider's rate and monthly infrastructure figures, entered in the admin interface for cost per participant.
