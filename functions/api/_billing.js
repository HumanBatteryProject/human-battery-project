// The payment failure policy, as arithmetic.
//
// Ruled 26 September. A failed installment does not end the program. The
// participant is offered the outstanding balance divided into weekly payments,
// and EACH WEEKLY PAYMENT BUYS ONE WEEK OF ACCESS. Declining, or failing a weekly
// payment, suspends access to everything. Suspension is not deletion.
//
// Everything here is pure so the policy can be tested without Stripe and without
// a database. The parts that touch money are the parts most worth testing, and
// they are the parts a live integration makes hardest to test.

import { PROGRAM_TOTAL_CENTS, money } from './_payments.js';

// DECISION LEFT TO THE OWNER, safe value set. How many weeks the outstanding
// balance is spread over. Four gives a month to catch up, which is long enough to
// be a real offer and short enough that the balance does not outlive the program.
// Listed in the daily report as an owner item.
export const WEEKLY_RECOVERY_WEEKS = 4;

// One week of access per payment. Not a constant anyone should change casually:
// the whole policy is built on a week being a week.
export const ACCESS_DAYS_PER_WEEKLY_PAYMENT = 7;

/**
 * What is still owed. Anything not paid counts, including the installment that
 * just failed. Refunded and void rows do not.
 * @param {{amount_cents:number, status:string}[]} payments
 */
export function outstandingCents(payments) {
  return (payments || [])
    .filter((p) => p.status === 'pending' || p.status === 'failed')
    .reduce((sum, p) => sum + Number(p.amount_cents || 0), 0);
}

/**
 * The weekly plan offered after a failure.
 *
 * The LAST payment absorbs the remainder, the same rule the three-payment option
 * uses, so the weekly payments always sum to at least the balance and never less.
 * A plan that cannot clear the debt is not a plan, and a plan that overshoots by
 * a cent is a rounding artefact the final payment should swallow.
 *
 * @returns {{outstanding_cents:number, weekly_cents:number, weeks_total:number,
 *            schedule:{week_no:number, amount_cents:number, buys_access_through_offset_days:number}[]}}
 */
export function weeklyPlan(outstanding, weeks = WEEKLY_RECOVERY_WEEKS) {
  // The type is checked BEFORE any coercion. Number('500') is 500, so coercing
  // first would silently accept a string, and a caller passing a string is a
  // caller who has not parsed their input: that is how "39.99" becomes 39 cents.
  // _settings.js refuses a string price for the same reason.
  if (typeof outstanding !== 'number') {
    throw new Error(`outstanding must be a number of cents, got ${typeof outstanding} ${JSON.stringify(outstanding)}`);
  }
  const total = outstanding;
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error(`outstanding must be a positive whole number of cents, got ${JSON.stringify(outstanding)}`);
  }
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new Error(`weeks must be a positive integer, got ${JSON.stringify(weeks)}`);
  }
  // A balance smaller than the week count would produce zero value charges, and a
  // zero amount charge is not a payment: Stripe rejects it and the participant
  // sees a failure for money nobody was owed. Fewer, larger weeks instead.
  const n = Math.min(weeks, total);
  const base = Math.floor(total / n);
  const amounts = Array(n).fill(base);
  amounts[n - 1] += total - base * n;

  return {
    outstanding_cents: total,
    weekly_cents: base,
    weeks_total: n,
    schedule: amounts.map((cents, i) => ({
      week_no: i + 1,
      amount_cents: cents,
      amount: money(cents),
      buys_access_through_offset_days: (i + 1) * ACCESS_DAYS_PER_WEEKLY_PAYMENT,
    })),
  };
}

/**
 * The plan shown to the participant before they accept. The ruling requires the
 * plan be shown IN FULL before acceptance, so this is what the screen renders and
 * what the consent record refers to.
 */
export function weeklyPlanOffer(outstanding, weeks = WEEKLY_RECOVERY_WEEKS) {
  const plan = weeklyPlan(outstanding, weeks);
  return {
    ...plan,
    outstanding: money(plan.outstanding_cents),
    sums_to: money(plan.schedule.reduce((a, b) => a + b.amount_cents, 0)),
    statement:
      `You still owe ${money(plan.outstanding_cents)}. This splits it into ` +
      `${plan.weeks_total} weekly payments. Each payment keeps your access for ` +
      `another week. If a weekly payment does not go through, access stops until ` +
      `the balance is paid. Nothing is deleted and you can always export your own records.`,
  };
}

/**
 * The date a weekly payment buys access through.
 * @param {string} fromDate YYYY-MM-DD, the date the payment succeeded
 */
export function accessThroughAfterWeeklyPayment(fromDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate || ''))) {
    throw new Error(`fromDate must be YYYY-MM-DD, got ${JSON.stringify(fromDate)}`);
  }
  const d = new Date(fromDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + ACCESS_DAYS_PER_WEEKLY_PAYMENT);
  return d.toISOString().slice(0, 10);
}

/**
 * What the product should do about a participant, from their entitlement alone.
 * Pure, so the gate's decision is testable without a session.
 */
export function accessDecision(entitlement, today) {
  if (!entitlement) return { allowed: false, reason: 'no entitlement' };
  const e = entitlement;
  if (e.status === 'suspended') {
    return { allowed: false, reason: 'suspended: ' + (e.suspended_reason || 'unpaid balance') };
  }
  if (e.status === 'cancelled' && e.access_until && e.access_until < today) {
    return { allowed: false, reason: 'cancelled, paid period ended ' + e.access_until };
  }
  if (e.status === 'expired') return { allowed: false, reason: 'expired' };
  if (e.effective_from && e.effective_from > today) {
    return { allowed: false, reason: 'starts ' + e.effective_from };
  }
  if (e.access_through && e.access_through < today) {
    return { allowed: false, reason: 'weekly payment lapsed ' + e.access_through };
  }
  if (e.effective_to && e.effective_to < today) {
    return { allowed: false, reason: 'ended ' + e.effective_to };
  }
  return { allowed: true, reason: null };
}

// What stays reachable while suspended. The ruling is explicit that suspension is
// not deletion and that account management and export remain available, so this
// list is the answer to "what does a suspended participant still get" and the
// gate must consult it rather than each route deciding for itself.
export const REACHABLE_WHILE_SUSPENDED = [
  '/portal/account.html',
  '/portal/login.html',
  '/portal/confirm.html',
  '/portal/consent.html',
  '/portal/billing.html',
  '/api/export',
  '/api/data-request',
];

export function reachableWhileSuspended(path) {
  return REACHABLE_WHILE_SUSPENDED.some((p) => String(path || '').startsWith(p.replace(/\.html$/, '')));
}
