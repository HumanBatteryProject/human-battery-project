// One adapter per provider: where to send somebody, how to exchange a code, how to fetch
// a day, how to verify a webhook, how to revoke.
//
// EVERY PATH IS EXERCISABLE WITHOUT A CREDENTIAL. No client ID or secret exists for any
// provider yet, so each adapter has a sandbox mode that returns deterministic payloads in
// the shape the real API is expected to return. That is what makes the connect, sync,
// disconnect and webhook paths testable today instead of after the credentials arrive.
//
// AND SANDBOX DATA IS NEVER ALLOWED TO LOOK REAL. F2 ends "Never show demonstration data
// as live participant data", so two rules bind every mock write:
//
//   1. It only ever writes for a membership marked is_internal. A real participant cannot
//      receive a sandbox reading even by mistake.
//   2. Every row it writes records source: 'sandbox' in `raw`, so a row's own provenance
//      says where it came from, and the Devices page and the portal can say so.
//
// A provider is in sandbox mode when its credentials are absent, or when WEARABLE_SANDBOX
// is set. Absent credentials are the normal case right now, which means the code takes the
// sandbox path by default and the live path the moment a secret appears.

import { PROVIDERS, MAPPING } from './_wearables.js';

export const SANDBOX = 'sandbox';
export const LIVE = 'live';

/**
 * Which mode a provider is in, and why. Never guessed: the answer is the presence of the
 * credentials the provider registry declares.
 */
export function modeFor(env, provider) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`unknown provider ${provider}`);
  if (String(env.WEARABLE_SANDBOX || '') === '1') {
    return { mode: SANDBOX, why: 'WEARABLE_SANDBOX is set, so every provider is sandboxed' };
  }
  const missing = (p.credential || []).filter((k) => !env[k]);
  if (missing.length) {
    return { mode: SANDBOX, why: `${missing.join(' and ')} not set` };
  }
  return { mode: LIVE, why: null };
}

// ---------------------------------------------------------------------
// The sandbox payloads
// ---------------------------------------------------------------------
// Shaped to match the field names in MAPPING, so a sandbox sync exercises the real
// normalizer including its unit conversions. Deterministic from the member and the day, so
// the same day always produces the same numbers and a replay is detectable.
function seeded(clientId, day, salt) {
  let h = 2166136261;
  for (const ch of `${clientId}:${day}:${salt}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 1000) / 1000;          // 0 to 0.999
}
const span = (r, lo, hi) => Math.round((lo + r * (hi - lo)) * 100) / 100;

export function sandboxPayload(provider, clientId, day) {
  const r = (salt) => seeded(clientId, day, salt);
  const bedStart = `${day}T22:${String(Math.floor(r('bs') * 59)).padStart(2, '0')}:00Z`;
  const bedEnd = `${day}T06:${String(Math.floor(r('be') * 59)).padStart(2, '0')}:00Z`;
  const base = {
    // Seconds, because that is what the mapping expects to convert.
    total_sleep_duration: Math.round(span(r('sleep'), 6.2, 8.4) * 3600),
    efficiency: span(r('eff'), 82, 96),
    bedtime_start: bedStart,
    bedtime_end: bedEnd,
    lowest_heart_rate: Math.round(span(r('rhr'), 48, 62)),
    average_hrv: Math.round(span(r('hrv'), 28, 92)),
    average_breath: span(r('br'), 12.5, 16.5),
    readiness: { temperature_deviation: span(r('temp'), -0.4, 0.5) },
    steps: Math.round(span(r('steps'), 3200, 14500)),
    score: Math.round(span(r('score'), 55, 92)),
  };

  switch (provider) {
    case 'oura':
      return base;
    case 'whoop':
      return {
        start: bedStart, end: bedEnd,
        score: {
          stage_summary: { total_in_bed_time_milli: base.total_sleep_duration * 1000 },
          sleep_efficiency_percentage: base.efficiency,
          resting_heart_rate: base.lowest_heart_rate,
          hrv_rmssd_milli: base.average_hrv,
          respiratory_rate: base.average_breath,
          skin_temp_celsius: base.readiness.temperature_deviation,
          recovery_score: base.score,
        },
      };
    case 'polar':
      return {
        sleep_start_time: bedStart, sleep_end_time: bedEnd,
        sleep_charge: { sleep_duration_seconds: base.total_sleep_duration },
        heart_rate_samples: { resting: base.lowest_heart_rate },
        active_steps: base.steps,
      };
    case 'withings':
      return {
        startdate: bedStart, enddate: bedEnd,
        data: {
          total_sleep_time: base.total_sleep_duration,
          sleep_efficiency: base.efficiency,
          hr_average: base.lowest_heart_rate,
        },
        steps: base.steps,
        measures: {
          weight: span(r('wt'), 62, 104),
          systolic: Math.round(span(r('sys'), 104, 134)),
          diastolic: Math.round(span(r('dia'), 64, 86)),
        },
      };
    case 'garmin':
      return {
        sleepTimeInSeconds: base.total_sleep_duration,
        sleepEfficiencyPercentage: base.efficiency,
        sleepStartTimeInSeconds: bedStart,
        sleepEndTimeInSeconds: bedEnd,
        restingHeartRateInBeatsPerMinute: base.lowest_heart_rate,
        hrvSummary: { lastNightAvg: base.average_hrv },
        averageRespirationValue: base.average_breath,
        steps: base.steps,
        bodyBattery: Math.round(span(r('bb'), 20, 95)),
      };
    case 'google_health':
      return {
        sleep: {
          totalSleepMinutes: Math.round(base.total_sleep_duration / 60),
          efficiencyPercent: base.efficiency,
          startTime: bedStart, endTime: bedEnd,
        },
        heart: { restingHeartRateBpm: base.lowest_heart_rate, hrvRmssdMillis: base.average_hrv },
        activity: { steps: base.steps },
      };
    default:
      return base;
  }
}

// ---------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------
// The endpoints each provider publishes. Recorded here rather than scattered, and marked
// UNVERIFIED for the same reason the field mapping is: the documentation could not be
// fetched on 27 September 2026. A wrong URL fails loudly at the first live attempt with a
// network error naming the host, which is a safe way to be wrong. A wrong FIELD name would
// have been silent, which is why that one needed the plausibility bounds instead.
export const ENDPOINTS = {
  oura: {
    authorize: 'https://cloud.ouraring.com/oauth/authorize',
    token: 'https://api.ouraring.com/oauth/token',
    revoke: 'https://api.ouraring.com/oauth/revoke',
    scopes: ['daily', 'heartrate', 'personal'],
    data: (from, to) => `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${from}&end_date=${to}`,
  },
  whoop: {
    authorize: 'https://api.prod.whoop.com/oauth/oauth2/auth',
    token: 'https://api.prod.whoop.com/oauth/oauth2/token',
    revoke: null,
    scopes: ['read:sleep', 'read:recovery', 'read:profile', 'offline'],
    data: (from, to) => `https://api.prod.whoop.com/developer/v2/activity/sleep?start=${from}T00:00:00Z&end=${to}T23:59:59Z`,
  },
  polar: {
    authorize: 'https://flow.polar.com/oauth2/authorization',
    token: 'https://polarremote.com/v2/oauth2/token',
    revoke: null,
    scopes: ['accesslink.read_all'],
    data: () => 'https://www.polaraccesslink.com/v3/users/sleep',
  },
  withings: {
    authorize: 'https://account.withings.com/oauth2_user/authorize2',
    token: 'https://wbsapi.withings.net/v2/oauth2',
    revoke: null,
    scopes: ['user.metrics', 'user.sleepevents'],
    data: (from, to) => `https://wbsapi.withings.net/v2/sleep?action=getsummary&startdateymd=${from}&enddateymd=${to}`,
  },
  garmin: {
    authorize: 'https://connect.garmin.com/oauth2Confirm',
    token: 'https://diauth.garmin.com/di-oauth2-service/oauth/token',
    revoke: null,
    scopes: ['HEALTH_EXPORT'],
    data: (from, to) => `https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=${from}&uploadEndTimeInSeconds=${to}`,
  },
  google_health: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
    scopes: ['https://www.googleapis.com/auth/health.sleep.read',
             'https://www.googleapis.com/auth/health.heart_rate.read'],
    data: () => 'https://healthdata.googleapis.com/v1/users/me/dataSources',
  },
  apple_health_upload: {
    authorize: null, token: null, revoke: null, scopes: [], data: null,
  },
};

export function clientIdFor(env, provider) {
  const p = PROVIDERS[provider];
  const key = (p.credential || [])[0];
  return key ? env[key] : null;
}
function clientSecretFor(env, provider) {
  const p = PROVIDERS[provider];
  const key = (p.credential || [])[1];
  return key ? env[key] : null;
}

/** Where to send the member's browser. */
export function authorizeUrl(env, provider, { state, challenge, redirectUri }) {
  const e = ENDPOINTS[provider];
  if (!e || !e.authorize) throw new Error(`${provider} has no authorize endpoint`);
  const p = PROVIDERS[provider];
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientIdFor(env, provider) || 'SANDBOX_CLIENT_ID',
    redirect_uri: redirectUri,
    scope: e.scopes.join(' '),
    state,
  });
  if (p.pkce && challenge) {
    q.set('code_challenge', challenge);
    q.set('code_challenge_method', 'S256');
  }
  return `${e.authorize}?${q.toString()}`;
}

/**
 * Exchange the code for tokens. In sandbox mode it returns a token shaped like the real
 * one, clearly marked, so the connect path can be walked end to end.
 */
export async function exchangeCode(env, provider, { code, verifier, redirectUri }) {
  const { mode, why } = modeFor(env, provider);
  if (mode === SANDBOX) {
    return {
      mode, why,
      access_token: `sandbox-access-${provider}-${code}`.slice(0, 80),
      refresh_token: `sandbox-refresh-${provider}`,
      token_type: 'Bearer',
      scope: (ENDPOINTS[provider].scopes || []).join(' '),
      expires_in: 3600,
    };
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientIdFor(env, provider),
    client_secret: clientSecretFor(env, provider),
  });
  if (verifier) body.set('code_verifier', verifier);

  const res = await fetch(ENDPOINTS[provider].token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${provider} token exchange failed ${res.status}: ${text.slice(0, 200)}`);
  return { mode, ...JSON.parse(text) };
}

export async function refreshAccess(env, provider, refreshToken) {
  const { mode, why } = modeFor(env, provider);
  if (mode === SANDBOX) {
    return { mode, why, access_token: `sandbox-access-${provider}-refreshed`,
             refresh_token: refreshToken, expires_in: 3600 };
  }
  const res = await fetch(ENDPOINTS[provider].token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientIdFor(env, provider),
      client_secret: clientSecretFor(env, provider),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${provider} refresh failed ${res.status}: ${text.slice(0, 200)}`);
  return { mode, ...JSON.parse(text) };
}

/**
 * Days of data. Returns [{ day, payload }], which normalizeDay then turns into rows.
 *
 * The sandbox path returns one payload per day in the range, which is what makes the
 * 30-day backfill and the idempotence of a re-sync testable.
 */
export async function fetchDays(env, provider, { accessToken, from, to, clientId }) {
  const { mode, why } = modeFor(env, provider);
  const days = [];
  for (let d = new Date(from + 'T12:00:00Z'); d <= new Date(to + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  if (mode === SANDBOX) {
    return {
      mode, why,
      days: days.map((day) => ({ day, payload: { ...sandboxPayload(provider, clientId, day), _source: SANDBOX } })),
    };
  }

  const url = ENDPOINTS[provider].data(from, to);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${provider} data fetch failed ${res.status}: ${text.slice(0, 200)}`);
  const body = JSON.parse(text);

  // Providers wrap their collections differently. Unwrap the common shapes and, failing
  // that, say so rather than silently returning nothing.
  const list = Array.isArray(body) ? body
    : Array.isArray(body.data) ? body.data
    : Array.isArray(body.records) ? body.records
    : Array.isArray(body.body && body.body.series) ? body.body.series
    : null;
  if (!list) {
    throw new Error(`${provider} returned a shape with no recognisable collection: ${text.slice(0, 160)}`);
  }
  return {
    mode, why,
    days: list.map((item) => ({
      // The day the provider says, falling back to the range start rather than to today,
      // because guessing today would file somebody's sleep under the wrong date.
      day: String(item.day || item.date || item.summary_date || item.calendar_date || from).slice(0, 10),
      payload: item,
    })),
  };
}

export async function revokeAtProvider(env, provider, accessToken) {
  const { mode } = modeFor(env, provider);
  const e = ENDPOINTS[provider];
  if (mode === SANDBOX) {
    return { revoked: true, mode, note: 'sandbox mode, nothing to revoke at a provider' };
  }
  if (!e || !e.revoke) {
    // Said plainly rather than pretended. Some providers only offer revocation from their
    // own app, and a member deserves to be told that rather than assured it is done.
    return { revoked: false, mode,
             note: `${PROVIDERS[provider].label} publishes no revoke endpoint. The token is deleted here, and the member should also remove the connection in the ${PROVIDERS[provider].label} app.` };
  }
  const res = await fetch(e.revoke, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: accessToken, client_id: clientIdFor(env, provider) || '' }),
  });
  return { revoked: res.ok, mode, status: res.status };
}

// ---------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------
// Each provider signs differently. An unverified webhook body is an untrusted string and
// must never reach the database, which is the same rule the Stripe webhook follows.
const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

export const WEBHOOK_SECRET_KEYS = {
  oura: 'OURA_WEBHOOK_SECRET',
  whoop: 'WHOOP_WEBHOOK_SECRET',
  withings: 'WITHINGS_WEBHOOK_SECRET',
  garmin: 'GARMIN_WEBHOOK_SECRET',
};

/**
 * @returns {{ok:true} | {ok:false, reason:string}}
 */
export async function verifyWebhook(env, provider, { headers, rawBody }) {
  const secretKey = WEBHOOK_SECRET_KEYS[provider];
  const secret = secretKey ? env[secretKey] : null;

  if (!secret) {
    // FAILS CLOSED. Without a secret nothing can be verified, and accepting an unverified
    // body would let anybody write readings into a member's record. The sandbox path for
    // webhooks is an explicit test secret, not an absence of one.
    return { ok: false, reason: `${secretKey || 'a webhook secret'} is not set, so nothing can be verified. Refusing the delivery rather than trusting it.` };
  }

  const given = headers.get('x-hbp-wearable-signature')
    || headers.get('x-oura-signature')
    || headers.get('x-whoop-signature')
    || headers.get('x-withings-signature')
    || headers.get('x-garmin-signature');
  if (!given) return { ok: false, reason: 'the delivery carries no signature header' };

  const expected = await hmacHex(secret, rawBody);
  if (!constantTimeEqual(given.replace(/^sha256=/, ''), expected)) {
    return { ok: false, reason: 'the signature does not match the body' };
  }
  return { ok: true };
}

// Used by the tests to produce a correctly signed delivery.
export async function signWebhook(secret, rawBody) {
  return hmacHex(secret, rawBody);
}

/**
 * What a webhook delivery is telling us. Providers send a notification that something
 * changed rather than the data itself, so the handler's job is to work out WHO and WHICH
 * DAYS and then pull.
 */
export function webhookIntent(provider, body) {
  const b = body || {};
  const userId = b.user_id || b.userId || b.userid || b.subject
    || (b.data && (b.data.user_id || b.data.userId)) || null;
  const day = b.day || b.date || b.calendar_date
    || (b.data && (b.data.day || b.data.date)) || null;
  return {
    provider,
    provider_user_id: userId == null ? null : String(userId),
    day: day ? String(day).slice(0, 10) : null,
    // The provider's own id for this delivery, which is what makes a replay detectable.
    event_id: b.event_id || b.id || b.notification_id || null,
    kind: b.event_type || b.type || b.appli || 'update',
  };
}
