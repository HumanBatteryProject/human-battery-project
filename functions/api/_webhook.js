// Webhook bookkeeping: what makes a duplicate a duplicate, and what makes an
// event stale. Master prompt D9: duplicate and out-of-order webhook protection.
//
// Pure, because this is the logic a live Stripe integration makes hardest to
// test and easiest to get wrong. Stripe retries. Stripe does not promise order.
// Both facts have to be handled by the receiver, and neither can be checked by
// looking at a dashboard.

/**
 * Should this event be applied to this row?
 *
 * ORDER IS DECIDED BY THE PROVIDER'S CLOCK, never by arrival time. A cancellation
 * created at 10:00 and a renewal created at 09:59 can arrive in either order; if
 * arrival decided, the late-arriving renewal would resurrect a cancelled
 * membership and charge somebody who had stopped.
 *
 * An event with the SAME timestamp as the last applied one is allowed through,
 * because Stripe timestamps are whole seconds and two genuine events can share
 * one. Duplicate suppression is the event id's job, not the clock's, and using
 * the clock for both would silently drop the second of two real events.
 *
 * @param {string|null} lastAppliedAt ISO timestamp of the newest event applied
 * @param {string|number|null} eventCreated Stripe event.created, seconds since epoch
 */
export function isStale(lastAppliedAt, eventCreated) {
  if (!lastAppliedAt) return false;
  const at = eventTime(eventCreated);
  if (!at) return false;            // no clock on the event: cannot call it stale
  return at < new Date(lastAppliedAt).getTime();
}

export function eventTime(eventCreated) {
  if (eventCreated == null || eventCreated === '') return null;
  const n = Number(eventCreated);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * 1000;
}

export function eventIso(eventCreated) {
  const t = eventTime(eventCreated);
  return t == null ? null : new Date(t).toISOString();
}

// The event types this endpoint acts on. Anything else is recorded and
// acknowledged, never 500'd: a 500 tells Stripe to retry, and retrying an event
// nobody handles is a retry loop that never ends.
export const HANDLED = new Set([
  'checkout.session.completed',
  'payment_intent.succeeded',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
]);

export function isHandled(type) {
  return HANDLED.has(String(type));
}

/**
 * What a checkout session means, from its metadata alone.
 *
 * The old handler branched on plan.mode, a property that does not exist, so
 * every session took the subscription path including pay-in-full. The kind is
 * written into metadata at checkout, so the receiver reads a fact rather than
 * inferring one.
 */
export function sessionIntent(session) {
  const meta = (session && session.metadata) || {};
  const kind = String(meta.kind || '');
  if (kind === 'program') {
    return {
      kind: 'program',
      plan: meta.plan || null,
      application_id: meta.application_id || null,
      total_cents: intOrNull(meta.program_total_cents),
      installments: intOrNull(meta.installments),
      discount_code: meta.discount_code || null,
    };
  }
  if (kind === 'continuation_monthly' || kind === 'continuation_annual') {
    return {
      kind,
      client_id: meta.client_id || null,
      consent_id: meta.consent_id || null,
      price_cents: intOrNull(meta.price_cents),
      starts_on: meta.starts_on || null,
      renews_on: meta.renews_on || null,
      replaces_entitlement: meta.replaces_entitlement || null,
    };
  }
  // An unrecognised session is NOT guessed at. Money arrived that this code does
  // not understand, which is a thing to surface, not to interpret.
  return { kind: 'unknown', why: `session metadata carries kind "${kind}"` };
}

// Cents, and only cents.
//
// Number('1000.00') is 1000 and Number.isInteger(1000) is true, so a checked
// integer conversion happily turns a dollars-and-cents string into a hundredth of
// the amount it means: $1,000.00 read as 1000 cents, which is ten dollars. Stripe
// metadata is a string map, so the value arriving with a decimal point is a
// caller who has not converted, and that has to be refused rather than rounded.
// _settings.js refuses a non-integer price for the same reason and in the same
// shape.
function intOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
