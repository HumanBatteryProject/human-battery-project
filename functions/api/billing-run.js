// Cloudflare Pages Function. POST /api/billing-run
//
// The daily job that charges what is due. Runs from the Worker cron.
//
// THE DISTINCTION THIS JOB EXISTS TO PROTECT. A charge that cannot be attempted
// is NOT a participant's payment failure. If Stripe is unconfigured, or down, or
// our key is wrong, nobody has failed to pay: we have failed to ask. Marking
// those as failed would offer a weekly recovery plan to somebody who is current,
// and then suspend them. So the job reports 'blocked' and changes nothing.
//
// Only a charge that Stripe actually declined counts as a failure.

import Stripe from 'stripe';
import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { stripeState } from './enroll.js';
import { outstandingCents, weeklyPlanOffer, WEEKLY_RECOVERY_WEEKS } from './_billing.js';
import { money } from './_payments.js';
import { accessThroughAfterWeeklyPayment } from './_billing.js';

function localDate(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export async function onRequestPost({ request, env }) {
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }
  let body = {};
  try { body = await request.json(); } catch { /* the cron sends nothing */ }
  const dryRun = body.dry_run === true;

  const sb = db(env);
  const stripe = stripeState(env);
  const out = {
    stripe_ready: stripe.ready, stripe_note: stripe.why,
    due: 0, charged: 0, failed: 0, blocked: 0, offers_made: 0, rows: [],
  };

  // Everything still owed, with the participant's timezone, because a charge due
  // "today" means today where they live.
  const pending = await sb.select('payments', {
    where: { status: 'pending' },
    columns: 'id,client_id,plan,installment_no,amount_cents,due_on,weekly_plan_id,week_no,attempts,stripe_customer,profiles!payments_client_id_fkey(timezone,email)',
    order: 'due_on.asc',
  });

  for (const p of (pending || [])) {
    const tz = (p.profiles && p.profiles.timezone) || 'America/Chicago';
    if (p.due_on > localDate(tz)) continue;        // not due where they live
    out.due++;

    if (dryRun) {
      out.rows.push({ payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on, dry_run: true });
      continue;
    }

    if (!stripe.ready) {
      // We could not ask. Nobody failed. Recorded so the admin billing screen
      // shows a real backlog rather than silence.
      out.blocked++;
      out.rows.push({
        payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on,
        result: 'blocked', why: 'Stripe is not configured, so this charge was never attempted. This is not a payment failure.',
      });
      await sb.update('payments', { id: p.id },
        { last_attempt_at: new Date().toISOString(),
          failure_reason: 'not attempted: Stripe is not configured' });
      continue;
    }

    // ---- the off session charge ----
    //
    // Day 10. Built against Stripe test mode; with placeholder keys the loop never
    // reaches here, because stripe.ready is false and the row above records
    // 'blocked' instead. Nothing here fakes a success: a stub returning paid would
    // mark money as collected that nobody collected, and the weekly recovery
    // policy would then never fire for a person who genuinely had not paid.
    const customer = p.stripe_customer || (await customerFor(sb, p.client_id));
    if (!customer) {
      // No saved card. That is not a decline: we have nobody to ask. Recorded as
      // blocked for the same reason an unconfigured key is.
      out.blocked++;
      out.rows.push({
        payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on,
        result: 'blocked',
        why: 'No saved payment method for this participant, so this charge was never attempted. This is not a payment failure.',
      });
      await sb.update('payments', { id: p.id }, {
        last_attempt_at: new Date().toISOString(),
        failure_reason: 'not attempted: no saved payment method',
      });
      continue;
    }

    const attempts = Number(p.attempts || 0) + 1;
    try {
      const client = new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2026-07-29.dahlia', httpClient: Stripe.createFetchHttpClient(),
      });
      const method = await defaultMethod(client, customer);
      if (!method) throw Object.assign(new Error('no default payment method on the customer'),
                                       { notAttempted: true });

      const intent = await client.paymentIntents.create({
        amount: p.amount_cents,
        currency: 'usd',
        customer,
        payment_method: method,
        // off_session plus confirm is what makes this a charge rather than a
        // request for the cardholder to act. A 3D Secure challenge cannot be
        // answered by a cron job, so Stripe raises authentication_required and
        // that is handled as a decline the participant has to resolve.
        off_session: true,
        confirm: true,
        metadata: { payment_id: p.id, client_id: p.client_id, plan: p.plan,
                    installment_no: String(p.installment_no),
                    week_no: p.week_no == null ? '' : String(p.week_no) },
      }, { idempotencyKey: `payment:${p.id}:${p.amount_cents}` });

      if (intent.status === 'succeeded') {
        await sb.update('payments', { id: p.id }, {
          status: 'paid', paid_at: new Date().toISOString(),
          stripe_payment_intent: intent.id, stripe_customer: customer,
          attempts, last_attempt_at: new Date().toISOString(), failure_reason: null,
        });
        // A weekly payment buys one week of access, and the entitlement is where
        // that week is recorded.
        if (p.weekly_plan_id) await extendWeek(sb, p);
        out.charged++;
        out.rows.push({ payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on,
                        result: 'paid', payment_intent: intent.id });
      } else {
        // requires_action, requires_payment_method and the rest are not successes
        // and are not silent. The participant has to do something.
        await sb.update('payments', { id: p.id }, {
          status: 'failed', stripe_payment_intent: intent.id, stripe_customer: customer,
          attempts, last_attempt_at: new Date().toISOString(),
          failure_reason: `Stripe returned ${intent.status}`,
        });
        out.failed++;
        out.rows.push({ payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on,
                        result: 'failed', why: `Stripe returned ${intent.status}` });
      }
    } catch (e) {
      // THE DISTINCTION THIS WHOLE JOB EXISTS FOR, one more time. A card decline
      // is a payment failure. A network error, a bad key or a Stripe outage is
      // not: nobody failed to pay, we failed to ask. Only Stripe's own card
      // errors count, and everything else is blocked.
      const declined = e && (e.type === 'StripeCardError' || e.code === 'card_declined'
                             || e.code === 'authentication_required'
                             || e.code === 'insufficient_funds');
      if (declined && !e.notAttempted) {
        await sb.update('payments', { id: p.id }, {
          status: 'failed', attempts, last_attempt_at: new Date().toISOString(),
          stripe_customer: customer,
          failure_reason: (e.message || 'card declined').slice(0, 300),
        });
        out.failed++;
        out.rows.push({ payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on,
                        result: 'failed', why: (e.message || 'card declined').slice(0, 200) });
      } else {
        await sb.update('payments', { id: p.id }, {
          attempts, last_attempt_at: new Date().toISOString(),
          failure_reason: ('not attempted: ' + (e.message || String(e))).slice(0, 300),
        });
        out.blocked++;
        out.rows.push({ payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on,
                        result: 'blocked',
                        why: 'The charge could not be attempted: ' + (e.message || String(e)).slice(0, 160) +
                             '. This is not a payment failure.' });
      }
    }
  }

  // Offer a weekly plan to anyone with a genuinely FAILED payment and no open
  // plan already. A failure recorded by this job means Stripe declined it.
  const failed = await sb.select('payments', {
    where: { status: 'failed' },
    columns: 'id,client_id,amount_cents,plan,installment_no',
  });
  const byClient = new Map();
  for (const f of (failed || [])) {
    if (!byClient.has(f.client_id)) byClient.set(f.client_id, []);
    byClient.get(f.client_id).push(f);
  }

  for (const [clientId] of byClient) {
    const open = await sb.one('weekly_plans', {
      where: { client_id: clientId, status: 'offered' }, columns: 'id',
    });
    const accepted = await sb.one('weekly_plans', {
      where: { client_id: clientId, status: 'accepted' }, columns: 'id',
    });
    if (open || accepted) continue;

    const all = await sb.select('payments', {
      where: { client_id: clientId }, columns: 'amount_cents,status',
    });
    const owed = outstandingCents(all);
    if (owed <= 0) continue;

    if (dryRun) { out.offers_made++; continue; }

    const offer = weeklyPlanOffer(owed);
    const ent = await sb.one('entitlements', {
      where: { client_id: clientId, kind: 'program' }, columns: 'id',
    });
    await sb.insert('weekly_plans', {
      client_id: clientId, entitlement_id: ent ? ent.id : null,
      outstanding_cents: offer.outstanding_cents,
      weekly_cents: offer.weekly_cents,
      weeks_total: offer.weeks_total,
      status: 'offered',
    });
    // Every state change is audited. The offer path was missing this.
    await sb.insert('audit_log', {
      actor_id: null, action: 'weekly_plan.offered', table_name: 'weekly_plans',
      subject_id: clientId,
      detail: { outstanding_cents: offer.outstanding_cents, weeks: offer.weeks_total,
                by: 'billing-run' },
    });
    out.offers_made++;
    out.rows.push({ client_id: clientId, result: 'weekly plan offered',
                    outstanding: offer.outstanding, weeks: offer.weeks_total });
  }

  out.weekly_recovery_weeks = WEEKLY_RECOVERY_WEEKS;
  return json(out);
}

// The Stripe customer for a participant, from any row that already has one.
async function customerFor(sb, clientId) {
  const withCustomer = await sb.one('payments', {
    where: { client_id: clientId }, columns: 'stripe_customer',
    raw: 'stripe_customer=not.is.null', order: 'created_at.desc',
  });
  if (withCustomer && withCustomer.stripe_customer) return withCustomer.stripe_customer;
  const ent = await sb.one('entitlements', {
    where: { client_id: clientId }, columns: 'stripe_customer',
    raw: 'stripe_customer=not.is.null', order: 'created_at.desc',
  });
  return ent ? ent.stripe_customer : null;
}

async function defaultMethod(client, customer) {
  const c = await client.customers.retrieve(customer);
  const pinned = c && c.invoice_settings && c.invoice_settings.default_payment_method;
  if (pinned) return typeof pinned === 'string' ? pinned : pinned.id;
  const list = await client.paymentMethods.list({ customer, type: 'card', limit: 1 });
  return list && list.data && list.data.length ? list.data[0].id : null;
}

// One weekly payment buys exactly one week, counted from the day it succeeded.
async function extendWeek(sb, p) {
  const plan = await sb.one('weekly_plans', {
    where: { id: p.weekly_plan_id }, columns: 'id,entitlement_id',
  });
  if (!plan || !plan.entitlement_id) return;
  const through = accessThroughAfterWeeklyPayment(new Date().toISOString().slice(0, 10));
  await sb.update('entitlements', { id: plan.entitlement_id }, {
    access_through: through, status: 'active', suspended_at: null, suspended_reason: null,
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
