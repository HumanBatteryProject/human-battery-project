// POST /api/wearable-consent
//
// Section 5 of the brief: connecting a device writes a client_consents row against the
// health_data document, and no consent row means no connection.
//
// It is the SAME document the rest of the product uses for health data, not a device-specific
// one, because a device reading is health data and inventing a second consent for the same
// category would leave two records of one agreement that can disagree.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
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
  try { body = await request.json(); } catch { /* an empty body is a grant */ }

  // One rule, in _subject.js, because writing it inline is how the owner's own request
  // came to be refused with "client_id required" in five endpoints at once.
  const subject = requireSubject(who, body.client_id);
  if (!subject.ok) return json({ error: subject.error }, subject.status);
  const clientId = subject.clientId;

  const sb = db(env);
  const doc = await sb.one('consent_documents', {
    where: { kind: 'health_data' }, columns: 'id,version', raw: 'retired_at=is.null' });
  if (!doc) return json({ error: 'There is no health data consent document' }, 500);

  const withdraw = body.withdraw === true;

  if (withdraw) {
    // WITHDRAWING DISCONNECTS. Leaving a device attached after consent is withdrawn would be
    // continuing to collect health data somebody has just told us to stop collecting.
    await sb.update('client_consents',
      { client_id: clientId, document_id: doc.id },
      { withdrawn_at: new Date().toISOString() });

    const conns = await sb.select('wearable_connections', {
      where: { client_id: clientId }, columns: 'id,provider,status' });
    let disconnected = 0;
    for (const c of (conns || [])) {
      if (c.status === 'revoked') continue;
      await fetch(`${env.SUPABASE_URL}/rest/v1/wearable_tokens?connection_id=eq.${c.id}`, {
        method: 'DELETE',
        headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                   Prefer: 'return=minimal' } });
      await sb.update('wearable_connections', { id: c.id }, {
        status: 'revoked', connected_at: null, last_sync_at: null, scopes: [],
        last_error: 'health data consent was withdrawn', updated_at: new Date().toISOString() });
      disconnected++;
    }
    await sb.insert('audit_log', {
      actor_id: who.id, action: 'wearable.consent_withdrawn', table_name: 'client_consents',
      subject_id: clientId,
      detail: { document_version: doc.version, devices_disconnected: disconnected, readings_deleted: 0 },
    });
    return json({
      ok: true, withdrawn: true, devices_disconnected: disconnected,
      statement: `Consent withdrawn. ${disconnected} device connection(s) were removed and no new ` +
                 `readings will be collected. Readings already taken are still in your record: ask ` +
                 `us to delete them if you want them gone.`,
    });
  }

  const existing = await sb.one('client_consents', {
    where: { client_id: clientId, document_id: doc.id },
    columns: 'id,granted,withdrawn_at', order: 'created_at.desc' });
  if (existing && existing.granted === true && !existing.withdrawn_at) {
    return json({ ok: true, already: true, document_version: doc.version, consent_id: existing.id });
  }

  // RE-GRANTING UPDATES, IT DOES NOT INSERT. client_consents carries a FULL unique index on
  // (client_id, document_id), so there is one row per person per document for all time and a
  // second insert fails with a 23505. Withdrawing sets withdrawn_at on that row, so granting
  // again has to clear it rather than add a row beside it.
  //
  // Which means this schema keeps the CURRENT position rather than a history of grants and
  // withdrawals. The audit_log carries the history, which is where a sequence of events
  // belongs, and worth knowing rather than discovering later.
  const fields = {
    granted: true,
    granted_at: new Date().toISOString(),
    withdrawn_at: null,
    ip: request.headers.get('cf-connecting-ip') || null,
    user_agent: (request.headers.get('user-agent') || '').slice(0, 300) || null,
  };

  let consentId = existing ? existing.id : null;
  if (existing) {
    await sb.update('client_consents', { id: existing.id }, fields);
  } else {
    const rows = await sb.insert('client_consents',
      { client_id: clientId, document_id: doc.id, ...fields }, { returning: true });
    consentId = rows && rows[0] ? rows[0].id : null;
  }

  await sb.insert('audit_log', {
    actor_id: who.id, action: 'wearable.consent_granted', table_name: 'client_consents',
    record_id: consentId, subject_id: clientId,
    detail: { document_version: doc.version, regranted: !!existing },
  });

  return json({ ok: true, document_version: doc.version, consent_id: consentId,
                regranted: !!existing });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
