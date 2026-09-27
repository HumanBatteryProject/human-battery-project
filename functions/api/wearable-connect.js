// POST /api/wearable-connect  { provider }
//
// Step one of attaching a device. Returns the URL to send the member's browser to.
//
// FOUR THINGS HAVE TO BE TRUE BEFORE A MEMBER IS SENT ANYWHERE:
//
//   the provider is one we support and its flag is on
//   they have consented to device data, per section 5 of the brief
//   the state is signed and bound to THEM and to THIS provider
//   the PKCE verifier is kept server side, never in the browser
//
// The verifier is the reason this endpoint writes a row before redirecting: the callback
// needs it, and it must not travel through the member's browser where an attacker could
// read it. It lives on the pending connection.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { PROVIDERS, makeState, makeVerifier, challengeFor } from './_wearables.js';
import { authorizeUrl, modeFor, SANDBOX } from './_wearable_providers.js';
import { rateLimit, tooMany, callerIp } from './_ratelimit.js';
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

  const p = PROVIDERS[provider];
  if (!p) {
    return json({ error: 'Unknown provider', providers: Object.keys(PROVIDERS) }, 400);
  }
  if (p.auth === 'none') {
    return json({ error: `${p.label} has no cloud API. Upload your export file instead.`,
                  upload: '/api/wearable-upload' }, 400);
  }

  // One rule, in _subject.js, because writing it inline is how the owner's own request
  // came to be refused with "client_id required" in five endpoints at once.
  const subject = requireSubject(who, body.client_id);
  if (!subject.ok) return json({ error: subject.error }, subject.status);
  const clientId = subject.clientId;

  const limit = await rateLimit(env, 'waitlist_ip', `connect:${callerIp(request)}`);
  if (!limit.allowed) return tooMany(limit, 'connection attempts');

  const sb = db(env);

  // The flag. A provider whose flag is off is not offered, which is what stops a member
  // meeting an OAuth screen for something that cannot finish.
  const flag = await sb.one('feature_flags', { where: { key: p.flag }, columns: 'enabled' });
  const master = await sb.one('feature_flags', { where: { key: 'WEARABLES_ENABLED' }, columns: 'enabled' });
  if (!master || master.enabled !== true) {
    return json({ error: 'Device connections are switched off', flag: 'WEARABLES_ENABLED' }, 409);
  }
  if (!flag || flag.enabled !== true) {
    return json({ error: `${p.label} is not available yet`, flag: p.flag,
                  why: p.note || null }, 409);
  }

  // CONSENT, before anything else happens. Section 5: no consent row, no connection.
  // Checked against the health_data document because device readings ARE health data, and
  // the row records which version they agreed to.
  const doc = await sb.one('consent_documents', {
    where: { kind: 'health_data' }, columns: 'id,version', raw: 'retired_at=is.null',
  });
  if (!doc) return json({ error: 'There is no health data consent document to consent to' }, 500);
  const grant = await sb.one('client_consents', {
    where: { client_id: clientId, document_id: doc.id },
    columns: 'id,granted,withdrawn_at', order: 'created_at.desc',
  });
  if (!grant || grant.granted !== true || grant.withdrawn_at) {
    return json({
      error: 'You have not agreed to how we handle health data, and a device sends health data.',
      needs_consent: 'health_data',
      consent_document_version: doc.version,
    }, 409);
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/wearable-callback/${provider}`;

  const state = await makeState(env.WEBHOOK_SECRET, { clientId, provider });
  const verifier = p.pkce ? makeVerifier() : null;
  const challenge = verifier ? await challengeFor(verifier) : null;

  // The pending connection, which is where the verifier waits. Upserted so a member who
  // abandons a connect and tries again does not collide with themselves.
  await sb.insert('wearable_connections', {
    client_id: clientId, provider, status: 'pending',
    consent_id: grant.id,
    scopes: [],
    // The verifier is not a token, it is a one-time secret for this exchange, and it is
    // held here for the seconds between the redirect and the callback rather than being
    // handed to the browser.
    sync_cursor: verifier ? `pkce:${verifier}` : null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { upsert: 'client_id,provider' });

  const { mode, why } = modeFor(env, provider);
  const url = authorizeUrl(env, provider, { state, challenge, redirectUri });

  return json({
    provider, label: p.label, url,
    // Said out loud, because a sandbox connection must never be mistaken for a real one.
    mode,
    sandbox_reason: mode === SANDBOX ? why : null,
    consent_document_version: doc.version,
    pkce: !!verifier,
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
