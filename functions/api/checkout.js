// =====================================================================
// POST /api/checkout
//
// Two different kinds of money, one endpoint, and they must not be confused.
//
//   { plan: 'two_payments' }          the ninety day program: a FIXED TOTAL
//   { plan: 'continuation_monthly' }  continuing membership: a SUBSCRIPTION
//
// WHAT THIS FILE USED TO DO, AND WHY IT COULD NOT WORK. It branched on
// plan.mode, plan.interval and plan.interval_count. None of those three
// properties exist in _payments.js. plan.mode was therefore always undefined,
// never equal to 'payment', so every plan including pay-in-full fell through to
// the subscription branch, where it built a recurring price from two undefined
// fields. Stripe rejects that, so NO plan could produce a valid session. The
// file was written against an older shape of PLANS and had never run against the
// current one.
//
// WHAT IT DOES NOW. The program charges installment one here, on session, and
// saves the card. billing-run.js charges the remaining installments off session
// on their due dates. That is one mechanism for all three options, it handles
// the non-uniform gaps (day 1 and 45, or day 1, 31 and 61) that no Stripe
// interval can express, and it is the same path the weekly recovery plan uses.
//
// Continuation is a real subscription, because it genuinely does renew until
// somebody stops it.
// =====================================================================

import Stripe from 'stripe';
import { isValidPlan, PLANS, CURRENCY, json, supabase } from './_payments.js';
import { quote, quoteBalances } from './_discounts.js';
import { settings, KEYS, SettingMissing } from './_settings.js';
import {
  CONTINUATION_PLANS, isContinuationKind, continuationDates, purchaseDecision,
} from './_continuation.js';
import { stripeState } from './enroll.js';
import { taxState } from './_tax.js';
import { rateLimit, tooMany, callerIp, hashed } from './_ratelimit.js';

const API_VERSION = '2026-07-29.dahlia';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const planKey = String(body.plan || '');
  const email = String(body.email || '').trim().toLowerCase();
  const code = String(body.discount_code || '').trim();
  const dryRun = body.dry_run === true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Invalid email' }, 400);

  // Rate limited before anything else happens, and by BOTH the address and the
  // email. By IP alone, one machine walking a list of addresses is one caller. By
  // email alone, a botnet gets a fresh allowance per address. The email limit is
  // the one that matters here, because this endpoint answers differently depending
  // on whether an application was accepted, and that makes it an oracle worth
  // sweeping.
  const ipLimit = await rateLimit(env, 'checkout_ip', callerIp(request));
  if (!ipLimit.allowed) return tooMany(ipLimit, 'checkout attempts');
  const emailLimit = await rateLimit(env, 'checkout_email', await hashed(email));
  if (!emailLimit.allowed) return tooMany(emailLimit, 'checkout attempts');

  // Stripe first, and loudly. An unconfigured key must not produce a session URL
  // that 404s, and must not look like the participant did something wrong.
  const stripe = stripeState(env);
  if (!stripe.ready && !dryRun) {
    return json({ error: 'Checkout is not available yet', why: stripe.why, stripe_ready: false }, 503);
  }

  if (isContinuationKind(planKey)) {
    return continuationCheckout({ env, request, planKey, email, dryRun, stripeReady: stripe.ready });
  }
  if (isValidPlan(planKey)) {
    return programCheckout({ env, request, planKey, email, code, dryRun, stripeReady: stripe.ready });
  }
  return json({
    error: 'Unknown plan',
    program_options: Object.keys(PLANS),
    membership_options: Object.keys(CONTINUATION_PLANS),
  }, 400);
}

// ---------------------------------------------------------------------
// The ninety day program. A fixed total, billed as installments.
// ---------------------------------------------------------------------
async function programCheckout({ env, request, planKey, email, code, dryRun, stripeReady }) {
  // Only someone we have accepted can pay. Enrollment is uncapped, so the
  // accepted application is the gate and the only one.
  const apps = await supabase(env,
    `applications?email=eq.${encodeURIComponent(email)}&status=eq.accepted&select=id,name`);
  if (!apps.length) {
    return json({ error: 'We do not have an accepted application for that email' }, 403);
  }
  const application = apps[0];

  let listCents;
  try {
    ({ [KEYS.PROGRAM_PRICE_CENTS]: listCents } = await settings(env, KEYS.PROGRAM_PRICE_CENTS));
  } catch (e) {
    if (e instanceof SettingMissing) return json({ error: 'Price is not configured', why: e.message }, 503);
    throw e;
  }

  // The discount the owner created, if the code is still valid.
  //
  // checkout previously ignored discounts entirely, so a code the owner issued
  // would have been accepted by the portal and then charged at list price.
  //
  // Validated by the validate_discount function in the database, which is the
  // same one enroll.js calls. I first wrote a second validator here, against
  // columns named is_active, starts_on, expires_on, max_redemptions and
  // redeemed_count. The table's columns are revoked_at, valid_from, valid_to,
  // use_limit and times_used. Every test would have read undefined, so every
  // check would have passed, and an expired or exhausted code would have been
  // honoured. A validator that cannot fail is worse than none, because it looks
  // like protection. The use limit in particular has to be checked and
  // incremented in one statement, which only the database can do.
  // The client id when we have one. A person paying for the program often has no
  // profile row yet, only an accepted application, so null is legitimate here.
  // But validate_discount's one-per-person check cannot fire on a null client, so
  // passing null when a profile DOES exist would quote a second discount to
  // somebody who has already spent theirs.
  const known = await supabase(env,
    `profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
  const knownClientId = known && known.length ? known[0].id : null;

  let discount = null, discountName = null;
  if (code) {
    const v = await supabase(env, 'rpc/validate_discount', {
      method: 'POST',
      body: JSON.stringify({ p_code: code, p_client: knownClientId, p_target: 'program' }),
    });
    const vr = Array.isArray(v) ? v[0] : v;
    if (!vr || !vr.ok) {
      return json({ error: (vr && vr.reason) || 'That discount is not valid.', code,
                    discount_rejected: true }, 409);
    }
    discount = { kind: vr.kind, amount: vr.amount, name: vr.name };
    discountName = vr.name || code;
  }

  const q = quote({ planKey, listCents, discount });
  // The installments must still sum to the discounted total. Asserted rather
  // than trusted, because the failure is charging a real person the wrong money.
  if (!quoteBalances(q)) {
    return json({ error: 'Refusing to charge: the quote does not balance', quote: q }, 500);
  }

  const first = q.installments[0];
  const origin = new URL(request.url).origin;
  const metadata = {
    kind: 'program',
    plan: planKey,
    application_id: application.id,
    program_total_cents: String(q.charged_cents),
    installments: String(q.installments.length),
    discount_code: code || '',
    discount_name: discountName || '',
    discount_cents: String(q.discount_cents),
  };

  if (dryRun || !stripeReady) {
    return json({ ok: true, dry_run: true, stripe_ready: stripeReady, quote: q, metadata });
  }

  const client = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient(),
  });

  // TAX BEFORE THE SESSION, NOT AFTER. Ruled 2026-09-29: the program is $249.99
  // plus local tax in the participant's state. If tax cannot be calculated this
  // refuses, rather than creating a session that charges the bare price, because
  // an untaxed checkout looks exactly like a working one.
  const tax = taxState(env);
  if (!tax.ready) {
    return json({ error: 'checkout is not ready', detail: tax.note, missing: tax.missing }, 503);
  }

  const session = await client.checkout.sessions.create({
    mode: 'payment',
    customer_email: email,
    client_reference_id: application.id,
    // Stripe calculates tax from the address collected here. Our price is the
    // pre-tax amount and Stripe adds the line.
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    success_url: `${origin}/enrolled?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#apply`,
    metadata,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: first.amount_cents,
        product_data: {
          name: q.installments.length === 1
            ? 'The Human Battery Project: 90 day program'
            : `The Human Battery Project: 90 day program, payment 1 of ${q.installments.length}`,
          description: 'Includes bloodwork at day 0 and day 90.',
          // Whether a 90 day coaching program is taxable, and at what rate, is
          // decided by this code, and that is an accountant's decision.
          tax_code: env.STRIPE_TAX_CODE,
        },
      },
    }],
    // The card is saved so the later installments can be charged off session.
    // Without this the second payment has no payment method and the whole plan
    // silently becomes a single payment.
    payment_intent_data: {
      metadata,
      setup_future_usage: q.installments.length > 1 ? 'off_session' : undefined,
    },
  }, { idempotencyKey: `program:${application.id}:${planKey}:${q.charged_cents}` });

  return json({ url: session.url, id: session.id, quote: q });
}

// ---------------------------------------------------------------------
// Continuing membership. A subscription.
// ---------------------------------------------------------------------
async function continuationCheckout({ env, request, planKey, email, dryRun, stripeReady }) {
  const plan = CONTINUATION_PLANS[planKey];

  const profiles = await supabase(env,
    `profiles?email=eq.${encodeURIComponent(email)}&select=id`);
  if (!profiles.length) return json({ error: 'We do not have an account for that email' }, 403);
  const clientId = profiles[0].id;

  // Explicit subscription consent, required by D9, checked BEFORE a session
  // exists. A consent collected after the card is a consent collected after the
  // money.
  const doc = await supabase(env,
    `consent_documents?kind=eq.subscription&retired_at=is.null&select=id,version&limit=1`);
  const docId = doc && doc.length ? doc[0].id : null;
  const grants = docId ? await supabase(env,
    `client_consents?client_id=eq.${clientId}&document_id=eq.${docId}&granted=is.true&withdrawn_at=is.null&select=id&limit=1`) : [];
  const consentId = grants && grants.length ? grants[0].id : null;

  const existing = await supabase(env,
    `entitlements?client_id=eq.${clientId}&select=id,kind,status,effective_to,renews_on`);

  const decision = purchaseDecision({ kind: planKey, existing, consentGranted: !!consentId });
  if (!decision.allowed) {
    return json({
      error: decision.reason,
      needs_consent: !consentId,
      consent_document_version: doc && doc.length ? doc[0].version : null,
    }, 409);
  }

  let priceCents;
  try {
    const s = await settings(env, plan.setting);
    priceCents = s[plan.setting];
  } catch (e) {
    if (e instanceof SettingMissing) return json({ error: 'Price is not configured', why: e.message }, 503);
    throw e;
  }

  // When it starts, and when it renews, both stated. D9 requires the effective
  // date and the renewal date, and forbids silent conversion: the program
  // entitlement's end date is what continuation starts after, and buying early
  // does not move it earlier.
  const program = (existing || []).find((e) => e.kind === 'program');
  const today = new Date().toISOString().slice(0, 10);
  const dates = continuationDates(planKey, today, program ? program.effective_to : null);

  const disclosure = {
    amount_cents: priceCents,
    amount: '$' + (priceCents / 100).toFixed(2),
    every: dates.every,
    starts_on: dates.starts_on,
    first_charge_on: dates.first_charge_on,
    renews_on: dates.renews_on,
    cancel_any_time: true,
    statement: dates.statement,
  };

  const metadata = {
    kind: planKey,
    client_id: clientId,
    consent_id: consentId,
    price_cents: String(priceCents),
    starts_on: dates.starts_on,
    renews_on: dates.renews_on,
    replaces_entitlement: decision.must_close || '',
  };

  if (dryRun || !stripeReady) {
    return json({ ok: true, dry_run: true, stripe_ready: stripeReady,
                  as: decision.as, disclosure, metadata });
  }

  const client = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient(),
  });
  const origin = new URL(request.url).origin;

  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    success_url: `${origin}/portal/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/portal/billing`,
    metadata,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: priceCents,
        recurring: { interval: plan.interval, interval_count: plan.interval_count },
        product_data: { name: `The Human Battery Project: ${plan.label.toLowerCase()} membership` },
      },
    }],
    subscription_data: {
      metadata,
      // Bought before day 90. Nothing is charged until the program ends, which
      // is what "no silent conversion" means in dates rather than in words.
      ...(dates.bought_early
        ? { trial_end: Math.floor(new Date(dates.starts_on + 'T12:00:00Z').getTime() / 1000) }
        : {}),
    },
  }, { idempotencyKey: `continuation:${clientId}:${planKey}:${dates.starts_on}` });

  return json({ url: session.url, id: session.id, as: decision.as, disclosure });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
