// GET /api/wearable-callback/<provider>?code=...&state=...
//
// Step two. The provider sends the member back here with a code. This exchanges it, stores
// the token encrypted, backfills thirty days so day 0 has a baseline, and only then marks
// the connection connected.
//
// THE ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE. A connection is marked connected LAST,
// after a sync has actually produced something, because F2 says nothing shows as connected
// unless a sync has succeeded and the database constraint refuses the row otherwise. Marking
// it connected on a successful token exchange would be marking it connected on the strength
// of a handshake.
//
// TOKENS NEVER REACH THE BROWSER. The member's browser carries a code and a state, both
// single use. The access token is exchanged server side, encrypted here, and written to a
// table no user role can read.

import { json, db } from '../_agent.js';
import { PROVIDERS, verifyState, encryptToken, TokenKeyMissing, KEY_VERSION } from '../_wearables.js';
import { exchangeCode, fetchDays, modeFor, SANDBOX } from '../_wearable_providers.js';
import { storeDay, isInternal } from '../_wearable_store.js';

export const BACKFILL_DAYS = 30;

function page(title, message, detail) {
  // A human is looking at this in a browser, so it answers in words rather than JSON.
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title><link rel="stylesheet" href="/portal/portal.css?v=20"></head><body>` +
    `<main class="wrap"><h1 class="vh">${title}</h1><section class="card">` +
    `<h2>${title}</h2><p>${message}</p>` +
    (detail ? `<p class="quiet">${detail}</p>` : '') +
    `<p><a href="/portal/devices">Back to your devices</a></p>` +
    `</section></main></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequestGet({ request, env, params }) {
  const provider = String(params.provider || '');
  const p = PROVIDERS[provider];
  if (!p) return page('Unknown device', 'That is not a provider we support.');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const denied = url.searchParams.get('error');

  if (denied) {
    return page('Not connected',
      `${p.label} did not give us permission, so nothing was connected.`,
      'You can try again whenever you like. Nothing has changed.');
  }
  if (!code || !state) {
    return page('Something is missing',
      'That link did not carry everything it needed, so nothing was connected.');
  }

  // THE STATE CHECK. Without it somebody can send a member's browser here carrying their
  // own code and attach THEIR device to this member's account.
  const checked = await verifyState(env.WEBHOOK_SECRET, state, { provider });
  if (!checked.ok) {
    console.error(`[wearable-callback] ${provider} state rejected: ${checked.reason}`);
    return page('That link cannot be trusted',
      'The security check on that link failed, so nothing was connected.',
      'This happens if the link is old, was used already, or did not come from us. Start again from your devices page.');
  }
  const clientId = checked.clientId;

  const sb = db(env);
  const conn = await sb.one('wearable_connections', {
    where: { client_id: clientId, provider }, columns: 'id,status,sync_cursor,consent_id',
  });
  if (!conn) {
    return page('We lost track of that', 'Start again from your devices page.');
  }

  // The verifier was left here by the connect step rather than sent through the browser.
  const verifier = String(conn.sync_cursor || '').startsWith('pkce:')
    ? String(conn.sync_cursor).slice(5) : null;

  const redirectUri = `${url.origin}/api/wearable-callback/${provider}`;
  const { mode } = modeFor(env, provider);

  let tokens;
  try {
    tokens = await exchangeCode(env, provider, { code, verifier, redirectUri });
  } catch (e) {
    const why = String(e && e.message || e).slice(0, 300);
    console.error(`[wearable-callback] ${provider} exchange failed: ${why}`);
    await sb.update('wearable_connections', { id: conn.id },
      { status: 'error', last_error: why, updated_at: new Date().toISOString() });
    return page('That did not work',
      `We could not finish connecting ${p.label}.`,
      'Nothing was saved. Try again, and if it keeps happening tell us on the weekly call.');
  }

  // Encrypt before storing. If the key is missing this REFUSES rather than writing a token
  // in clear text, and the member is told the connection failed, which is true.
  try {
    const access = await encryptToken(env.WEARABLE_TOKEN_KEY, tokens.access_token);
    const refresh = tokens.refresh_token
      ? await encryptToken(env.WEARABLE_TOKEN_KEY, tokens.refresh_token) : null;
    await sb.insert('wearable_tokens', {
      connection_id: conn.id,
      access_token: access,
      refresh_token: refresh,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || null,
      expires_at: tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null,
      key_version: KEY_VERSION,
      updated_at: new Date().toISOString(),
    }, { upsert: 'connection_id' });
  } catch (e) {
    const why = e instanceof TokenKeyMissing
      ? e.message
      : `could not store the token: ${String(e && e.message || e).slice(0, 200)}`;
    console.error(`[wearable-callback] ${provider}: ${why}`);
    await sb.update('wearable_connections', { id: conn.id },
      { status: 'error', last_error: why, updated_at: new Date().toISOString() });
    return page('We could not store that safely',
      `We will not keep a ${p.label} connection we cannot secure, so nothing was saved.`,
      'This is our problem and not yours. It has been logged.');
  }

  // The scopes they actually granted, which may be fewer than we asked for.
  const granted = String(tokens.scope || '').split(/[\s,]+/).filter(Boolean);
  await sb.update('wearable_connections', { id: conn.id }, {
    scopes: granted,
    // The verifier is spent. Clearing it means a replayed callback cannot reuse it.
    sync_cursor: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  });

  // THE BACKFILL. Thirty days, so day 0 has a baseline rather than starting from the day
  // somebody happened to connect.
  const internal = await isInternal(sb, clientId);
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - BACKFILL_DAYS * 86400000).toISOString().slice(0, 10);

  let written = 0, held = 0, refused = 0, syncError = null;
  try {
    const { days } = await fetchDays(env, provider, {
      accessToken: tokens.access_token, from, to: today, clientId,
    });
    for (const d of days) {
      const r = await storeDay(sb, {
        clientId, provider, day: d.day, payload: d.payload, mode, internal });
      written += r.written; held += r.held; refused += r.refused;
    }
  } catch (e) {
    syncError = String(e && e.message || e).slice(0, 300);
    console.error(`[wearable-callback] ${provider} backfill failed: ${syncError}`);
  }

  // CONNECTED ONLY IF A SYNC ACTUALLY PRODUCED SOMETHING. The constraint would refuse it
  // anyway; this decides it explicitly so the reason can be recorded.
  const now = new Date().toISOString();
  if (written > 0) {
    await sb.update('wearable_connections', { id: conn.id }, {
      status: 'connected', connected_at: now, last_sync_at: now,
      last_error: held ? `connected, and ${held} reading(s) were held` : null,
      updated_at: now,
    });
    return page(`${p.label} is connected`,
      `We brought back ${written} day${written === 1 ? '' : 's'} of readings.` +
      (held ? ` ${held} value${held === 1 ? '' : 's'} were held because we could not trust them yet.` : ''),
      mode === SANDBOX
        ? 'This is a sandbox connection on an internal test account. The readings are not real.'
        : 'Every number from a device is labelled MEASURED, and your ring or watch is named beside it.');
  }

  await sb.update('wearable_connections', { id: conn.id }, {
    status: 'error',
    last_error: syncError || (refused
      ? 'sandbox data is only written to an internal test account'
      : 'the provider returned no readings for the last thirty days'),
    updated_at: now,
  });
  return page('Connected, but with nothing to show yet',
    `We reached ${p.label} but it gave us no readings for the last thirty days, so we have not marked it connected.`,
    'That usually means the account has no data yet, or the membership that provides it has lapsed. Nothing is wrong on your side.');
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
