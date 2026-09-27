// POST /api/wearable-disconnect  { provider, readings: 'keep' | 'delete' }
//
// One control that does three things, per section 4 of the brief: revokes the token at the
// provider, deletes the stored token, and asks the member whether to keep or delete the
// readings already taken.
//
// THE READINGS ARE A SEPARATE QUESTION FROM THE CONNECTION, and asking is the whole point.
// Somebody unplugging a ring usually wants to stop new data, not erase three months of
// sleep. Somebody withdrawing consent usually wants both. Guessing either way is wrong, so
// the answer is required rather than defaulted.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { PROVIDERS, decryptToken } from './_wearables.js';
import { revokeAtProvider } from './_wearable_providers.js';
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

export async function onRequestPost({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const provider = String(body.provider || '').trim();
  const readings = String(body.readings || '').trim();
  const p = PROVIDERS[provider];
  if (!p) return json({ error: 'Unknown provider' }, 400);
  if (!['keep', 'delete'].includes(readings)) {
    return json({
      error: 'Say what should happen to the readings already taken',
      readings: ['keep', 'delete'],
      keep: 'Stop new readings. Everything already measured stays in your record and your history.',
      delete: 'Stop new readings and remove every reading this device has ever sent.',
    }, 400);
  }

  // One rule, in _subject.js, because writing it inline is how the owner's own request
  // came to be refused with "client_id required" in five endpoints at once.
  const subject = requireSubject(who, body.client_id);
  if (!subject.ok) return json({ error: subject.error }, subject.status);
  const clientId = subject.clientId;

  const sb = db(env);
  const conn = await sb.one('wearable_connections', {
    where: { client_id: clientId, provider }, columns: 'id,status',
  });
  if (!conn) return json({ error: `No ${p.label} connection to disconnect` }, 404);

  // REVOKE AT THE PROVIDER FIRST. Deleting our copy of the token first would leave a live
  // grant at the provider that nobody can see and nobody can withdraw.
  let revoked = { revoked: false, note: 'no token was stored, so there was nothing to revoke' };
  const tokenRow = await sb.one('wearable_tokens', {
    where: { connection_id: conn.id }, columns: 'access_token',
  });
  if (tokenRow) {
    try {
      const access = await decryptToken(env.WEARABLE_TOKEN_KEY, tokenRow.access_token);
      revoked = await revokeAtProvider(env, provider, access);
    } catch (e) {
      // The token is deleted regardless, and the member is told the truth about the grant
      // at the provider rather than being assured it is gone.
      revoked = { revoked: false, note: `we could not reach ${p.label} to revoke it: ${String(e.message || e).slice(0, 140)}` };
    }
  }

  // The token goes whatever happened above.
  await sb.update('wearable_tokens', { connection_id: conn.id }, {});
  await fetch(`${env.SUPABASE_URL}/rest/v1/wearable_tokens?connection_id=eq.${conn.id}`, {
    method: 'DELETE',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
               Prefer: 'return=minimal' },
  });

  let deletedReadings = 0;
  if (readings === 'delete') {
    const existing = await sb.select('wearable_daily', {
      where: { client_id: clientId, provider }, columns: 'id',
    });
    deletedReadings = (existing || []).length;
    await fetch(`${env.SUPABASE_URL}/rest/v1/wearable_daily?client_id=eq.${clientId}&provider=eq.${provider}`, {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                 Prefer: 'return=minimal' },
    });
  }

  const now = new Date().toISOString();
  await sb.update('wearable_connections', { id: conn.id }, {
    status: 'revoked',
    // Cleared, so nothing can read as connected afterwards. The constraint requires both
    // dates for 'connected', so leaving them would be harmless, but a revoked connection
    // claiming a last sync reads as if it is still working.
    connected_at: null, last_sync_at: null,
    scopes: [], sync_cursor: null,
    last_error: null,
    updated_at: now,
  });

  await sb.insert('audit_log', {
    actor_id: who.id, action: 'wearable.disconnected', table_name: 'wearable_connections',
    record_id: conn.id, subject_id: clientId,
    detail: { provider, readings, deleted_readings: deletedReadings,
              revoked_at_provider: revoked.revoked, note: revoked.note || null },
  });

  return json({
    ok: true, provider, label: p.label,
    token_deleted: true,
    revoked_at_provider: revoked.revoked,
    note: revoked.note || null,
    readings,
    deleted_readings: deletedReadings,
    statement: readings === 'delete'
      ? `${p.label} is disconnected and ${deletedReadings} reading(s) have been removed.`
      : `${p.label} is disconnected. Your existing readings are still in your record.`,
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
