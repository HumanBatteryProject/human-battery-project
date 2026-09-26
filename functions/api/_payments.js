// =====================================================================
// Shared payment configuration.
//
// The program fee is a FIXED TOTAL that ends at day 90. It is a payment
// plan, not a subscription. Billing it as a subscription would keep
// charging people after the program ends, the single most common way
// this gets built wrong.
//
// Implementation: Subscription Schedules with a fixed iteration count
// and end_behavior 'cancel'. Stripe stops on its own after the last
// installment. Nothing depends on us remembering to cancel.
// =====================================================================

export const CURRENCY = 'usd';

// Single source of truth. Must match cohorts.price_cents in the database.
export const PROGRAM_TOTAL_CENTS = 100000; // $1,000. Lives here rather than in program_settings only because Stripe needs it at request time.

// The three options, confirmed 26 September. All three are the SAME $1,000; only
// the timing differs. Day 1 is the participant's start date, so Day N is
// day_zero + (N - 1) days.
//
// WHY THE DAY NUMBERS ARE HERE AND NOT AN INTERVAL. The old version billed every
// 30 days, which is not what was asked for: two payments fall on Day 1 and Day
// 45, which is 44 days apart, and three fall on Day 1, 31 and 61, which is 30.
// One of those is not a uniform interval, so a Stripe interval_count cannot
// express both and would have quietly produced the wrong date for one option.
// Explicit day numbers cannot be wrong by a fortnight.
export const PLANS = {
  paid_in_full: {
    label: 'Pay in full',
    installments: 1,
    days: [1],
  },
  two_payments: {
    label: 'Two payments',
    installments: 2,
    days: [1, 45],
  },
  three_payments: {
    label: 'Three payments',
    installments: 3,
    days: [1, 31, 61],
  },
};

// $1,000 / 3 = $333.333..., so the FINAL installment absorbs the remainder:
// 333.33 + 333.33 + 333.34 = exactly 1,000.00. Never bill three equal thirds of
// a price that does not divide, or the books are a cent short forever.
export function installmentAmounts(planKey) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`unknown plan: ${planKey}`);
  const base = Math.floor(PROGRAM_TOTAL_CENTS / plan.installments);
  const amounts = Array(plan.installments).fill(base);
  amounts[amounts.length - 1] += PROGRAM_TOTAL_CENTS - base * plan.installments;
  return amounts;
}

/**
 * The full schedule for a plan, as rows ready for the payments table.
 *
 * dayZero is the participant's start date as YYYY-MM-DD. Dates are computed in
 * plain date arithmetic at midday UTC, then truncated, which keeps a due date on
 * the intended calendar day regardless of the participant's offset. The
 * participant's timezone decides WHEN on that day the charge runs, and that is
 * the billing job's business, not this function's.
 *
 * @returns {{installment_no:number, amount_cents:number, due_on:string, program_day:number}[]}
 */
export function installmentSchedule(planKey, dayZero) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`unknown plan: ${planKey}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayZero || ''))) {
    throw new Error(`day zero must be YYYY-MM-DD, got ${JSON.stringify(dayZero)}`);
  }
  const amounts = installmentAmounts(planKey);
  return plan.days.map((programDay, i) => {
    const d = new Date(dayZero + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + (programDay - 1));   // Day 1 IS day zero
    return {
      installment_no: i + 1,
      amount_cents: amounts[i],
      due_on: d.toISOString().slice(0, 10),
      program_day: programDay,
    };
  });
}

// What checkout and the billing portal show. Money formatted in exactly one
// place, so two surfaces cannot disagree about a price.
export function money(cents) {
  return '$' + (cents / 100).toLocaleString('en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function planSummary(planKey, dayZero) {
  const plan = PLANS[planKey];
  const rows = dayZero ? installmentSchedule(planKey, dayZero) : null;
  const amounts = installmentAmounts(planKey);
  return {
    key: planKey,
    label: plan.label,
    total_cents: PROGRAM_TOTAL_CENTS,
    total: money(PROGRAM_TOTAL_CENTS),
    installments: plan.installments,
    schedule: (rows || plan.days.map((d, i) => ({ program_day: d, amount_cents: amounts[i] })))
      .map((r) => ({
        installment_no: r.installment_no || (plan.days.indexOf(r.program_day) + 1),
        program_day: r.program_day,
        amount_cents: r.amount_cents,
        amount: money(r.amount_cents),
        due_on: r.due_on || null,
      })),
  };
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

// Supabase REST helper. Uses the service key, which bypasses RLS. This
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

  // Prefer: return=minimal answers a POST with 201 and an empty body, not
  // 204. Testing only for 204 sent that empty body to res.json(), which
  // threw 'Unexpected end of JSON input' after the write had already
  // succeeded. The caller then saw a failure for a row that exists, which
  // is the worst shape of bug: the retry writes it twice.
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`supabase ${res.status}: body was not JSON: ${text.slice(0, 200)}`);
  }
}
