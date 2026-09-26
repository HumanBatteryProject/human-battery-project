// =====================================================================
// POST /api/stripe-webhook
//
// Stripe is the source of truth. This mirrors what happened into our own tables
// so the portal and the admin console can read it without calling Stripe.
//
// FOUR THINGS THE PREVIOUS VERSION GOT WRONG, all found by reading it rather
// than by running it, because none of them could ever have run:
//
//   1. onCheckoutCompleted referenced `request` and `context`, neither of which
//      was a parameter. A ReferenceError on EVERY paid checkout, thrown after the
//      membership was created and before the payment was recorded. The handler
//      returned 500, so Stripe retried forever, and each retry enrolled again.
//      A paying customer would have got a membership, no payment record, no
//      onboarding, and an unbounded retry loop.
//
//   2. It branched on plan.mode === 'payment'. There is no `mode` in PLANS, so
//      the comparison was always false and every plan took the subscription
//      branch. It then read plan.amount_cents, which also does not exist, and
//      wrote payment rows with amount_cents undefined.
//
//   3. webhook_events existed as a table with a unique index on
//      (provider, event_id) and NOTHING WROTE TO IT. There was no duplicate
//      protection of any kind. Stripe retries on any non-2xx and re-sends on
//      redelivery, so this was not a theoretical gap.
//
//   4. onInvoiceFailed patched every pending payment for the subscription, so one
//      failed installment marked the remaining installments failed too, which
//      would offer a weekly recovery plan for money that was never attempted.
//
// HOW DUPLICATES AND ORDER ARE HANDLED NOW. Every event is claimed in
// webhook_events BEFORE it is processed, by inserting its id. The unique index
// makes the second insert fail, and a failed claim means somebody else has it:
// we acknowledge and do nothing. Claiming before working is the same discipline
// the brief cost leak needed, and for the same reason: the expensive, effectful
// part must sit behind the claim, not in front of it.
//
// Order is decided by event.created, the provider's clock, never by arrival.
// =====================================================================

import Stripe from 'stripe';
import { json, supabase } from './_payments.js';
import { isHandled, isStale, eventIso, sessionIntent } from './_webhook.js';
import { isContinuationKind, continuationDates, addDays } from './_continuation.js';
import { stripeState } from './enroll.js';

const PROVIDER = 'stripe';
const API_VERSION = '2026-07-29.dahlia';

export async function onRequestPost(context) {
  const { request, env } = context;

  // CHECK THE CONFIGURATION BEFORE CONSTRUCTING ANYTHING.
  //
  // Found by posting a signed event at the live deployment and getting a
  // Cloudflare error page instead of JSON. Cloudflare Pages holds four secrets
  // and none of them is a Stripe one, so env.STRIPE_SECRET_KEY is undefined in
  // production, and new Stripe(undefined) throws "Neither apiKey nor
  // config.authenticator provided". That throw sat above the try block, so it
  // escaped the handler entirely: error 1101, a worker exception, with no
  // indication of what was wrong.
  //
  // It matters more than an unhelpful error page. Stripe treats any non-2xx as
  // retryable and re-sends for days, so the shape of this failure was an
  // unbounded retry loop against an endpoint that could never succeed, with
  // nothing in the response to say why.
  const ready = stripeState(env);
  if (!ready.ready) {
    console.error('[webhook] refusing: ' + ready.why);
    return json({ error: 'Stripe is not configured', why: ready.why, stripe_ready: false }, 503);
  }

  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();

  // Verify before anything else. An unverified body is an untrusted string and
  // must not reach the database, not even as a recorded event.
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient(),
  });

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload, signature, env.STRIPE_WEBHOOK_SECRET,
      undefined, Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    // constructEventAsync, not constructEvent: Workers use Web Crypto, which is
    // async, and the synchronous version fails silently in this runtime.
    console.error('[webhook] signature verification failed:', err.message);
    return json({ error: 'Invalid signature' }, 400);
  }

  // ---- claim the event, then work ----
  const claim = await claimEvent(env, event);
  if (!claim.claimed) {
    console.log(`[webhook] ${event.id} ${event.type}: ${claim.why}`);
    return json({ received: true, duplicate: true, why: claim.why });
  }

  if (!isHandled(event.type)) {
    await finishEvent(env, event.id, 'ignored', null);
    return json({ received: true, handled: false });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(context, env, stripe, event);
        break;
      case 'payment_intent.succeeded':
        await onPaymentSucceeded(env, event);
        break;
      case 'invoice.paid':
        await onInvoicePaid(env, stripe, event);
        break;
      case 'invoice.payment_failed':
        await onInvoiceFailed(env, event);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await onSubscriptionChanged(env, event);
        break;
      case 'charge.refunded':
        await onRefund(env, event);
        break;
    }
    await finishEvent(env, event.id, 'processed', null);
  } catch (err) {
    const why = String(err && err.message || err).slice(0, 400);
    console.error('[webhook] handler failed', event.type, why);
    // Released rather than marked processed, so Stripe's retry can claim it
    // again. A failure that stays claimed is an event nobody will ever process.
    await releaseEvent(env, event.id, why);
    return json({ error: 'Handler failed' }, 500);
  }

  return json({ received: true, handled: true });
}

// ---------------------------------------------------------------------
// The claim
// ---------------------------------------------------------------------
async function claimEvent(env, event) {
  try {
    await supabase(env, 'webhook_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        provider: PROVIDER,
        event_id: event.id,
        event_type: event.type,
        created_at_provider: eventIso(event.created),
        // 'received' IS the claim, and the table already had the word. I first
        // wrote 'claimed', which webhook_events_status_check refused: the allowed
        // set is received, processed, ignored, failed. The concept was already
        // named and I invented a second name for it.
        status: 'received',
        payload: event,
      }),
    });
    return { claimed: true };
  } catch (e) {
    const msg = String(e.message || e);
    // 23505 is the unique violation on (provider, event_id): somebody has this
    // event already. That is the duplicate case and it is a success, not an error.
    if (/duplicate key|23505/.test(msg)) {
      return { claimed: false, why: 'already recorded, so this is a replay' };
    }
    throw e;
  }
}

async function finishEvent(env, eventId, status, error) {
  await supabase(env, `webhook_events?provider=eq.${PROVIDER}&event_id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status, processed_at: new Date().toISOString(), error }),
  });
}

async function releaseEvent(env, eventId, error) {
  // Delete rather than mark failed. The row exists to make a retry a duplicate;
  // if the work did not happen, the retry must NOT be treated as one.
  try {
    await supabase(env, `webhook_events?provider=eq.${PROVIDER}&event_id=eq.${encodeURIComponent(eventId)}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
  } catch (e) {
    console.error('[webhook] could not release', eventId, String(e.message || e));
  }
  console.error(`[webhook] released ${eventId} for retry: ${error}`);
}

// ---------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------
async function onCheckoutCompleted(context, env, stripe, event) {
  const session = event.data.object;
  const intent = sessionIntent(session);

  if (intent.kind === 'unknown') {
    // Money arrived and this code cannot tell what for. Recorded loudly and NOT
    // interpreted: guessing would be inventing an entitlement.
    throw new Error(`unrecognised checkout session ${session.id}: ${intent.why}`);
  }

  if (isContinuationKind(intent.kind)) {
    await grantContinuation(env, event, session, intent);
    return;
  }

  // ---- the program ----
  const email = session.customer_details?.email || session.customer_email;
  const clientId = await resolveClient(env, email);
  if (!clientId) throw new Error(`no profile for ${email}, so no membership can be created`);

  const membershipId = await enrolMembership(env, clientId, session);
  if (!membershipId) throw new Error('membership was not created');

  // One program entitlement, ending at day 90. The database refuses a second,
  // so a replay that got past the claim still cannot produce two.
  await grantProgram(env, event, clientId, membershipId, intent, session);

  if (intent.application_id) {
    await supabase(env, `applications?id=eq.${intent.application_id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'enrolled', converted_client_id: clientId }),
    });
  }

  // Installment 1 was charged at checkout. The rest are scheduled as pending for
  // billing-run.js to charge off session on their due dates.
  await recordFirstPayment(env, clientId, membershipId, intent, session);

  // The onboarding agent calls Anthropic twice and sends mail, which takes far
  // longer than Stripe will wait. A slow 200 is retried, and a retry would run
  // the agent again, so it is handed to waitUntil and the webhook answers now.
  // The agent is idempotent on memberships.onboarded_at.
  const run = triggerOnboarding(env, request_origin(context), membershipId);
  if (context.waitUntil) context.waitUntil(run); else await run;
}

// The origin, read from the request that this function actually received. The
// previous version referenced a `request` that was not in scope, which is the
// ReferenceError that broke every paid checkout.
function request_origin(context) {
  return new URL(context.request.url).origin;
}

async function grantProgram(env, event, clientId, membershipId, intent, session) {
  const existing = await supabase(env,
    `entitlements?client_id=eq.${clientId}&kind=eq.program&select=id,status&limit=1`);
  if (existing && existing.length) {
    console.log(`[webhook] program entitlement already exists for ${clientId}, not creating a second`);
    return existing[0].id;
  }
  const membership = await supabase(env, `memberships?id=eq.${membershipId}&select=day_zero&limit=1`);
  const dayZero = membership && membership.length ? membership[0].day_zero : null;

  const rows = await supabase(env, 'entitlements', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      client_id: clientId, membership_id: membershipId, kind: 'program',
      status: 'active',
      effective_from: dayZero,
      // Day 1 is day zero, so day 90 is day_zero + 89.
      effective_to: dayZero ? addDays(dayZero, 89) : null,
      stripe_customer: session.customer || null,
      last_event_at: eventIso(event.created),
    }),
  });
  return rows && rows.length ? rows[0].id : null;
}

async function grantContinuation(env, event, session, intent) {
  const clientId = intent.client_id || await resolveClient(env,
    session.customer_details?.email || session.customer_email);
  if (!clientId) throw new Error('continuation checkout with no client');
  if (!intent.price_cents) throw new Error('continuation checkout with no price in metadata');

  // A plan change closes the old plan in the same operation. Leaving it open is
  // exactly the double billing D9 asks to prevent, and the partial unique index
  // would refuse the new row anyway, so this is the ordering that makes a switch
  // possible at all.
  if (intent.replaces_entitlement) {
    await supabase(env, `entitlements?id=eq.${intent.replaces_entitlement}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'cancelled', cancelled_at: new Date().toISOString(),
        cancel_at_period_end: false,
        suspended_reason: null,
      }),
    });
  }

  const existing = await supabase(env,
    `entitlements?client_id=eq.${clientId}&kind=eq.${intent.kind}&status=in.(active,suspended)&select=id&limit=1`);
  if (existing && existing.length) {
    console.log(`[webhook] continuation already active for ${clientId}, not creating a second`);
    return;
  }

  await supabase(env, 'entitlements', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      client_id: clientId, kind: intent.kind, status: 'active',
      effective_from: intent.starts_on,
      renews_on: intent.renews_on,
      // The price they agreed to, stored here rather than read from settings
      // later, so raising the fee cannot rewrite an existing agreement.
      price_cents: intent.price_cents,
      consent_id: intent.consent_id || null,
      previous_entitlement_id: intent.replaces_entitlement || null,
      stripe_subscription: session.subscription || null,
      stripe_customer: session.customer || null,
      last_event_at: eventIso(event.created),
    }),
  });

  await supabase(env, 'audit_log', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_id: null, action: 'continuation.started', table_name: 'entitlements',
      subject_id: clientId,
      detail: { kind: intent.kind, price_cents: intent.price_cents,
                starts_on: intent.starts_on, renews_on: intent.renews_on,
                replaced: intent.replaces_entitlement || null, by: 'stripe-webhook' },
    }),
  });
}

async function recordFirstPayment(env, clientId, membershipId, intent, session) {
  // MARK PAID, do not insert.
  //
  // enroll.js already wrote the whole installment schedule as pending rows, and
  // payments_one_per_installment is unique on (client_id, plan, installment_no)
  // where weekly_plan_id is null. So an insert here always collides with the row
  // that is supposed to be updated.
  //
  // Nor can that be papered over with on_conflict. I tried
  // on_conflict=client_id,plan,installment_no and Postgres refused outright:
  // "there is no unique or exclusion constraint matching the ON CONFLICT
  // specification", because that index is PARTIAL and a conflict target cannot be
  // inferred from a partial index without repeating its predicate. Using
  // (stripe_checkout_session, installment_no) instead, which is a full index,
  // merely moves the collision: the scheduled row has no checkout session, so the
  // upsert inserts and then violates the other index. Proved both against the
  // live database rather than reasoned about.
  const scheduled = await supabase(env,
    `payments?client_id=eq.${clientId}&plan=eq.${intent.plan}&installment_no=eq.1` +
    `&weekly_plan_id=is.null&select=id,status&limit=1`);

  const paidFields = {
    status: 'paid',
    paid_at: new Date().toISOString(),
    amount_cents: session.amount_total,
    stripe_payment_intent: session.payment_intent || null,
    stripe_customer: session.customer || null,
    stripe_checkout_session: session.id,
    failure_reason: null,
  };

  if (scheduled && scheduled.length) {
    if (scheduled[0].status === 'paid') return;   // a replay that got this far
    await supabase(env, `payments?id=eq.${scheduled[0].id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(paidFields),
    });
    return;
  }

  // No schedule exists, which means enroll.js has not run for this person. The
  // payment is still real and must be recorded rather than dropped.
  console.error(`[webhook] no scheduled installment 1 for ${clientId} on ${intent.plan}, recording the payment on its own`);
  await supabase(env, 'payments', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      client_id: clientId, membership_id: membershipId, plan: intent.plan,
      installment_no: 1, currency: 'usd', ...paidFields,
    }),
  });
}

// ---------------------------------------------------------------------
// payment_intent.succeeded: the off session installment charges
// ---------------------------------------------------------------------
async function onPaymentSucceeded(env, event) {
  const pi = event.data.object;
  const rows = await supabase(env,
    `payments?stripe_payment_intent=eq.${encodeURIComponent(pi.id)}&select=id,status&limit=1`);
  if (!rows || !rows.length) return;      // not ours, or recorded already
  if (rows[0].status === 'paid') return;
  await supabase(env, `payments?id=eq.${rows[0].id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), failure_reason: null }),
  });
}

// ---------------------------------------------------------------------
// invoice.paid: a continuation renewal
// ---------------------------------------------------------------------
async function onInvoicePaid(env, stripe, event) {
  const invoice = event.data.object;
  const subscription = subscriptionOf(invoice);
  if (!subscription) return;

  const ents = await supabase(env,
    `entitlements?stripe_subscription=eq.${encodeURIComponent(subscription)}&select=id,kind,renews_on,last_event_at,status&limit=1`);
  if (!ents || !ents.length) return;
  const ent = ents[0];

  if (isStale(ent.last_event_at, event.created)) {
    console.log(`[webhook] ${event.id} is older than the last event applied to ${ent.id}, ignoring`);
    return;
  }

  const paidTo = invoicePeriodEnd(invoice);
  await supabase(env, `entitlements?id=eq.${ent.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'active',
      renews_on: paidTo || ent.renews_on,
      suspended_at: null, suspended_reason: null,
      last_event_at: eventIso(event.created),
    }),
  });
}

async function onInvoiceFailed(env, event) {
  const invoice = event.data.object;
  const subscription = subscriptionOf(invoice);
  if (!subscription) return;

  const ents = await supabase(env,
    `entitlements?stripe_subscription=eq.${encodeURIComponent(subscription)}&select=id,last_event_at&limit=1`);
  if (!ents || !ents.length) return;
  const ent = ents[0];
  if (isStale(ent.last_event_at, event.created)) return;

  // Suspended, not cancelled, and not deleted. Suspension is reversible and the
  // ruling is explicit that it is not deletion.
  await supabase(env, `entitlements?id=eq.${ent.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'suspended',
      suspended_at: new Date().toISOString(),
      suspended_reason: 'membership payment failed',
      last_event_at: eventIso(event.created),
    }),
  });
}

// ---------------------------------------------------------------------
// subscription updated or deleted
// ---------------------------------------------------------------------
async function onSubscriptionChanged(env, event) {
  const sub = event.data.object;
  const ents = await supabase(env,
    `entitlements?stripe_subscription=eq.${encodeURIComponent(sub.id)}&select=id,last_event_at,renews_on&limit=1`);
  if (!ents || !ents.length) return;
  const ent = ents[0];

  // The out-of-order case this exists for: a cancellation created at 10:00 and a
  // renewal created at 09:59 can arrive in either order. Arrival order would
  // resurrect the cancelled subscription and charge somebody who had stopped.
  if (isStale(ent.last_event_at, event.created)) {
    console.log(`[webhook] ${event.id} (${event.type}) is stale for ${ent.id}, ignoring`);
    return;
  }

  const patch = { last_event_at: eventIso(event.created) };

  if (event.type === 'customer.subscription.deleted' || sub.status === 'canceled') {
    patch.status = 'cancelled';
    patch.cancelled_at = new Date().toISOString();
    patch.cancel_at_period_end = false;
    // Access to the end of the period already paid for.
    const end = periodEnd(sub);
    patch.access_until = end ? addDays(end, -1) : null;
  } else if (sub.cancel_at_period_end) {
    // Still active, still paid, but it will not renew. Access does NOT stop now.
    patch.cancel_at_period_end = true;
    const end = periodEnd(sub);
    if (end) { patch.renews_on = end; patch.access_until = addDays(end, -1); }
  } else if (sub.status === 'active') {
    patch.status = 'active';
    patch.cancel_at_period_end = false;
    const end = periodEnd(sub);
    if (end) patch.renews_on = end;
  } else if (sub.status === 'past_due' || sub.status === 'unpaid') {
    patch.status = 'suspended';
    patch.suspended_at = new Date().toISOString();
    patch.suspended_reason = `membership subscription is ${sub.status}`;
  }

  await supabase(env, `entitlements?id=eq.${ent.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
  });
}

async function onRefund(env, event) {
  const charge = event.data.object;
  if (!charge.payment_intent) return;
  await supabase(env, `payments?stripe_payment_intent=eq.${encodeURIComponent(charge.payment_intent)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'refunded' }),
  });
}

// ---------------------------------------------------------------------
// Shapes that moved between Stripe API versions. Read both, prefer the new one.
// ---------------------------------------------------------------------
function subscriptionOf(invoice) {
  if (!invoice) return null;
  // Recent API versions moved this under parent.subscription_details. Reading
  // only invoice.subscription would silently return null on a newer version and
  // every renewal would be ignored.
  return invoice.subscription
    || invoice.parent?.subscription_details?.subscription
    || null;
}

function periodEnd(sub) {
  const secs = sub?.current_period_end
    || sub?.items?.data?.[0]?.current_period_end
    || null;
  return secs ? new Date(Number(secs) * 1000).toISOString().slice(0, 10) : null;
}

function invoicePeriodEnd(invoice) {
  const secs = invoice?.lines?.data?.[0]?.period?.end || null;
  return secs ? new Date(Number(secs) * 1000).toISOString().slice(0, 10) : null;
}

// ---------------------------------------------------------------------
async function enrolMembership(env, clientId, session) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/next_wave_date`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`next_wave_date failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const dayZero = await res.json();
  if (!dayZero) throw new Error('no start date available for enrolment');

  // No cohort. Removed in 061: every participant is an N of 1, and a membership
  // belongs to a person, a start date and a cycle number.
  const existing = await supabase(env,
    `memberships?client_id=eq.${clientId}&select=id&order=created_at.desc&limit=1`);

  const patch = { status: 'enrolled', day_zero: dayZero };
  if (session.metadata?.tier) patch.tier = session.metadata.tier;

  if (existing.length) {
    await supabase(env, `memberships?id=eq.${existing[0].id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    });
    return existing[0].id;
  }
  const created = await supabase(env, 'memberships', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ client_id: clientId, cycle: 1, ...patch }),
  });
  return created && created.length ? created[0].id : null;
}

async function triggerOnboarding(env, origin, membershipId) {
  if (!env.WEBHOOK_SECRET) {
    console.error(`[webhook] WEBHOOK_SECRET is not set, so onboarding did not run for ${membershipId}`);
    return;
  }
  try {
    const res = await fetch(`${origin}/api/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hbp-secret': env.WEBHOOK_SECRET },
      body: JSON.stringify({ membership_id: membershipId }),
    });
    const detail = (await res.text()).slice(0, 300);
    if (res.ok) console.log(`[webhook] onboarding ${membershipId}: ${detail}`);
    else console.error(`[webhook] ONBOARDING FAILED ${membershipId}: HTTP ${res.status} ${detail}`);
  } catch (e) {
    console.error(`[webhook] ONBOARDING THREW for ${membershipId}: ${(e && e.message) || e}`);
  }
}

async function resolveClient(env, email) {
  if (!email) return null;
  const rows = await supabase(env,
    `profiles?email=eq.${encodeURIComponent(String(email).toLowerCase())}&select=id&limit=1`);
  return rows.length ? rows[0].id : null;
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
