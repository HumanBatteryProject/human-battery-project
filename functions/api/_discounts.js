// Discounts, as arithmetic.
//
// Ruled 26 September, replacing the founding price. Nothing is discounted unless
// the owner created a discount. There is no rule that quietly applies to whoever
// turns up before a date.
//
// The whole point of the split being here rather than at the vendor: a discount
// applies against the list price and then the installments are recomputed from the
// DISCOUNTED total by the same rule, so they sum to what was agreed. Taking the
// discount off only the first installment, which is the obvious shortcut and what
// Stripe's default coupon behaviour on a subscription would do, leaves the later
// ones at list price and the total wrong.

import { PLANS, installmentAmounts, installmentSchedule, money, PROGRAM_TOTAL_CENTS } from './_payments.js';

/**
 * Cents off a list price.
 *
 * A percent is whole percent, 1 to 100, never 0.2 for twenty. A fixed amount is
 * cents. Both are clamped so a discount can make something free but never
 * negative: a negative charge is a refund nobody asked for.
 */
export function discountCents(listCents, kind, amount) {
  if (!Number.isInteger(listCents) || listCents < 0) {
    throw new Error(`list price must be a whole number of cents, got ${JSON.stringify(listCents)}`);
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`discount amount must be a positive integer, got ${JSON.stringify(amount)}`);
  }
  if (kind === 'percent') {
    if (amount > 100) throw new Error(`a percent discount cannot exceed 100, got ${amount}`);
    // Rounded, not floored: 20 percent of 100000 is exactly 20000, but 15 percent
    // of 33333 is 4999.95 and the participant should not lose the cent.
    return Math.min(listCents, Math.round((listCents * amount) / 100));
  }
  if (kind === 'fixed') return Math.min(listCents, amount);
  throw new Error(`unknown discount kind: ${JSON.stringify(kind)}`);
}

/**
 * The full quote a participant sees before agreeing to anything.
 *
 * @param {object} o
 *   planKey    one of PLANS
 *   dayZero    YYYY-MM-DD, or null to show amounts without dates
 *   listCents  defaults to the program price
 *   discount   {kind, amount, name} or null
 */
export function quote({ planKey, dayZero = null, listCents = PROGRAM_TOTAL_CENTS, discount = null }) {
  if (!PLANS[planKey]) throw new Error(`unknown plan: ${planKey}`);
  const off = discount ? discountCents(listCents, discount.kind, discount.amount) : 0;
  const charged = listCents - off;

  const amounts = installmentAmounts(planKey, charged);
  const rows = dayZero ? installmentSchedule(planKey, dayZero, charged) : null;

  return {
    plan: planKey,
    label: PLANS[planKey].label,
    list_cents: listCents,
    list: money(listCents),
    discount_name: discount ? (discount.name || null) : null,
    discount_kind: discount ? discount.kind : null,
    discount_amount: discount ? discount.amount : null,
    discount_cents: off,
    discount_off: money(off),
    charged_cents: charged,
    charged: money(charged),
    installments: amounts.map((cents, i) => ({
      installment_no: i + 1,
      program_day: PLANS[planKey].days[i],
      amount_cents: cents,
      amount: money(cents),
      due_on: rows ? rows[i].due_on : null,
    })),
    // Stated rather than assumed, so a caller can assert it and a screen can
    // show it. The ruling is that the installments still sum to the discounted
    // total, and this is that sentence as a number.
    installments_sum_cents: amounts.reduce((a, b) => a + b, 0),
  };
}

/** Does the quote hold together? Used by the endpoint before it writes anything. */
export function quoteBalances(q) {
  return q.list_cents - q.discount_cents === q.charged_cents
      && q.installments_sum_cents === q.charged_cents;
}
