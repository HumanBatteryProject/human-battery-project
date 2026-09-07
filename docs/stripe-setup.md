# Stripe integration — The Human Battery Project

## The one architectural decision

The program fee is **$1,000 total for cohort 01, and it ends at day 90.** That makes it a *payment plan*, not a subscription. Stripe's own documentation draws the line clearly: payment plans finance a single purchase and stop when the balance reaches zero; subscriptions pay for continued access and run until someone cancels.

Building this as a plain subscription is the most common way it gets done wrong, and the failure mode is that clients keep getting charged after the program ends.

How it's handled here: installment plans use a recurring price, and `invoice.paid` counts how many invoices have been paid. On the final installment the webhook cancels the subscription. Nothing depends on anyone remembering.

| Plan | Charges | Timing |
|---|---|---|
| Paid in full | $1,000 × 1 | At checkout |
| Two payments | $500 × 2 | At checkout, then day 30 |
| Three payments | $333.33, $333.33, $333.34 | At checkout, then day 30 and day 60 |

Installments are billed on the client's **day 30 and day 60**, not on the 1st of the month. Calendar billing means someone who enrols on the 26th pays again five days later, which forces proration and turns into refund arguments. Because a cohort has one fixed start date, everyone's day 30 is the same date anyway — the tidiness without the edge case.

The final payment lands a month before the program ends, so you are never chasing money from someone who has already finished.

Amounts are computed server-side from `PROGRAM_TOTAL_CENTS`. The browser sends a plan key, never a price — otherwise anyone can pay a dollar.

---

## Files

```
functions/api/_payments.js        pricing, plan shapes, Supabase helper
functions/api/checkout.js         POST /api/checkout  → Checkout Session URL
functions/api/stripe-webhook.js   POST /api/stripe-webhook
migrations/011_stripe.sql         Stripe columns + idempotency index
```

Add `stripe` to the site's `package.json`. Cloudflare Pages installs it at build time.

---

## Setup

**1. Run the migration.** Supabase SQL editor, after `010_seed.sql`.

**2. Get your keys.** Stripe Dashboard → Developers → API keys. Use test keys (`sk_test_…`) until you've run through a real checkout.

**3. Create the webhook endpoint.** Stripe Dashboard → Developers → Webhooks → Add endpoint.

- URL: `https://thehumanbatteryproject.com/api/stripe-webhook`
- Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`

Copy the signing secret (`whsec_…`).

**4. Add environment variables** in Cloudflare Pages → Settings → Environment variables:

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` or `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from step 3 |
| `SUPABASE_URL` | already set for the application form |
| `SUPABASE_SERVICE_KEY` | already set |

Redeploy after adding them.

---

## Two things that would have broken in production

**`constructEventAsync`, not `constructEvent`.** Cloudflare Workers use Web Crypto, which is asynchronous. The synchronous signature verification every Stripe tutorial shows fails silently in this runtime — meaning either every webhook is rejected, or worse, verification is skipped. The async version with `Stripe.createSubtleCryptoProvider()` is required.

**Webhook idempotency.** Stripe delivers at least once and retries on any non-2xx response. Without a unique constraint, a retried `invoice.paid` inserts a second payment row and the books stop reconciling. The unique index on `(stripe_checkout_session, installment_no)` turns the retry into a no-op update.

That index is deliberately **not** partial. A partial unique index cannot satisfy `ON CONFLICT` unless the predicate is repeated in every upsert, and PostgREST's `on_conflict` parameter can't express one. This was caught by testing against real Postgres — it parses fine and fails at runtime.

---

## Access control

Checkout requires an application with `status = 'accepted'`. Twenty-five seats is a reviewed list, not an open shopping cart, and this prevents someone finding the endpoint and enrolling themselves.

Application statuses: `new` → `reviewing` → `accepted` → `enrolled`, plus `waitlisted`, `declined`, `withdrawn`.

---

## Testing

```bash
npx wrangler pages dev public --compatibility-flag=nodejs_compat
stripe listen --forward-to localhost:8788/api/stripe-webhook
```

Test cards: `4242 4242 4242 4242` succeeds. `4000 0000 0000 0341` attaches but fails on charge — use it to verify the failed-payment path marks the row `failed`.

To watch a three-payment plan run to completion without waiting three months, use a Stripe **test clock**: create the customer against a test clock, then advance it 30 days at a time. Confirm the subscription cancels itself after the third invoice.

**Verify before going live:**

- [ ] Three installments recorded, totalling exactly $1,000 (333.33 + 333.33 + 333.34)
- [ ] Subscription cancels after the final installment
- [ ] Replaying the same webhook creates no duplicate row
- [ ] Failed payment marks the row `failed` with a reason
- [ ] Refund marks the row `refunded`
- [ ] Checkout is refused for an email without an accepted application

---

## Before taking real money

The refund policy on the site is currently a draft: full refund before the first blood draw less lab costs, 50% within fourteen days, none after. It appears in `terms.html` and it needs to match what you'll actually do — a refund policy you don't honour is a chargeback.

Payment plans are an agreement to pay the full amount. Someone who withdraws at day 20 on the three-payment plan still owes the remaining $1,000 unless you agree otherwise in writing. Decide now whether you'll enforce that, and make the terms say the true thing.
