// POST /api/wearable-sync
//
// The pull half. Polar and Google Health have no webhook we can rely on, and any provider's
// webhook can be missed, so every connection is pulled on a schedule as well. Called by the
// hourly Worker with the service secret, or by a member for their own devices.
//
// IDEMPOTENT ON MEMBER, PROVIDER AND DAY, the same way the morning brief is idempotent on
// member and day: the unique index decides, not this code remembering.
//
// It pulls YESTERDAY AND TODAY rather than only today. A night's sleep spans two dates and
// arrives at the provider hours after it ended, so a job that only ever asked about today
// would miss the sleep it most wanted on the morning it mattered.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { PROVIDERS } from './_wearables.js';
import { modeFor } from './_wearable_providers.js';
import { syncOneDay } from './wearable-webhook/[provider].js';

export const PULL_DAYS = 2;

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

export async function onRequestPost({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  let body = {};
  try { body = await request.json(); } catch { /* the cron sends nothing */ }
  const dryRun = body.dry_run === true;

  const sb = db(env);

  const master = await sb.one('feature_flags', { where: { key: 'WEARABLES_ENABLED' }, columns: 'enabled' });
  if (!master || master.enabled !== true) {
    // Not a failure. The switch is off and the job says so.
    return json({ ok: true, skipped: 'WEARABLES_ENABLED is off', synced: 0 });
  }

  // Which providers are on. A connection to a provider whose flag has since been turned off
  // is left alone rather than synced, because the flag is the instruction.
  const flags = await sb.select('feature_flags', { columns: 'key,enabled' });
  const on = new Set((flags || []).filter((f) => f.enabled === true).map((f) => f.key));

  const where = { status: 'connected' };
  const scope = who.kind === 'member' ? { ...where, client_id: who.id }
    : (body.client_id ? { ...where, client_id: body.client_id } : where);

  const conns = await sb.select('wearable_connections', {
    where: scope,
    columns: 'id,client_id,provider,status,connected_at,last_sync_at',
    order: 'last_sync_at.asc',
  });

  const out = { ok: true, considered: (conns || []).length, synced: 0, written: 0,
                held: 0, skipped: 0, failed: 0, rows: [] };

  const today = new Date();
  const days = [];
  for (let i = PULL_DAYS - 1; i >= 0; i--) {
    days.push(new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10));
  }

  for (const conn of (conns || [])) {
    const p = PROVIDERS[conn.provider];
    if (!p || !on.has(p.flag)) {
      out.skipped++;
      out.rows.push({ provider: conn.provider, result: 'skipped', why: `${p ? p.flag : conn.provider} is off` });
      continue;
    }
    if (dryRun) {
      out.rows.push({ provider: conn.provider, client_id: conn.client_id, days, dry_run: true,
                      mode: modeFor(env, conn.provider).mode });
      continue;
    }

    let written = 0, held = 0, error = null;
    for (const day of days) {
      const r = await syncOneDay(env, sb, { conn, provider: conn.provider, day });
      written += r.written || 0;
      held += r.held || 0;
      if (r.error) error = r.error;
    }
    out.synced++;
    out.written += written;
    out.held += held;
    if (error) out.failed++;
    out.rows.push({ provider: conn.provider, client_id: conn.client_id,
                    written, held, ...(error ? { error } : {}) });
  }

  return json(out);
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
