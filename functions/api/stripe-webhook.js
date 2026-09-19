// =====================================================================
// POST /api/stripe-webhook
//
// Stripe is the source of truth. This mirrors what happened into the
// payments table so the admin console and the client portal can read it
// without calling Stripe on every page load.
//
// Two things that are easy to get wrong and are handled here:
//
//   1. constructEventAsync, not constructEvent. Cloudflare Workers use
//      Web Crypto, which is async. The synchronous version silently
//      fails in this runtime.
//
//   2. Installment cutoff. A subscription-mode plan must stop after N
//      payments. We count paid invoices and cancel the subscription on
//      the last one, so nobody gets charged a fourth time.
// =====================================================================

import Stripe from 'stripe';
import { PLANS, json, supabase } from './_payments.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-07-29.dahlia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider()
    );
  } catch (err) {
    console.error('signature verification failed', err.message);
    return json({ error: 'Invalid signature' }, 400);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(env, stripe, event.data.object);
        break;

      case 'invoice.paid':
        await onInvoicePaid(env, stripe, event.data.object);
        break;

      case 'invoice.payment_failed':
        await onInvoiceFailed(env, event.data.object);
        break;

      case 'charge.refunded':
        await onRefund(env, event.data.object);
        break;

      default:
        // Unhandled types are acknowledged, not errored, because otherwise
        // Stripe retries them forever.
        break;
    }
  } catch (err) {
    console.error('handler failed', event.type, err.message);
    // 500 tells Stripe to retry. Correct for transient failures.
    return json({ error: 'Handler failed' }, 500);
  }

  return json({ received: true });
}

// ---------------------------------------------------------------------

async function onCheckoutCompleted(env, stripe, session) {
  const meta = session.metadata || {};
  const planKey = meta.plan;
  const plan = PLANS[planKey];
  if (!plan) return;

  const clientId = await resolveClient(env, session.customer_details?.email || session.customer_email, meta);

  const membershipId = await enrolMembership(env, clientId, meta);

  // The onboarding agent places them, writes the welcome email and the
  // first brief. It calls Anthropic twice and sends mail, which is far
  // longer than Stripe is willing to wait: a slow 200 here is retried, and
  // a retry would run the agent again. So it is handed to waitUntil and
  // the webhook answers immediately. The agent is idempotent on
  // memberships.onboarded_at in case a retry beats it anyway.
  if (membershipId) {
    const run = triggerOnboarding(env, request, membershipId);
    if (context.waitUntil) context.waitUntil(run); else await run;
  }

  // Mark the application converted.

  if (meta.application_id) {
    await supabase(env, `applications?id=eq.${meta.application_id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'enrolled',
        converted_client_id: clientId || null,
      }),
    });
  }

  if (plan.mode === 'payment') {
    await upsertPayment(env, {
      client_id: clientId,
      plan: planKey,
      installment_no: 1,
      amount_cents: session.amount_total,
      status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent: session.payment_intent,
      stripe_customer: session.customer,
      stripe_checkout_session: session.id,
    });
  } else {
    // Pre-create the installment rows as pending so the schedule is
    // visible to the client and to the admin console immediately.
    for (let i = 1; i <= plan.installments; i++) {
      await upsertPayment(env, {
        client_id: clientId,
        plan: planKey,
        installment_no: i,
        amount_cents: plan.amount_cents,
        status: 'pending',
        stripe_customer: session.customer,
        stripe_subscription: session.subscription,
        stripe_checkout_session: session.id,
      });
    }
  }
}

async function onInvoicePaid(env, stripe, invoice) {
  if (!invoice.subscription) return;

  const sub = await stripe.subscriptions.retrieve(invoice.subscription);
  const planKey = sub.metadata?.plan;
  const plan = PLANS[planKey];
  if (!plan) return;

  // Which installment is this? Count how many invoices have been paid.
  const invoices = await stripe.invoices.list({
    subscription: invoice.subscription,
    status: 'paid',
    limit: 10,
  });
  const installmentNo = invoices.data.length;

  const clientId = await resolveClient(env, invoice.customer_email, sub.metadata || {});

  await upsertPayment(env, {
    client_id: clientId,
    plan: planKey,
    installment_no: installmentNo,
    amount_cents: invoice.amount_paid,
    status: 'paid',
    paid_at: new Date().toISOString(),
    stripe_payment_intent: invoice.payment_intent,
    stripe_customer: invoice.customer,
    stripe_subscription: invoice.subscription,
  });

  // Fixed total, not a subscription. Stop after the final installment.
  if (installmentNo >= plan.installments) {
    await stripe.subscriptions.cancel(invoice.subscription);
  }
}

async function onInvoiceFailed(env, invoice) {
  if (!invoice.subscription) return;
  await supabase(env, `payments?stripe_subscription=eq.${invoice.subscription}&status=eq.pending`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'failed',
      failure_reason: invoice.last_finalization_error?.message || 'Payment failed',
    }),
  });
}

async function onRefund(env, charge) {
  if (!charge.payment_intent) return;
  await supabase(env, `payments?stripe_payment_intent=eq.${charge.payment_intent}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'refunded' }),
  });
}

// ---------------------------------------------------------------------

// Open enrollment. The clock starts at the next wave, the 1st or the 15th,
// never before first_wave_date. next_wave_date() owns that rule so it can
// change in program_settings without a deploy.
async function enrolMembership(env, clientId, meta) {
  if (!clientId) return null;

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
    console.error('[webhook] next_wave_date failed', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const dayZero = await res.json();

  // memberships.cohort_id is still required, so the membership joins the
  // wave whose start date matches. The wave caps nothing.
  const waves = await supabase(env, `cohorts?starts_on=eq.${dayZero}&select=id&limit=1`);
  if (!waves.length) {
    console.error(`[webhook] no wave row for ${dayZero}. Run create_waves().`);
    return null;
  }

  const existing = await supabase(
    env,
    `memberships?client_id=eq.${clientId}&select=id&order=created_at.desc&limit=1`
  );

  const patch = { status: 'enrolled', day_zero: dayZero };
  if (meta.tier) patch.tier = meta.tier;

  if (existing.length) {
    await supabase(env, `memberships?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    console.log(`[webhook] membership ${existing[0].id} enrolled, day_zero ${dayZero}`);
    return existing[0].id;
  }

  const created = await supabase(env, 'memberships', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ client_id: clientId, cohort_id: waves[0].id, cycle: 1, ...patch }),
  });
  const id = created && created.length ? created[0].id : null;
  console.log(`[webhook] membership ${id} created for ${clientId}, day_zero ${dayZero}`);
  return id;
}

// Calls the agent over HTTP rather than importing it, so the agent has one
// entry point and one auth check whether the caller is this webhook or a
// staff member re-running it.
async function triggerOnboarding(env, request, membershipId) {
  if (!env.WEBHOOK_SECRET) {
    console.error(`[webhook] WEBHOOK_SECRET is not set, so onboarding did not run for ${membershipId}`);
    return;
  }
  const origin = new URL(request.url).origin;
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

async function resolveClient(env, email, meta) {
  if (!email) return null;
  const rows = await supabase(
    env,
    `profiles?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`
  );
  return rows.length ? rows[0].id : null;
}

async function upsertPayment(env, row) {
  await supabase(env, 'payments?on_conflict=stripe_checkout_session,installment_no', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
