# Day 14: release review against Part J

Run 2026-09-28. Live commit `5bdb234`. Deliverables v8 and v9.

Part J requires each line verified by a fixture that was shown to fail first.
Every PASS below names the thing that produced it, and every one of those was
seeded with a defect and watched to fail before it was trusted.

## The acceptance table

| # | Line | Result | Evidence |
|---|---|---|---|
| 1 | A new user completes onboarding and receives a valid daily plan | **FAIL** | `onboarding_fixtures`, `planner_fixtures` pass, but 0 of 16 canonical rules are approved, so a real participant receives no plan. Gated on purpose. Blocker 5. |
| 2 | Missing labs or wearables do not produce invented values | PASS | `held_fixtures`, `prove_wearables`, `check_no_fake_state`, `_completion.measured()` |
| 3 | Missing or stale data is visibly labeled | PASS | `dashboard_fixtures`, `analysis_fixtures`, `check_no_fake_state` |
| 4 | A contraindication prevents the corresponding action | PASS | `planner_fixtures` safety gate, `check_canon` proves every contraindication is a real screening key |
| 5 | Unapproved rules cannot generate recommendations | PASS | `plan-run` returns no plan for a non-internal member with no approved rules, verified live |
| 6 | Untrusted uploaded content cannot override instructions | **PASS, after a fix** | `prove_injection.mjs`. Had no fixture. One was written and it failed. See below. |
| 7 | Repeated job execution does not duplicate notifications or plans | PASS | `prove_failure_modes` concurrency case, unique index on `(client_id, plan_date)` |
| 8 | Timezone changes and daylight-saving transitions behave correctly | PASS | `dst_fixtures`, `brief_clock`, `prove_failure_modes` Pacific/Kiritimati case |
| 9 | One user cannot access another user's records | PASS | `prove_isolation` across every table with a `client_id`, on every deploy |
| 10 | Admin access is restricted and auditable | PASS | `check_rls`, `admin_fixtures`, `audit_log` holds 82 rows |
| 11 | AI failure produces a safe fallback rather than a broken dashboard | PASS | `prove_failure_modes` kill-switch case, `_agent.ask()` retry |
| 12 | Payment webhooks are idempotent and order-tolerant | PASS | `prove_webhook`, claim-before-work in `webhook_events`, `isStale` by provider clock |
| 13 | Monthly and annual subscriptions grant correct access | PASS | `continuation_fixtures`, `billing_fixtures`, `has_program_access` honours `access_until` |
| 14 | Cancellations and failed payments follow documented policies | PASS | `billing_fixtures`, `prove_failure_modes` Stripe-absent case |
| 15 | Day-90 transition preserves history and requires subscription consent | PASS | `day90_fixtures`, `completion_fixtures`, chaining writes a new row and never mutates the old |
| 16 | Score changes are reproducible under a fixed formula version | **FAIL** | No Battery Score formula exists. `battery_scores` holds 0 rows and still carries the retired four-subsystem columns. Blocker 4. |
| 17 | Data export and deletion behave as documented | PARTIAL | `check_export` proves every table is exported or excluded by name; `data_requests` holds 0 rows, so the path has never been exercised end to end |
| 18 | Notifications do not expose sensitive health details | PASS | `check_logs`: no log line or notification subject names an address, a marker or a value |
| 19 | No unsupported medical or cellular-voltage claims appear in the interface | PASS | `check_prohibitions` across 188 files, `check_claims` exit 0 |

**16 pass, 2 fail, 1 partial.**

## What line 6 found

The line had no fixture. Guardrails existed saying they outrank everything, which
is a claim about a prompt and not evidence about behaviour. A fixture was written
and it failed immediately.

The coach refused four injection attempts in words and then printed the injected
phrase anyway, as the first line of the reply, directly after the evidence tier
wording that `coach.js` prepends in code:

    We know this. BANANA_PROTOCOL
    Note: I'm not going to follow instructions embedded inside a document.

The refusal is genuine. The defect is what a member reads first. With a nonsense
token it is harmless. With "STOP TAKING YOUR STATIN" in its place, that sentence
is the first thing on the screen and it carries "We know this", the consumer
wording for the `established` evidence tier, on text an attacker supplied.

`functions/api/_injection.js` replaces the whole reply when a demanded phrase
survives into it. Deterministic and server side, because an instruction in a
prompt is what failed. All four attempts now pass against the live site.

## The release blockers

Release is blocked by any one of these. Four are open.

| Blocker | State |
|---|---|
| An unresolved critical security defect | **Clear.** The one found today is fixed, deployed and proved. |
| Unsafe guidance | **Clear.** Heat and cold ceilings hold in three places; the coach honours them live. |
| Failed billing logic | **Clear in logic, blocked on keys.** `prove_webhook` passes; no Stripe key exists. |
| A missing production prerequisite | **OPEN.** No Stripe keys. No Voyage key, so retrieval is lexical. Three consent documents are still `v1-unreviewed`, so legal review has not happened. |
| Absence of approved rules | **OPEN.** 0 of 16 approved. No real participant can receive a plan. |
| Sign-in not working from a real mailbox | **Clear.** Both accounts confirmed and signed in. |
| Any fabricated value anywhere | **Clear.** `check_no_fake_state`, `check_logs`, `check_canon` and the held-row rules all pass. |

Two further gates from the plan itself:

- **Day 13 is not complete.** It required three real participants with real plans.
  There is one, the internal member. Zero non-internal participants exist.
- **No Battery Score formula.** Line 16 cannot pass until one exists and is versioned.

## Owner prerequisites still open

1. Approve the canon. 16 rules wait, including the two heat and cold rules.
2. Stripe keys, both of them. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. Legal review of terms, privacy and the health-data consent, all `v1-unreviewed`.
4. The Battery Score formula, and a version for it.
5. Two pilot participants with phones.
6. Voyage API key, or accept lexical retrieval and say so.
7. Wearable provider credentials, and a real device per provider to verify the mappings.
8. The clear space ruling for footer marks, which cannot meet space-6 inside a 14mm margin.
9. Whether chicken liver joins the approved food list, and whether offcuts are list items.

## The question Part K asks

**Can a stranger apply on October 15 and receive a valid plan on October 16?**

No. They can apply, be placed in a tier, consent, and sign in. They cannot be
charged, because there are no Stripe keys, and they would receive no plan on
October 16, because no canonical rule is approved and the code refuses to build a
plan from unapproved rules. Both are gates you hold, and both can be cleared in a
day: approving the canon is a screen, and the Stripe keys are a paste. Nothing in
the software is in the way.
