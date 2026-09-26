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

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { stripeState } from './enroll.js';
import { outstandingCents, weeklyPlanOffer, WEEKLY_RECOVERY_WEEKS } from './_billing.js';
import { money } from './_payments.js';

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
    columns: 'id,client_id,plan,installment_no,amount_cents,due_on,weekly_plan_id,week_no,attempts,profiles!payments_client_id_fkey(timezone,email)',
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

    // With a real key this is where the off session PaymentIntent against the
    // saved payment method goes. It is deliberately not stubbed with a fake
    // success: a stub that returns paid would mark money as collected that
    // nobody collected.
    out.rows.push({
      payment_id: p.id, amount: money(p.amount_cents), due_on: p.due_on,
      result: 'not implemented', why: 'Stripe is configured but the off session charge call is Day 10 work.',
    });
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

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
