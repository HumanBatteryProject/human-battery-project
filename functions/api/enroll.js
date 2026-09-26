// Cloudflare Pages Function. POST /api/enroll
//
// Turns a chosen payment option into ONE entitlement and the right number of
// scheduled charges. Ruled 26 September: three options, all for the same $1,000,
// and the program entitlement begins on Day 1 for every option.
//
// WHY THE DATABASE IS AUTHORITATIVE AND STRIPE IS NOT. The schedule is written
// here, as payment rows with due dates, and the billing job charges what is due.
// The alternative, letting a Stripe subscription schedule hold the truth, was
// rejected for two reasons: the ruled day numbers are not a uniform interval (Day
// 1 to Day 45 is 44 days, Day 1 to Day 31 is 30), so one interval_count cannot
// express both options and would silently produce the wrong date for one of them;
// and a schedule that lives only at the vendor cannot be shown in the billing
// portal or the admin screen without a round trip that may fail.
//
// Stripe still takes the money. What it does not do is decide when.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import {
  PLANS, isValidPlan, installmentSchedule, planSummary, PROGRAM_TOTAL_CENTS, CURRENCY,
} from './_payments.js';

export const PROGRAM_DAYS = 90;

// Stripe is parked on placeholder keys. This must fail LOUDLY rather than let an
// enrolment look complete when no payment method was ever saved.
export function stripeState(env) {
  const key = String(env.STRIPE_SECRET_KEY || '');
  const hook = String(env.STRIPE_WEBHOOK_SECRET || '');
  if (!key || key === 'sk_test_' || key === 'sk_live_') {
    return { ready: false, why: 'STRIPE_SECRET_KEY is the literal placeholder, so no payment method can be saved and no charge can be made.' };
  }
  if (!hook || hook === 'whsec_') {
    return { ready: false, why: 'STRIPE_WEBHOOK_SECRET is the literal placeholder. Going live needs BOTH: a secret key without a webhook secret means the payment succeeds, the webhook 500s on signature verification, and nobody gets onboarded.' };
  }
  return { ready: true, why: null };
}

export async function onRequestPost({ request, env }) {
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const clientId = String(body.client_id || '').trim();
  const plan = String(body.plan || '').trim();
  const dryRun = body.dry_run === true;

  if (!clientId) return json({ error: 'client_id required' }, 400);
  if (!isValidPlan(plan)) {
    return json({ error: 'plan must be one of: ' + Object.keys(PLANS).join(', ') }, 400);
  }

  const sb = db(env);
  const m = await sb.one('memberships', {
    where: { client_id: clientId, completed_on: null },
    columns: 'id,client_id,day_zero,cycle,status', order: 'cycle.desc',
  });
  if (!m) return json({ error: 'no open membership' }, 404);
  if (!m.day_zero) return json({ error: 'the membership has no start date yet' }, 409);

  const schedule = installmentSchedule(plan, m.day_zero);
  const summary = planSummary(plan, m.day_zero);

  // The entitlement runs Day 1 to Day 90 inclusive, for every option. A person on
  // three payments is not buying less program.
  const end = new Date(m.day_zero + 'T12:00:00Z');
  end.setUTCDate(end.getUTCDate() + PROGRAM_DAYS - 1);
  const effectiveTo = end.toISOString().slice(0, 10);

  const stripe = stripeState(env);

  if (dryRun) {
    return json({
      ok: true, dry_run: true, client_id: clientId, plan, summary,
      entitlement: { kind: 'program', effective_from: m.day_zero, effective_to: effectiveTo },
      stripe_ready: stripe.ready, stripe_note: stripe.why,
    });
  }

  // ONE entitlement. Re-running must not create a second: a participant with two
  // program entitlements has two end dates and the gate would honour the longer.
  const already = await sb.one('entitlements', {
    where: { client_id: clientId, kind: 'program' }, columns: 'id,status,effective_from',
  });
  let entitlementId = already && already.id;
  if (!entitlementId) {
    const rows = await sb.insert('entitlements', {
      client_id: clientId, membership_id: m.id, kind: 'program',
      effective_from: m.day_zero, effective_to: effectiveTo, status: 'active',
    }, { returning: true });
    entitlementId = rows && rows[0] && rows[0].id;
  }

  // The schedule. The unique index on (client_id, plan, installment_no) is what
  // makes a second run a no-op rather than a second set of charges.
  let scheduled = 0, skipped = 0;
  for (const row of schedule) {
    try {
      await sb.insert('payments', {
        client_id: clientId, membership_id: m.id, plan,
        installment_no: row.installment_no, amount_cents: row.amount_cents,
        currency: CURRENCY, status: 'pending', due_on: row.due_on,
      });
      scheduled++;
    } catch (e) {
      // A duplicate key here is the correct outcome of a replay, not an error.
      if (/duplicate key|23505/.test(String(e))) skipped++;
      else return json({ error: String(e).slice(0, 300), scheduled, skipped }, 500);
    }
  }

  return json({
    ok: true, client_id: clientId, plan, summary,
    entitlement_id: entitlementId,
    entitlement: { kind: 'program', effective_from: m.day_zero, effective_to: effectiveTo },
    scheduled, skipped_as_duplicate: skipped,
    total_cents: PROGRAM_TOTAL_CENTS,
    // Said plainly rather than implied by a missing field.
    stripe_ready: stripe.ready,
    stripe_note: stripe.why,
    charges_taken: stripe.ready ? 'attempted' : 'none, Stripe is not configured',
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
