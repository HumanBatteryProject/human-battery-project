// =====================================================================
// Shared payment configuration.
//
// The program fee is a FIXED TOTAL that ends at day 90. It is a payment
// plan, not a subscription. Billing it as a subscription would keep
// charging people after the program ends — the single most common way
// this gets built wrong.
//
// Implementation: Subscription Schedules with a fixed iteration count
// and end_behavior 'cancel'. Stripe stops on its own after the last
// installment. Nothing depends on us remembering to cancel.
// =====================================================================

export const CURRENCY = 'usd';

// Single source of truth. Must match cohorts.price_cents in the database.
export const PROGRAM_TOTAL_CENTS = 100000; // $1,000 — cohort 01 launch price

export const PLANS = {
  paid_in_full: {
    label: 'Paid in full',
    description: 'One payment when your seat is confirmed.',
    installments: 1,
    amount_cents: PROGRAM_TOTAL_CENTS,
    interval: null,
    mode: 'payment',
  },
  two_payments: {
    label: 'Two payments',
    description: '$500 today, $500 at day 30.',
    installments: 2,
    amount_cents: PROGRAM_TOTAL_CENTS / 2,
    interval: 'day',
    interval_count: 30,
    mode: 'subscription',
  },
  three_payments: {
    label: 'Three payments',
    // Billed on the client's day 30 and day 60, not on the 1st of the
    // month. Calendar billing means someone who starts on the 26th pays
    // again five days later, which forces proration and turns into
    // refund arguments. Relative billing has no edge case.
    description: '$333.33 now, then at day 30 and day 60.',
    installments: 3,
    amount_cents: Math.floor(PROGRAM_TOTAL_CENTS / 3),
    interval: 'day',
    interval_count: 30,
    mode: 'subscription',
  },
};

// $1,000 / 3 = $333.333..., so the final installment absorbs the
// remainder: 333.33 + 333.33 + 333.34 = exactly 1,000.00. Never bill
// three equal thirds of a price that doesn't divide — you end up a cent
// short and the books never reconcile.
export function installmentAmounts(planKey) {
  const plan = PLANS[planKey];
  const base = Math.floor(PROGRAM_TOTAL_CENTS / plan.installments);
  const amounts = Array(plan.installments).fill(base);
  amounts[amounts.length - 1] += PROGRAM_TOTAL_CENTS - base * plan.installments;
  return amounts;
}

export function isValidPlan(key) {
  return Object.prototype.hasOwnProperty.call(PLANS, key);
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Supabase REST helper. Uses the service key, which bypasses RLS — this
// runs server-side only and must never be exposed to the browser.
export async function supabase(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`supabase ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}
