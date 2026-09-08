// =====================================================================
// POST /api/checkout
//
// Creates a Stripe Checkout Session for one of the three payment shapes
// and returns the hosted URL. Prices are computed server-side from
// _payments.js — the client sends a plan key, never an amount.
// =====================================================================

import Stripe from 'stripe';
import { PLANS, CURRENCY, isValidPlan, installmentAmounts, json, supabase } from './_payments.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  const planKey = String(body.plan || '');
  const email = String(body.email || '').trim().toLowerCase();
  const cohortId = String(body.cohort_id || '');

  if (!isValidPlan(planKey)) return json({ error: 'Unknown plan' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Invalid email' }, 400);

  // Only someone we have accepted can pay. This is a twenty-seat cohort,
  // not an open shopping cart — an accepted application is the ticket.
  const apps = await supabase(
    env,
    `applications?email=eq.${encodeURIComponent(email)}&status=eq.accepted&select=id,name,cohort_id`
  );
  if (!apps.length) {
    return json({ error: 'We do not have an accepted application for that email' }, 403);
  }
  const application = apps[0];

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-07-29.dahlia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const plan = PLANS[planKey];
  const amounts = installmentAmounts(planKey);
  const origin = new URL(request.url).origin;

  const common = {
    customer_email: email,
    client_reference_id: application.id,
    success_url: `${origin}/enrolled?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#apply`,
    metadata: {
      plan: planKey,
      application_id: application.id,
      cohort_id: cohortId || application.cohort_id || '',
      program_total_cents: String(amounts.reduce((a, b) => a + b, 0)),
    },
  };

  let session;

  if (plan.mode === 'payment') {
    session = await stripe.checkout.sessions.create({
      ...common,
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: amounts[0],
            product_data: {
              name: 'The Human Battery Project: 90 day program',
              description: 'Includes bloodwork at day 0 and day 90.',
            },
          },
        },
      ],
      payment_intent_data: { metadata: common.metadata },
    });
  } else {
    // Installments. A recurring price with a fixed iteration count, so
    // Stripe stops charging on its own after the final payment.
    session = await stripe.checkout.sessions.create({
      ...common,
      mode: 'subscription',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: amounts[0],
            recurring: {
              interval: plan.interval,
              interval_count: plan.interval_count,
            },
            product_data: {
              name: `The Human Battery Project: ${plan.installments} payments`,
            },
          },
        },
      ],
      subscription_data: { metadata: common.metadata },
    });
  }

  return json({ url: session.url, id: session.id });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
