# Pending: Stripe test mode proof

Owner is supplying Stripe TEST keys. The moment they land, this is the work, in
this order. It is written down because it is the one piece of the billing build
that cannot be proved without a credential, and a pending proof that lives only
in a conversation is a pending proof that gets skipped.

## 1. Set the keys

Both, together. A secret key without a webhook secret fails in the worst
available way: the payment succeeds, the webhook 500s on signature verification,
every retry fails, and nobody is onboarded.

    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...

In `.dev.vars` for local, and as Cloudflare Pages secrets for production.

## 2. Write the off-session charge

`functions/api/billing-run.js` currently returns `not implemented` for a due
charge when Stripe IS configured. That is deliberate: it was never stubbed with a
fake success, because a stub returning `paid` marks money as collected that
nobody collected. What goes there:

- a Customer and a saved payment method per participant, created at enrolment
- an off-session PaymentIntent per due installment, idempotency key
  `payment:<payments.id>` so a replayed job cannot charge twice
- on success, `payments.status = paid` with `paid_at` and the intent id
- on decline, `payments.status = failed` with the decline reason, which is what
  triggers the weekly recovery offer

The DISTINCTION already built must survive: a charge that could not be attempted
is `blocked`, never `failed`. Only a Stripe decline is a failure.

## 3. Prove all three options with test cards

Against the internal member, in test mode, for real:

| Option | Expect |
| --- | --- |
| Pay in full | 1 charge of $1,000.00 on Day 1 |
| Two payments | $500.00 on Day 1, $500.00 on Day 45 |
| Three payments | $333.33 Day 1, $333.33 Day 31, $333.34 Day 61 |

Each must create exactly ONE entitlement and charges summing to $1,000.00. Use
`4242 4242 4242 4242` for success. Move the system clock forward, or set an
earlier `day_zero`, to make the later installments due rather than waiting.

## 4. Prove the failure policy with test cards

- `4000 0000 0000 0341` attaches but fails on charge: use it for an installment,
  and confirm the weekly recovery plan is OFFERED at the outstanding balance.
- Accept the plan, pay week 1 with `4242...`, confirm `access_through` moves
  exactly seven days and the program is reachable.
- Fail week 2 with the declining card, confirm the entitlement is suspended and
  every program surface returns nothing while the participant's own records and
  export still work.
- Pay the balance, confirm access is restored with history intact.

## 5. Prove webhook idempotence against real events

Replay a `payment_intent.succeeded` from the Stripe CLI. `webhook_events` is
unique on `(provider, event_id)`; confirm the replay creates no second payment,
no second entitlement and no second membership. Deliver two events out of order
and confirm the later state wins rather than the last one received.

## 6. Discounts through Stripe

Create a Coupon and a Promotion Code for each discount so the charge and the
record cannot disagree, and store the ids on `discounts.stripe_coupon_id` and
`discounts.stripe_promotion_code_id`. Then re-run the 20 percent case and confirm
Stripe's own charge amounts are $266.67, $266.67, $266.66, not just ours.

## What must NOT happen

Going to live keys before every line above passes in test mode. CLAUDE.md rule
8c: going live means swapping two secrets, and the test-mode proof is the only
thing standing between that swap and charging a real person wrongly.
