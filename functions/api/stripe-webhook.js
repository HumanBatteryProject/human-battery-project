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

export async function onRequestPost({ request, env }) {
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
        // Unhandled types are acknowledged, not errored — otherwise
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
