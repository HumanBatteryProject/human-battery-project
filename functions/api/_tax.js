/**
 * Sales tax, which the program charges on top of the price.
 *
 * Ruled 2026-09-29: the program is $249.99 PLUS local tax in the participant's
 * own state.
 *
 * WHY THERE IS NO RATE TABLE IN THIS FILE. Fifty states, thousands of local
 * jurisdictions, and rates that change on a legislature's schedule. A table
 * committed here would be wrong within weeks and wrong silently, which is the
 * worst way for a tax number to be wrong. Stripe Tax calculates from the address
 * the participant enters at checkout and keeps its own rates current.
 *
 * WHAT THIS MEANS IN PRACTICE, AND IT IS NOT AUTOMATIC. Stripe Tax has to be
 * switched on in the Stripe dashboard, the business has to register in every
 * state where it has nexus, and the product needs a tax code so Stripe knows
 * whether a 90-day health coaching program is taxable in that state at all. That
 * last one is an accountant's decision and not a developer's: in some states a
 * wellness or coaching service is not taxable, and charging tax where none is due
 * is its own problem. STRIPE_TAX_CODE is therefore a named placeholder and this
 * module refuses rather than guessing.
 */

// Stripe's product tax code. Left unset on purpose. `txcd_` codes are Stripe's
// own identifiers and picking one is a tax decision, not a coding one.
export const TAX_CODE_VAR = 'STRIPE_TAX_CODE';

export class TaxNotConfigured extends Error {
  constructor(what) {
    super(what);
    this.name = 'TaxNotConfigured';
    this.status = 503;
  }
}

/**
 * What the checkout needs to charge tax, and what is missing.
 *
 * Returns a state object rather than throwing, so a caller can report the reason
 * to a person instead of a stack trace. Nothing here charges anyone.
 */
export function taxState(env) {
  const missing = [];
  if (!env || !env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
  if (!env || !env[TAX_CODE_VAR]) missing.push(TAX_CODE_VAR);
  return {
    ready: missing.length === 0,
    missing,
    note: missing.length
      ? `Sales tax cannot be calculated: ${missing.join(' and ')} not set. `
        + 'Stripe Tax must also be enabled in the dashboard and the business '
        + 'registered in every state where it has nexus.'
      : 'Stripe Tax calculates from the address entered at checkout.',
  };
}

/**
 * The Checkout Session fields that make Stripe calculate and collect tax.
 *
 * REFUSES rather than returning an untaxed session. A checkout that silently
 * charges $249.99 with no tax line, in a state where tax is due, is a liability
 * that looks exactly like a working checkout.
 */
export function taxParams(env) {
  const st = taxState(env);
  if (!st.ready) throw new TaxNotConfigured(st.note);
  return {
    'automatic_tax[enabled]': 'true',
    // The address is required for any of this to mean anything, and the ruling
    // is specific that it is the participant's own state.
    'customer_update[address]': 'auto',
    'billing_address_collection': 'required',
  };
}

/** The line a participant reads next to the price. One wording, used everywhere. */
export const TAX_LINE = 'plus sales tax in your state, calculated at checkout';

/**
 * A price to display. The program price is always shown pre-tax with the line
 * above, because the real number is not known until an address exists.
 */
export function priceLine(money) {
  return `${money} ${TAX_LINE}`;
}
