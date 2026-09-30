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
export const PROGRAM_TOTAL_CENTS = 24999; // $249.99. Lives here rather than in program_settings only because Stripe needs it at request time.

// TAX IS NOT IN THE TOTAL. The program is $249.99 plus whatever sales tax the
// participant's own state charges, so the number above is the pre-tax price and
// every surface that shows it has to say "plus tax". Tax is calculated by Stripe
// at checkout from the address the participant enters, never by us: a rate table
// in this repository would be stale the first time a state changed one.
// See functions/api/_tax.js.

// The two options. Both are the SAME $249.99 before tax; only the timing differs.
// Day 1 is the participant's start date, so Day N is day_zero + (N - 1) days.
//
// WHY THE DAY NUMBERS ARE HERE AND NOT AN INTERVAL. The old version billed every
// 30 days, which is not what was asked for: two payments fall on Day 1 and Day
// 45, which is 44 days apart. Explicit day numbers cannot be wrong by a
// fortnight.
//
// THREE PAYMENTS WAS REMOVED on 2026-09-29 with the price change. The new pricing
// names two options and only two. No participant was on the third: the only
// payment row in the database belongs to the internal member.
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
};

// Splitting a total that does not divide. Each installment is the total divided
// by the count, ROUNDED, and the last one absorbs whatever is left over, which
// may be a cent less or a cent more.
//
// WHY ROUNDED AND NOT FLOORED. Both answers were ruled explicitly, and only
// rounding gives both:
//   $249.99 over 2  ->  125.00, 124.99   (floor gives 124.99, 125.00)
//   $199.99 over 2  ->  100.00,  99.99   (the 20 percent discount case)
// Flooring would move the odd cent from the last installment to the first, which
// is a schedule a cent different from the one that was ruled.
//
// NOTE ON THE HEADLINE. Two payments of $124.99 would total $249.98, a cent under
// the $249.99 price. The total is what was ruled, so the first installment
// carries the odd cent and the schedule is $125.00 then $124.99.
//
// totalCents is a parameter so a discounted total splits by the same rule. Two
// different splitters, one for list price and one for discounted, is how the
// installments stop summing to what was agreed.
export function installmentAmounts(planKey, totalCents = PROGRAM_TOTAL_CENTS) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`unknown plan: ${planKey}`);
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error(`total must be a whole number of cents, got ${JSON.stringify(totalCents)}`);
  }
  const n = plan.installments;
  const base = Math.round(totalCents / n);
  const amounts = Array(n).fill(base);
  amounts[n - 1] = totalCents - base * (n - 1);
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
export function installmentSchedule(planKey, dayZero, totalCents = PROGRAM_TOTAL_CENTS) {
  const plan = PLANS[planKey];
  if (!plan) throw new Error(`unknown plan: ${planKey}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayZero || ''))) {
    throw new Error(`day zero must be YYYY-MM-DD, got ${JSON.stringify(dayZero)}`);
  }
  const amounts = installmentAmounts(planKey, totalCents);
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

export function planSummary(planKey, dayZero, totalCents = PROGRAM_TOTAL_CENTS) {
  const plan = PLANS[planKey];
  const rows = dayZero ? installmentSchedule(planKey, dayZero, totalCents) : null;
  const amounts = installmentAmounts(planKey, totalCents);
  return {
    key: planKey,
    label: plan.label,
    total_cents: totalCents,
    total: money(totalCents),
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
