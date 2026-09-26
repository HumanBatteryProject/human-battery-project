// Cloudflare Pages Function. POST /api/discount
//
// The owner's discount mechanism, replacing the founding price. Ruled 26
// September. Nothing is discounted unless a discount exists here.
//
// Actions:
//   create    admin only: a code discount or a per member discount
//   list      staff: every discount with its usage
//   revoke    admin only: stops it being redeemable, keeps the history
//   quote     a participant or staff: what would this cost with this code
//
// Redemption itself happens in /api/enroll, at the moment the schedule is
// written, so a quote can never be mistaken for a redemption.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { quote, quoteBalances } from './_discounts.js';
import { PLANS, isValidPlan, PROGRAM_TOTAL_CENTS } from './_payments.js';
import { settings, KEYS } from './_settings.js';
import { stripeState } from './enroll.js';

const TARGETS = ['program', 'continuation_monthly', 'continuation_annual'];

async function actor(request, env) {
  if (hasServiceSecret(request, env)) return { kind: 'service', id: null, admin: true };
  const staff = await verifyStaff(request, env);
  if (staff) return { kind: 'staff', id: staff.id, admin: staff.role === 'admin' };
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u && u.id ? { kind: 'member', id: u.id, admin: false } : null;
}

// What a target costs at list. The program price is a constant because Stripe
// needs it at request time; the continuation prices live in program_settings.
async function listPriceFor(env, target) {
  if (target === 'program') return PROGRAM_TOTAL_CENTS;
  const want = target === 'continuation_monthly'
    ? KEYS.CONTINUATION_MONTHLY_CENTS : KEYS.CONTINUATION_ANNUAL_CENTS;
  const s = await settings(env, [want]);
  return s[want];
}

export async function onRequestPost({ request, env }) {
  const who = await actor(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const action = String(body.action || '').trim();
  const sb = db(env);

  // ---------- create ----------
  if (action === 'create') {
    if (!who.admin) return json({ error: 'only an admin may create a discount' }, 403);

    const name = String(body.name || '').trim().slice(0, 120);
    const kind = String(body.kind || '').trim();
    const amount = body.amount;
    const target = String(body.applies_to || '').trim();
    const code = body.code ? String(body.code).trim().toUpperCase().slice(0, 40) : null;
    const clientId = body.client_id ? String(body.client_id).trim() : null;

    if (!name) return json({ error: 'name required' }, 400);
    if (!['fixed', 'percent'].includes(kind)) return json({ error: 'kind must be fixed or percent' }, 400);
    if (!Number.isInteger(amount) || amount <= 0) {
      return json({ error: 'amount must be a positive whole number: cents for fixed, whole percent for percent' }, 400);
    }
    if (kind === 'percent' && amount > 100) return json({ error: 'a percent discount cannot exceed 100' }, 400);
    if (!TARGETS.includes(target)) return json({ error: 'applies_to must be one of: ' + TARGETS.join(', ') }, 400);
    // Exactly one shape. Both, or neither, is a discount nobody can reason about.
    if ((code && clientId) || (!code && !clientId)) {
      return json({ error: 'give either a code (anyone may redeem) or a client_id (only they may), not both and not neither' }, 400);
    }

    const row = {
      name, kind, amount, applies_to: target, code, client_id: clientId,
      valid_from: body.valid_from || new Date().toISOString().slice(0, 10),
      valid_to: body.valid_to || null,
      use_limit: Number.isInteger(body.use_limit) ? body.use_limit : null,
      created_by: who.id,
    };

    let created;
    try {
      created = (await sb.insert('discounts', row, { returning: true }))[0];
    } catch (e) {
      if (/duplicate key/.test(String(e))) return json({ error: 'that code already exists' }, 409);
      return json({ error: String(e).slice(0, 300) }, 500);
    }

    // Stripe must carry the discount so the charge and the record cannot
    // disagree. Said plainly when it cannot.
    const stripe = stripeState(env);
    await sb.insert('audit_log', {
      actor_id: who.id, action: 'discount.created', table_name: 'discounts',
      record_id: created.id, subject_id: clientId,
      detail: { name, kind, amount, applies_to: target, code, use_limit: row.use_limit,
                valid_from: row.valid_from, valid_to: row.valid_to },
    });

    return json({
      ok: true, discount: created,
      stripe_ready: stripe.ready,
      stripe_note: stripe.ready ? null
        : 'No Stripe coupon was created because ' + stripe.why +
          ' The discount is recorded and will compute correctly, but until Stripe carries it the charge and the record are only kept in step by this code.',
    });
  }

  // ---------- list ----------
  if (action === 'list') {
    if (who.kind === 'member') return json({ error: 'not allowed' }, 403);
    const rows = await sb.select('discounts', {
      columns: 'id,name,code,client_id,kind,amount,applies_to,valid_from,valid_to,use_limit,times_used,revoked_at,created_at,stripe_coupon_id',
      order: 'created_at.desc',
    });
    return json({ ok: true, discounts: rows || [] });
  }

  // ---------- revoke ----------
  if (action === 'revoke') {
    if (!who.admin) return json({ error: 'only an admin may revoke a discount' }, 403);
    const id = String(body.discount_id || '').trim();
    if (!id) return json({ error: 'discount_id required' }, 400);
    await sb.update('discounts', { id }, { revoked_at: new Date().toISOString() });
    await sb.insert('audit_log', {
      actor_id: who.id, action: 'discount.revoked', table_name: 'discounts',
      record_id: id, detail: { reason: body.reason || null },
    });
    // Revoked, not deleted. The redemptions that already happened have to stay
    // explainable against a bank statement.
    return json({ ok: true, revoked: id, note: 'Revoked. Past redemptions are kept.' });
  }

  // ---------- quote ----------
  if (action === 'quote') {
    const target = String(body.applies_to || 'program').trim();
    if (!TARGETS.includes(target)) return json({ error: 'applies_to must be one of: ' + TARGETS.join(', ') }, 400);
    const plan = String(body.plan || 'paid_in_full').trim();
    if (target === 'program' && !isValidPlan(plan)) {
      return json({ error: 'plan must be one of: ' + Object.keys(PLANS).join(', ') }, 400);
    }
    // A member may only ever quote for themselves.
    const clientId = who.kind === 'member' ? who.id : String(body.client_id || '').trim();
    const code = body.code ? String(body.code).trim() : null;

    const listCents = await listPriceFor(env, target);
    let discount = null, rejected = null;

    if (code || clientId) {
      const v = await sb.rpc('validate_discount', {
        p_code: code, p_client: clientId || null, p_target: target,
      });
      const r = Array.isArray(v) ? v[0] : v;
      if (r && r.ok) discount = { kind: r.kind, amount: r.amount, name: r.name, id: r.discount_id };
      else if (code) rejected = (r && r.reason) || 'That discount is not valid.';
    }

    const q = quote({ planKey: target === 'program' ? plan : 'paid_in_full',
                      dayZero: body.day_zero || null, listCents, discount });
    if (!quoteBalances(q)) return json({ error: 'the quote did not balance, refusing to show it' }, 500);

    return json({ ok: true, quote: q, discount_rejected: rejected });
  }

  return json({ error: 'action must be one of: create, list, revoke, quote' }, 400);
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
