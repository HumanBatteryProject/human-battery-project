// GET /api/wearable-state
//
// Everything the Devices page needs, in one answer: each provider with its REAL state, the
// consent position, the latest readings, and anything held.
//
// THE STATE IS READ, NEVER INFERRED. A provider is connected because a connection row says
// connected, and the database will not let a row say that without a successful sync behind it.
// The page does not decide, and neither does this: both report.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { PROVIDERS } from './_wearables.js';
import { modeFor, SANDBOX } from './_wearable_providers.js';
import { requireSubject } from './_subject.js';

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

export async function onRequestGet({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  const url = new URL(request.url);
  // One rule, in _subject.js, because writing it inline is how the owner's own request
  // came to be refused with "client_id required" in five endpoints at once.
  const subject = requireSubject(who, url.searchParams.get('client_id'));
  if (!subject.ok) return json({ error: subject.error }, subject.status);
  const clientId = subject.clientId;

  const sb = db(env);

  const flags = await sb.select('feature_flags', { columns: 'key,enabled' });
  const on = new Set((flags || []).filter((f) => f.enabled === true).map((f) => f.key));
  const masterOn = on.has('WEARABLES_ENABLED');

  const conns = await sb.select('wearable_connections', {
    where: { client_id: clientId },
    columns: 'provider,status,scopes,connected_at,last_sync_at,last_error',
  });
  const byProvider = Object.fromEntries((conns || []).map((c) => [c.provider, c]));

  const doc = await sb.one('consent_documents', {
    where: { kind: 'health_data' }, columns: 'id,version,title,body', raw: 'retired_at=is.null' });
  const grant = doc ? await sb.one('client_consents', {
    where: { client_id: clientId, document_id: doc.id },
    columns: 'granted,granted_at,withdrawn_at', order: 'created_at.desc' }) : null;

  // The most recent day per provider, so the page shows what each device actually measured
  // rather than one mixed row.
  const recent = await sb.select('wearable_daily', {
    where: { client_id: clientId, is_held: false },
    columns: '*', order: 'day.desc', limit: 40,
  });
  const seen = new Set();
  const latest = [];
  for (const r of (recent || [])) {
    if (seen.has(r.provider)) continue;
    seen.add(r.provider);
    latest.push({
      ...r,
      provider_label: (PROVIDERS[r.provider] || {}).label || r.provider,
      // Provenance travels with the reading, so the page can say when something is sandbox.
      sandbox: !!(r.raw && r.raw._provenance && r.raw._provenance.source === 'sandbox'),
    });
  }

  const held = await sb.select('wearable_daily', {
    where: { client_id: clientId, is_held: true },
    columns: 'day,provider,held_reason', order: 'day.desc', limit: 12,
  });

  return json({
    master_on: masterOn,
    consent: {
      granted: !!(grant && grant.granted === true && !grant.withdrawn_at),
      granted_at: grant ? grant.granted_at : null,
      document_version: doc ? doc.version : null,
      title: doc ? doc.title : null,
      body: doc ? doc.body : null,
    },
    providers: Object.values(PROVIDERS).map((p) => ({
      key: p.key, label: p.label, v1: p.v1, note: p.note || null,
      flag: p.flag,
      flag_on: masterOn && on.has(p.flag),
      mode: modeFor(env, p.key).mode,
      sandbox_reason: modeFor(env, p.key).mode === SANDBOX ? modeFor(env, p.key).why : null,
      connection: byProvider[p.key] || null,
    })),
    latest,
    held: held || [],
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
