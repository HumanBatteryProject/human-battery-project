// POST /api/wearable-webhook/<provider>
//
// Oura, WHOOP, Withings and Garmin tell us something changed. They do not send the data, so
// this works out who and which day and then pulls.
//
// SIGNATURE FIRST, ALWAYS. An unverified body is an untrusted string from the internet, and
// accepting one would let anybody write readings into a member's record. It fails CLOSED:
// no configured secret means the delivery is refused, not trusted.
//
// A REPLAY WRITES NO SECOND ROW, which is the brief's own test. Two things make that true:
// the delivery is claimed in webhook_events by its provider event id before any work, the
// same discipline the Stripe webhook uses, and the reading itself is upserted on
// (client_id, provider, day, is_held) so even an unclaimed replay updates rather than adds.
// Two mechanisms, because the first needs the provider to send an id and not all of them do.

import { json, db } from '../_agent.js';
import { PROVIDERS, decryptToken, needsRefresh, encryptToken, KEY_VERSION } from '../_wearables.js';
import { verifyWebhook, webhookIntent, fetchDays, refreshAccess, modeFor } from '../_wearable_providers.js';
import { storeDay, isInternal } from '../_wearable_store.js';

export async function onRequestPost({ request, env, params }) {
  const provider = String(params.provider || '');
  const p = PROVIDERS[provider];
  if (!p) return json({ error: 'unknown provider' }, 404);

  // Read the body ONCE, as text, because the signature is over the exact bytes.
  const rawBody = await request.text();

  const verified = await verifyWebhook(env, provider, { headers: request.headers, rawBody });
  if (!verified.ok) {
    console.error(`[wearable-webhook] ${provider} refused: ${verified.reason}`);
    // 401 rather than 400: this is an authentication failure, and providers back off on it
    // rather than retrying a malformed body forever.
    return json({ error: 'not verified', why: verified.reason }, 401);
  }

  let body = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch {
    return json({ error: 'the body is not JSON' }, 400);
  }

  const intent = webhookIntent(provider, body);
  const sb = db(env);

  // CLAIM BEFORE WORK. The unique index on (provider, event_id) makes the second claim fail,
  // and a failed claim means somebody already has it.
  if (intent.event_id) {
    try {
      await sb.insert('webhook_events', {
        provider: `wearable:${provider}`,
        event_id: String(intent.event_id),
        event_type: intent.kind,
        status: 'received',
        payload: body,
      });
    } catch (e) {
      if (/duplicate key|23505/.test(String(e.message || e))) {
        return json({ received: true, duplicate: true,
                      why: 'this delivery was recorded already, so it is a replay' });
      }
      throw e;
    }
  }

  // Who. The provider knows its own user id, not ours.
  let conn = null;
  if (intent.provider_user_id) {
    conn = await sb.one('wearable_connections', {
      where: { provider, provider_user_id: intent.provider_user_id },
      columns: 'id,client_id,status',
    });
  }
  if (!conn) {
    // Acknowledged, not errored. A delivery for somebody who is not ours is not a failure,
    // and returning an error would make the provider retry it forever.
    console.log(`[wearable-webhook] ${provider} delivery for an unknown user, acknowledged`);
    if (intent.event_id) {
      await sb.update('webhook_events',
        { provider: `wearable:${provider}`, event_id: String(intent.event_id) },
        { status: 'ignored', processed_at: new Date().toISOString(),
          error: 'no connection for that provider user id' });
    }
    return json({ received: true, matched: false });
  }

  const day = intent.day || new Date().toISOString().slice(0, 10);
  const result = await syncOneDay(env, sb, { conn, provider, day });

  if (intent.event_id) {
    await sb.update('webhook_events',
      { provider: `wearable:${provider}`, event_id: String(intent.event_id) },
      { status: result.error ? 'failed' : 'processed',
        processed_at: new Date().toISOString(),
        error: result.error || null });
  }

  return json({ received: true, matched: true, day, ...result });
}

/**
 * Pull one day for one connection. Shared with the pull sync, so a webhook and a scheduled
 * pull cannot disagree about what a day means.
 */
export async function syncOneDay(env, sb, { conn, provider, day }) {
  const tokenRow = await sb.one('wearable_tokens', {
    where: { connection_id: conn.id },
    columns: 'access_token,refresh_token,expires_at',
  });
  if (!tokenRow) return { written: 0, held: 0, error: 'no token for that connection' };

  let access;
  try {
    access = await decryptToken(env.WEARABLE_TOKEN_KEY, tokenRow.access_token);
  } catch (e) {
    return { written: 0, held: 0, error: `the stored token could not be read: ${String(e.message || e).slice(0, 120)}` };
  }

  // REFRESH BEFORE USE, not after failure. A failed sync looks identical to a member whose
  // device stopped reporting, so the distinction is worth a round trip.
  if (needsRefresh(tokenRow.expires_at) && tokenRow.refresh_token) {
    try {
      const refresh = await decryptToken(env.WEARABLE_TOKEN_KEY, tokenRow.refresh_token);
      const fresh = await refreshAccess(env, provider, refresh);
      access = fresh.access_token;
      await sb.update('wearable_tokens', { connection_id: conn.id }, {
        access_token: await encryptToken(env.WEARABLE_TOKEN_KEY, fresh.access_token),
        refresh_token: fresh.refresh_token
          ? await encryptToken(env.WEARABLE_TOKEN_KEY, fresh.refresh_token) : tokenRow.refresh_token,
        expires_at: fresh.expires_in
          ? new Date(Date.now() + Number(fresh.expires_in) * 1000).toISOString() : null,
        key_version: KEY_VERSION,
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      return { written: 0, held: 0, error: `token refresh failed: ${String(e.message || e).slice(0, 160)}` };
    }
  }

  const { mode } = modeFor(env, provider);
  const internal = await isInternal(sb, conn.client_id);

  try {
    const { days } = await fetchDays(env, provider, {
      accessToken: access, from: day, to: day, clientId: conn.client_id,
    });
    let written = 0, held = 0, refused = 0;
    for (const d of days) {
      const r = await storeDay(sb, {
        clientId: conn.client_id, provider, day: d.day, payload: d.payload, mode, internal });
      written += r.written; held += r.held; refused += r.refused;
    }
    const now = new Date().toISOString();
    await sb.update('wearable_connections', { id: conn.id }, {
      last_sync_at: now,
      // A sync that worked is what makes 'connected' true, and the constraint requires both
      // dates, so connected_at is set here if this is the first success.
      ...(written > 0 ? { status: 'connected', connected_at: conn.connected_at || now } : {}),
      last_error: null, updated_at: now,
    });
    return { written, held, refused };
  } catch (e) {
    const why = String(e && e.message || e).slice(0, 300);
    await sb.update('wearable_connections', { id: conn.id },
      { last_error: why, updated_at: new Date().toISOString() });
    return { written: 0, held: 0, error: why };
  }
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
