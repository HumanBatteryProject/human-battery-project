// Continuing membership, from the member's side. Master prompt D9.
//
//   GET  /api/membership                     what they have, what it costs, when it renews
//   POST /api/membership { action: 'consent' }  record subscription consent
//   POST /api/membership { action: 'cancel' }   stop the next payment, keep the paid period
//   POST /api/membership { action: 'resume' }   undo a cancellation still inside its period
//
// THREE THINGS D9 SEPARATES AND THIS FILE KEEPS SEPARATE.
//
// Paid features are not account rights. Cancelling stops charges and keeps the
// paid period; it never touches export or deletion, which a person has whether
// they pay us or not. So there is no code path here that deletes anything.
//
// The price shown is the price AGREED, read from the entitlement, not from
// program_settings. Raising the monthly fee must not rewrite what an existing
// member is told they pay.
//
// Cancelling is cancel_at_period_end, never an immediate cancel. An immediate
// cancel in Stripe ends the subscription now and would take away a period the
// member has already paid for.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { settings, KEYS, SettingMissing } from './_settings.js';
import {
  CONTINUATION_PLANS, isContinuationKind, continuationDates, cancellation,
} from './_continuation.js';
import { accessDecision } from './_billing.js';
import { stripeState } from './enroll.js';
import Stripe from 'stripe';
import { requireSubject } from './_subject.js';

const API_VERSION = '2026-07-29.dahlia';
const ACTIONS = ['consent', 'cancel', 'resume'];

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

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
export async function onRequestGet({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  const url = new URL(request.url);
  // A member can only ever ask about themselves. Staff must name a client, and
  // an unscoped read is how the admin dashboard once showed one participant
  // another participant's weekly review.
  const subject = requireSubject(who, url.searchParams.get('client_id'));
  if (!subject.ok) return json({ error: subject.error }, subject.status);
  const clientId = subject.clientId;

  const sb = db(env);
  return json(await membershipState(env, sb, clientId));
}

async function membershipState(env, sb, clientId) {
  const ents = await sb.select('entitlements', {
    where: { client_id: clientId },
    columns: 'id,kind,status,effective_from,effective_to,renews_on,access_until,access_through,'
           + 'price_cents,cancel_at_period_end,cancelled_at,suspended_reason,stripe_subscription',
    order: 'created_at.desc',
  });

  const program = (ents || []).find((e) => e.kind === 'program') || null;
  const membership = (ents || []).find(
    (e) => isContinuationKind(e.kind) && e.status !== 'expired') || null;

  const t = today();

  // What the product will actually let them reach, from the same rule the
  // database enforces.
  const live = (ents || []).map((e) => ({ ...e, decision: accessDecision(e, t) }));
  const access = live.some((e) => e.decision.allowed);

  // The offer at the end of the program, if one was made and not yet answered.
  const offer = await sb.one('completion_invitations', {
    where: { client_id: clientId },
    columns: 'id,offered_tier,offered_multiplier,improved,markers_improved,sent_at,accepted_at,declined_at',
    order: 'created_at.desc',
  });

  // Prices for the options they do not have yet, read fresh because these are
  // quotes rather than agreements.
  let prices = {}, priceError = null;
  try {
    const s = await settings(env, [KEYS.CONTINUATION_MONTHLY_CENTS, KEYS.CONTINUATION_ANNUAL_CENTS]);
    prices = {
      continuation_monthly: s[KEYS.CONTINUATION_MONTHLY_CENTS],
      continuation_annual: s[KEYS.CONTINUATION_ANNUAL_CENTS],
    };
  } catch (e) {
    if (e instanceof SettingMissing) priceError = e.message; else throw e;
  }

  const options = Object.values(CONTINUATION_PLANS).map((p) => {
    const cents = prices[p.key];
    const dates = cents ? continuationDates(p.key, t, program ? program.effective_to : null) : null;
    return {
      kind: p.key, label: p.label,
      amount_cents: cents || null,
      amount: cents ? '$' + (cents / 100).toFixed(2) : null,
      every: p.every,
      starts_on: dates ? dates.starts_on : null,
      renews_on: dates ? dates.renews_on : null,
      first_charge_on: dates ? dates.first_charge_on : null,
      bought_early: dates ? dates.bought_early : null,
      statement: dates ? dates.statement : null,
      // The one they already hold is not an option, it is what they have.
      available: !(membership && membership.kind === p.key
                   && ['active', 'suspended'].includes(membership.status)),
    };
  });

  // Subscription consent: which version, and whether it is granted.
  const docs = await sb.select('consent_documents', {
    where: { kind: 'subscription' }, columns: 'id,version,title,body,is_required',
    raw: 'retired_at=is.null', limit: 1,
  });
  const doc = docs && docs.length ? docs[0] : null;
  const grant = doc ? await sb.one('client_consents', {
    where: { client_id: clientId, document_id: doc.id },
    columns: 'id,granted,granted_at,withdrawn_at',
    order: 'created_at.desc',
  }) : null;

  const stripe = stripeState(env);

  return {
    client_id: clientId,
    access,
    program: program ? {
      status: program.status, ends_on: program.effective_to,
      days_left: program.effective_to ? daysBetween(t, program.effective_to) : null,
    } : null,
    membership: membership ? {
      id: membership.id, kind: membership.kind,
      label: (CONTINUATION_PLANS[membership.kind] || {}).label || membership.kind,
      status: membership.status,
      // The agreed price, from the row. Never the current setting.
      amount_cents: membership.price_cents,
      amount: membership.price_cents != null ? '$' + (membership.price_cents / 100).toFixed(2) : null,
      every: (CONTINUATION_PLANS[membership.kind] || {}).every || null,
      started_on: membership.effective_from,
      renews_on: membership.cancel_at_period_end ? null : membership.renews_on,
      cancel_at_period_end: membership.cancel_at_period_end,
      access_until: membership.access_until,
      suspended_reason: membership.suspended_reason,
    } : null,
    options,
    price_error: priceError,
    offer: offer && !offer.accepted_at && !offer.declined_at ? {
      id: offer.id, tier: offer.offered_tier, improved: offer.improved,
      markers_improved: offer.markers_improved, sent_at: offer.sent_at,
    } : null,
    consent: {
      document_version: doc ? doc.version : null,
      title: doc ? doc.title : null,
      body: doc ? doc.body : null,
      granted: !!(grant && grant.granted && !grant.withdrawn_at),
      granted_at: grant ? grant.granted_at : null,
    },
    // Account rights, deliberately listed here so the screen can say that
    // cancelling does not touch them.
    account_rights: {
      export: '/api/export',
      deletion_request: '/api/data-request',
      statement: 'Exporting and deleting your records do not depend on paying us, and cancelling does not affect them.',
    },
    stripe_ready: stripe.ready,
    stripe_note: stripe.why,
  };
}

function daysBetween(from, to) {
  return Math.round((new Date(to + 'T12:00:00Z') - new Date(from + 'T12:00:00Z')) / 86400000);
}

// ---------------------------------------------------------------------
export async function onRequestPost({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const action = String(body.action || '').trim();
  if (!ACTIONS.includes(action)) {
    return json({ error: 'action must be one of: ' + ACTIONS.join(', ') }, 400);
  }

  const subjectP = requireSubject(who, body.client_id);
  if (!subjectP.ok) return json({ error: subjectP.error }, subjectP.status);
  const clientId = subjectP.clientId;
  if (!clientId) return json({ error: 'client_id required' }, 400);

  const sb = db(env);

  if (action === 'consent') return recordConsent(env, sb, request, who, clientId);
  if (action === 'cancel') return cancelMembership(env, sb, who, clientId, body);
  return resumeMembership(env, sb, who, clientId);
}

async function recordConsent(env, sb, request, who, clientId) {
  const docs = await sb.select('consent_documents', {
    where: { kind: 'subscription' }, columns: 'id,version', raw: 'retired_at=is.null', limit: 1,
  });
  if (!docs || !docs.length) return json({ error: 'There is no subscription consent document' }, 500);
  const doc = docs[0];

  const existing = await sb.one('client_consents', {
    where: { client_id: clientId, document_id: doc.id }, columns: 'id,granted,withdrawn_at',
  });
  if (existing && existing.granted && !existing.withdrawn_at) {
    return json({ ok: true, already: true, document_version: doc.version, consent_id: existing.id });
  }

  const rows = await sb.insert('client_consents', {
    client_id: clientId, document_id: doc.id, granted: true,
    granted_at: new Date().toISOString(),
    ip: request.headers.get('cf-connecting-ip') || null,
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300) || null,
  }, { returning: true });

  return json({ ok: true, document_version: doc.version,
                consent_id: rows && rows[0] ? rows[0].id : null });
}

async function cancelMembership(env, sb, who, clientId, body) {
  const ent = await sb.one('entitlements', {
    where: { client_id: clientId },
    columns: 'id,kind,status,renews_on,effective_to,price_cents,cancel_at_period_end,stripe_subscription',
    raw: 'kind=in.(continuation_monthly,continuation_annual)&status=in.(active,suspended)',
    order: 'created_at.desc',
  });
  if (!ent) return json({ error: 'There is no membership to cancel' }, 404);
  if (ent.cancel_at_period_end) {
    return json({ ok: true, already: true,
                  ...cancellation(ent, today()) });
  }

  const c = cancellation(ent, today());

  // Stripe first. If Stripe says no, our row must not say cancelled: a member
  // who is told they are cancelled and then charged again is the worst available
  // outcome, and it is the one that happens if the local write goes first.
  const stripe = stripeState(env);
  if (ent.stripe_subscription) {
    if (!stripe.ready) {
      return json({ error: 'Cancellation is not available yet', why: stripe.why, stripe_ready: false }, 503);
    }
    const client = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient(),
    });
    // cancel_at_period_end, never an immediate cancel. Immediate would end a
    // period the member has paid for.
    await client.subscriptions.update(ent.stripe_subscription, { cancel_at_period_end: true });
  }

  await sb.update('entitlements', { id: ent.id }, {
    cancel_at_period_end: true,
    cancelled_at: new Date().toISOString(),
    access_until: c.access_until,
  });

  await sb.insert('audit_log', {
    actor_id: who.id, action: 'membership.cancelled', table_name: 'entitlements',
    subject_id: clientId,
    detail: { entitlement_id: ent.id, kind: ent.kind, access_until: c.access_until,
              reason: String(body.reason || '').slice(0, 300) || null,
              immediate: false, data_deleted: false },
  });

  return json({ ok: true, ...c, kind: ent.kind,
                // Said back explicitly, because this is the sentence people
                // most often assume the opposite of.
                data_deleted: false });
}

async function resumeMembership(env, sb, who, clientId) {
  const ent = await sb.one('entitlements', {
    where: { client_id: clientId, cancel_at_period_end: true },
    columns: 'id,kind,status,renews_on,access_until,stripe_subscription',
    raw: 'kind=in.(continuation_monthly,continuation_annual)',
    order: 'created_at.desc',
  });
  if (!ent) return json({ error: 'There is no cancelled membership to resume' }, 404);
  if (ent.access_until && ent.access_until < today()) {
    return json({ error: 'That membership has already ended. Starting again is a new purchase.' }, 409);
  }

  const stripe = stripeState(env);
  if (ent.stripe_subscription) {
    if (!stripe.ready) {
      return json({ error: 'Resuming is not available yet', why: stripe.why, stripe_ready: false }, 503);
    }
    const client = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: API_VERSION, httpClient: Stripe.createFetchHttpClient(),
    });
    await client.subscriptions.update(ent.stripe_subscription, { cancel_at_period_end: false });
  }

  await sb.update('entitlements', { id: ent.id }, {
    cancel_at_period_end: false, cancelled_at: null, access_until: null,
  });
  await sb.insert('audit_log', {
    actor_id: who.id, action: 'membership.resumed', table_name: 'entitlements',
    subject_id: clientId, detail: { entitlement_id: ent.id, kind: ent.kind },
  });
  return json({ ok: true, resumed: true, kind: ent.kind, renews_on: ent.renews_on });
}

export const onRequestPut = () => json({ error: 'Method not allowed' }, 405);
