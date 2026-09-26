// Cloudflare Pages Function. POST /api/weekly-plan
//
// The payment failure policy, ruled 26 September. A failed installment offers the
// outstanding balance as weekly payments, each buying one week of access.
// Declining, or failing a weekly payment, suspends access to everything.
// Suspension is not deletion.
//
// Actions:
//   offer     staff or the billing job: create the offer
//   accept    the participant: explicit consent, recorded with a timestamp
//   decline   the participant: suspends access
//   paid      a weekly payment succeeded: access moves forward exactly one week
//   failed    a weekly payment was declined: suspends access
//   restore   staff, or the balance being paid: access back, history intact
//
// Every one of these writes an audit row, because "why can I not sign in" has to
// be answerable.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import {
  weeklyPlanOffer, outstandingCents, accessThroughAfterWeeklyPayment,
} from './_billing.js';
import { money } from './_payments.js';

const ACTIONS = ['offer', 'accept', 'decline', 'paid', 'failed', 'restore'];

// accept and decline are the participant's own decisions, so they may come from a
// member session. Everything else is staff or the job.
const MEMBER_ACTIONS = new Set(['accept', 'decline']);

async function whoami(request, env) {
  if (hasServiceSecret(request, env)) return { kind: 'service', id: null };
  const staff = await verifyStaff(request, env);
  if (staff) return { kind: 'staff', id: staff.id };
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? { kind: 'member', id: user.id } : null;
}

async function audit(sb, actorId, action, subjectId, detail) {
  await sb.insert('audit_log', {
    actor_id: actorId, action, table_name: 'weekly_plans',
    subject_id: subjectId, detail,
  });
}

export async function onRequestPost({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const action = String(body.action || '').trim();
  if (!ACTIONS.includes(action)) {
    return json({ error: 'action must be one of: ' + ACTIONS.join(', ') }, 400);
  }
  if (who.kind === 'member' && !MEMBER_ACTIONS.has(action)) {
    return json({ error: 'not allowed' }, 403);
  }

  const sb = db(env);
  // A member may only ever act on themselves.
  const clientId = who.kind === 'member' ? who.id : String(body.client_id || '').trim();
  if (!clientId) return json({ error: 'client_id required' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const plan = await sb.one('weekly_plans', {
    where: { client_id: clientId },
    columns: 'id,status,outstanding_cents,weekly_cents,weeks_total,weeks_paid,entitlement_id',
    order: 'offered_at.desc',
  });

  // ---- offer ----
  if (action === 'offer') {
    const all = await sb.select('payments', { where: { client_id: clientId }, columns: 'amount_cents,status' });
    const owed = outstandingCents(all);
    if (owed <= 0) return json({ error: 'nothing outstanding' }, 409);
    if (plan && (plan.status === 'offered' || plan.status === 'accepted')) {
      return json({ ok: true, already: plan.status, weekly_plan_id: plan.id });
    }
    const offer = weeklyPlanOffer(owed);
    const ent = await sb.one('entitlements', { where: { client_id: clientId, kind: 'program' }, columns: 'id' });
    const rows = await sb.insert('weekly_plans', {
      client_id: clientId, entitlement_id: ent ? ent.id : null,
      outstanding_cents: offer.outstanding_cents, weekly_cents: offer.weekly_cents,
      weeks_total: offer.weeks_total, status: 'offered', created_by: who.id,
    }, { returning: true });
    await audit(sb, who.id, 'weekly_plan.offered', clientId, { outstanding_cents: owed, weeks: offer.weeks_total });
    return json({ ok: true, weekly_plan_id: rows[0].id, offer });
  }

  if (!plan) return json({ error: 'no weekly plan for this participant' }, 404);

  // ---- accept: explicit consent ----
  if (action === 'accept') {
    if (plan.status !== 'offered') return json({ error: `plan is ${plan.status}, not offered` }, 409);
    await sb.update('weekly_plans', { id: plan.id }, { status: 'accepted', accepted_at: new Date().toISOString() });
    // Accepting buys nothing on its own. The first weekly PAYMENT buys the first
    // week. Until then the participant is inside whatever access they already had.
    await audit(sb, who.id, 'weekly_plan.accepted', clientId,
      { weekly_plan_id: plan.id, weekly_cents: plan.weekly_cents, weeks: plan.weeks_total });
    return json({ ok: true, status: 'accepted',
                  note: 'Accepted. The first weekly payment is what extends access; accepting alone does not.' });
  }

  // ---- decline: suspends ----
  if (action === 'decline') {
    await sb.update('weekly_plans', { id: plan.id }, { status: 'declined', declined_at: new Date().toISOString(), closed_at: new Date().toISOString() });
    const r = await sb.rpc('suspend_access', { p_client: clientId, p_reason: 'weekly payment plan declined, balance ' + money(plan.outstanding_cents) });
    await audit(sb, who.id, 'weekly_plan.declined', clientId, { weekly_plan_id: plan.id });
    return json({ ok: true, status: 'declined', suspended: true, detail: r,
                  note: 'Access is suspended. Nothing is deleted, and your records and export stay available.' });
  }

  // ---- paid: one week of access ----
  if (action === 'paid') {
    if (plan.status !== 'accepted') return json({ error: `plan is ${plan.status}, not accepted` }, 409);
    const weekNo = Number(plan.weeks_paid || 0) + 1;
    if (weekNo > plan.weeks_total) return json({ error: 'the plan is already fully paid' }, 409);

    const amount = weekNo === plan.weeks_total
      ? plan.outstanding_cents - plan.weekly_cents * (plan.weeks_total - 1)
      : plan.weekly_cents;

    try {
      await sb.insert('payments', {
        client_id: clientId, plan: 'weekly_recovery', installment_no: weekNo,
        amount_cents: amount, currency: 'usd', status: 'paid',
        due_on: today, paid_at: new Date().toISOString(),
        weekly_plan_id: plan.id, week_no: weekNo,
      });
    } catch (e) {
      if (!/duplicate key|23505/.test(String(e))) throw e;
      return json({ ok: true, already_recorded: true, week_no: weekNo });
    }

    const through = accessThroughAfterWeeklyPayment(today);
    const done = weekNo >= plan.weeks_total;

    await sb.update('weekly_plans', { id: plan.id },
      done ? { weeks_paid: weekNo, status: 'completed', closed_at: new Date().toISOString() }
           : { weeks_paid: weekNo });

    if (done) {
      // The balance is cleared. Access returns to the normal entitlement rather
      // than staying limited to a rolling week.
      await sb.rpc('restore_access', { p_client: clientId, p_reason: 'weekly plan completed, balance paid' });
      // And the original failed installments are settled, not left looking unpaid.
      await sb.update('payments', { client_id: clientId, status: 'failed' },
        { status: 'paid', paid_at: new Date().toISOString(),
          failure_reason: 'settled by weekly recovery plan' });
    } else if (plan.entitlement_id) {
      await sb.update('entitlements', { id: plan.entitlement_id },
        { status: 'active', suspended_at: null, suspended_reason: null, access_through: through });
    }

    await audit(sb, who.id, 'weekly_plan.payment', clientId,
      { week_no: weekNo, amount_cents: amount, access_through: done ? null : through, completed: done });

    return json({ ok: true, week_no: weekNo, amount: money(amount),
                  access_through: done ? null : through, completed: done });
  }

  // ---- failed: suspends ----
  if (action === 'failed') {
    const weekNo = Number(plan.weeks_paid || 0) + 1;
    await sb.insert('payments', {
      client_id: clientId, plan: 'weekly_recovery', installment_no: weekNo,
      amount_cents: plan.weekly_cents, currency: 'usd', status: 'failed',
      due_on: today, weekly_plan_id: plan.id, week_no: weekNo,
      failure_reason: String(body.reason || 'weekly payment declined'),
    }).catch((e) => { if (!/duplicate key|23505/.test(String(e))) throw e; });
    await sb.update('weekly_plans', { id: plan.id }, { status: 'failed', closed_at: new Date().toISOString() });
    const r = await sb.rpc('suspend_access', { p_client: clientId, p_reason: 'weekly payment failed in week ' + weekNo });
    await audit(sb, who.id, 'weekly_plan.failed', clientId, { weekly_plan_id: plan.id, week_no: weekNo });
    return json({ ok: true, status: 'failed', suspended: true, detail: r });
  }

  // ---- restore ----
  if (action === 'restore') {
    const r = await sb.rpc('restore_access', { p_client: clientId, p_reason: String(body.reason || 'balance paid') });
    await audit(sb, who.id, 'entitlement.restore.manual', clientId, { reason: body.reason || 'balance paid' });
    return json({ ok: true, restored: true, detail: r });
  }
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
