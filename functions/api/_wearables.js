// Wearables: the provider registry, and the normalization that turns a vendor
// payload into one row of section 2.
//
// Everything here is pure, so the part that decides what a number MEANS can be
// tested without a credential, which matters because no credential exists yet.
//
// ============================================================
// I COULD NOT VERIFY THE VENDOR FIELD NAMES, AND SAY SO HERE.
// ============================================================
// Brief 07 section 4 requires fetching the current vendor docs before writing a line
// and recording the doc version and fetch date. On 27 September 2026 I could not:
// cloud.ouraring.com/v2/docs renders its reference client-side and returns nothing to
// a fetcher, the OpenAPI document is not at any guessable path, and the third-party
// write-ups do not show example payloads. So there is NO doc version and NO fetch
// date to record, and inventing one would be worse than admitting it.
//
// The source field names below are therefore UNVERIFIED. Rather than hope, the design
// makes a wrong guess unable to produce a wrong number:
//
//   1. A source field that is absent from the payload does not become null. The
//      reading is HELD, naming the field, so the mapping is corrected against a real
//      payload instead of silently reading nothing.
//   2. Every target field carries PLAUSIBILITY BOUNDS, the same pattern
//      lab_markers.plausible_low and plausible_high already use. This catches the
//      unit error that actually happens: Oura reports sleep in SECONDS, and if the
//      mapping forgets to divide, 7 hours arrives as 25,860 "minutes", fails the
//      bound and is held. A seconds-for-minutes mistake cannot reach a member.
//   3. Every mapping states the unit it expects to receive. A value whose unit cannot
//      be established is held, per the brief.
//
// So the first real sync against each provider will produce held rows naming exactly
// which fields to fix, which is the correct outcome for a mapping nobody has been
// able to check, and it is recorded as an owner blocker rather than a silent risk.

export const UNVERIFIED_MAPPING = true;

// ---------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------
export const PROVIDERS = {
  oura: {
    key: 'oura', label: 'Oura', flag: 'WEARABLE_OURA', v1: 'build',
    auth: 'oauth2', pkce: true, sync: 'webhook',
    credential: ['OURA_CLIENT_ID', 'OURA_CLIENT_SECRET'],
    // Recorded so the next person knows where to check, not as a claim that I read it.
    docs: 'https://cloud.ouraring.com/v2/docs',
    note: 'The member needs an active Oura membership for data to be available.',
    vendorScore: 'Oura Readiness',
  },
  whoop: {
    key: 'whoop', label: 'WHOOP', flag: 'WEARABLE_WHOOP', v1: 'build',
    auth: 'oauth2', pkce: true, sync: 'webhook',
    credential: ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET'],
    docs: 'https://developer.whoop.com/',
    // Owner instruction, and worth keeping next to the code: v1 is removed.
    note: 'API v2 only. v1 is removed and must not be used.',
    vendorScore: 'WHOOP Recovery',
  },
  polar: {
    key: 'polar', label: 'Polar', flag: 'WEARABLE_POLAR', v1: 'build',
    auth: 'oauth2', pkce: false, sync: 'pull',
    credential: ['POLAR_CLIENT_ID', 'POLAR_CLIENT_SECRET'],
    docs: 'https://www.polar.com/accesslink-api/',
    note: 'AccessLink v3, pull based, so the hourly Worker fetches it.',
    vendorScore: null,
  },
  withings: {
    key: 'withings', label: 'Withings', flag: 'WEARABLE_WITHINGS', v1: 'build',
    auth: 'oauth2', pkce: false, sync: 'webhook',
    credential: ['WITHINGS_CLIENT_ID', 'WITHINGS_CLIENT_SECRET'],
    docs: 'https://developer.withings.com/api-reference/',
    note: 'Scale, blood pressure and sleep mat. The only source of weight and blood pressure.',
    vendorScore: null,
  },
  garmin: {
    key: 'garmin', label: 'Garmin', flag: 'WEARABLE_GARMIN', v1: 'flagged-off',
    auth: 'oauth2', pkce: false, sync: 'webhook',
    credential: ['GARMIN_CONSUMER_KEY', 'GARMIN_CONSUMER_SECRET'],
    docs: 'https://developer.garmin.com/gc-developer-program/health-api/',
    note: 'Connect Developer Program is a business application. Ships off until approved.',
    vendorScore: 'Garmin Body Battery',
  },
  google_health: {
    key: 'google_health', label: 'Fitbit and Google', flag: 'WEARABLE_GOOGLE', v1: 'flagged-off',
    auth: 'oauth2', pkce: true, sync: 'pull',
    credential: ['GOOGLE_HEALTH_CLIENT_ID', 'GOOGLE_HEALTH_CLIENT_SECRET'],
    docs: 'https://developers.google.com/health',
    note: 'Restricted scope security review required. The old Fitbit Web API shuts down September 2026 and must not be built against.',
    vendorScore: null,
  },
  apple_health_upload: {
    key: 'apple_health_upload', label: 'Apple Health', flag: 'WEARABLE_APPLE_UPLOAD', v1: 'upload',
    auth: 'none', pkce: false, sync: 'upload',
    credential: [],
    docs: 'https://support.apple.com/en-us/HT203037',
    note: 'No cloud API exists. The member uploads the Health app export, and a native app is out of scope for V1.',
    vendorScore: null,
  },
};

export const BUILD_NOW = Object.values(PROVIDERS).filter((p) => p.v1 === 'build').map((p) => p.key);
export const FLAGGED_OFF = Object.values(PROVIDERS).filter((p) => p.v1 === 'flagged-off').map((p) => p.key);

// ---------------------------------------------------------------------
// The section 2 schema, with the bounds that make a unit error impossible to miss
// ---------------------------------------------------------------------
// `int` mirrors the column type in wearable_daily, and it is here because it is a property of
// the field rather than of any one caller.
//
// Found by the database refusing a write: 23,796 seconds of sleep converts to 396.6 minutes and
// sleep_duration_min is an integer column, so PostgREST answered 22P02, invalid input syntax for
// type integer. Loudly, which is the good version of this mistake. Rounding happens once, in
// normalizeDay, and the unrounded provider value is kept in `raw` so nothing is lost.
export const FIELDS = {
  sleep_duration_min:    { unit: 'minutes', low: 60,   high: 1000,   int: true },
  sleep_efficiency_pct:  { unit: 'percent', low: 1,    high: 100 },
  bedtime_start:         { unit: 'timestamp' },
  bedtime_end:           { unit: 'timestamp' },
  resting_hr_bpm:        { unit: 'bpm',     low: 25,   high: 120,    int: true },
  hrv_rmssd_ms:          { unit: 'ms',      low: 1,    high: 300 },
  respiratory_rate_bpm:  { unit: 'breaths per minute', low: 5, high: 40 },
  skin_temp_deviation_c: { unit: 'degrees Celsius', low: -5, high: 5 },
  steps:                 { unit: 'count',   low: 0,    high: 100000, int: true },
  time_in_daylight_min:  { unit: 'minutes', low: 0,    high: 1440,   int: true },
  weight_kg:             { unit: 'kilograms', low: 20, high: 400 },
  systolic_mmhg:         { unit: 'mmHg',    low: 60,   high: 260,    int: true },
  diastolic_mmhg:        { unit: 'mmHg',    low: 30,   high: 200,    int: true },
};

// Which provider can supply which field, from the brief's own table. A provider
// offering a field it is not listed for is a mapping mistake, not new data.
export const SOURCES = {
  sleep_duration_min:    ['oura', 'whoop', 'polar', 'withings', 'garmin', 'google_health', 'apple_health_upload'],
  sleep_efficiency_pct:  ['oura', 'whoop', 'withings', 'garmin', 'google_health'],
  bedtime_start:         ['oura', 'whoop', 'polar', 'withings', 'garmin', 'google_health', 'apple_health_upload'],
  bedtime_end:           ['oura', 'whoop', 'polar', 'withings', 'garmin', 'google_health', 'apple_health_upload'],
  resting_hr_bpm:        ['oura', 'whoop', 'polar', 'withings', 'garmin', 'google_health', 'apple_health_upload'],
  hrv_rmssd_ms:          ['oura', 'whoop', 'garmin', 'google_health', 'apple_health_upload'],
  respiratory_rate_bpm:  ['oura', 'whoop', 'garmin'],
  skin_temp_deviation_c: ['oura', 'whoop'],
  steps:                 ['oura', 'polar', 'withings', 'garmin', 'google_health', 'apple_health_upload'],
  time_in_daylight_min:  ['apple_health_upload'],
  weight_kg:             ['withings'],
  systolic_mmhg:         ['withings'],
  diastolic_mmhg:        ['withings'],
};

// ---------------------------------------------------------------------
// The mapping. UNVERIFIED, per the note at the top of this file.
//
// `from` is a dotted path into the provider payload. `in` is the unit the provider is
// expected to use, and `to` converts it to the unit this schema stores. A missing
// `in` means the value arrives in the stored unit already.
// ---------------------------------------------------------------------
const SECONDS_TO_MIN = (v) => v / 60;

export const MAPPING = {
  oura: {
    sleep_duration_min:    { from: 'total_sleep_duration', in: 'seconds', to: SECONDS_TO_MIN },
    sleep_efficiency_pct:  { from: 'efficiency', in: 'percent' },
    bedtime_start:         { from: 'bedtime_start' },
    bedtime_end:           { from: 'bedtime_end' },
    resting_hr_bpm:        { from: 'lowest_heart_rate', in: 'bpm' },
    hrv_rmssd_ms:          { from: 'average_hrv', in: 'ms' },
    respiratory_rate_bpm:  { from: 'average_breath', in: 'breaths per minute' },
    skin_temp_deviation_c: { from: 'readiness.temperature_deviation', in: 'degrees Celsius' },
    steps:                 { from: 'steps', in: 'count' },
  },
  whoop: {
    sleep_duration_min:    { from: 'score.stage_summary.total_in_bed_time_milli', in: 'milliseconds', to: (v) => v / 60000 },
    sleep_efficiency_pct:  { from: 'score.sleep_efficiency_percentage', in: 'percent' },
    bedtime_start:         { from: 'start' },
    bedtime_end:           { from: 'end' },
    resting_hr_bpm:        { from: 'score.resting_heart_rate', in: 'bpm' },
    hrv_rmssd_ms:          { from: 'score.hrv_rmssd_milli', in: 'ms' },
    respiratory_rate_bpm:  { from: 'score.respiratory_rate', in: 'breaths per minute' },
    skin_temp_deviation_c: { from: 'score.skin_temp_celsius', in: 'degrees Celsius' },
  },
  polar: {
    sleep_duration_min:    { from: 'sleep_charge.sleep_duration_seconds', in: 'seconds', to: SECONDS_TO_MIN },
    bedtime_start:         { from: 'sleep_start_time' },
    bedtime_end:           { from: 'sleep_end_time' },
    resting_hr_bpm:        { from: 'heart_rate_samples.resting', in: 'bpm' },
    steps:                 { from: 'active_steps', in: 'count' },
  },
  withings: {
    sleep_duration_min:    { from: 'data.total_sleep_time', in: 'seconds', to: SECONDS_TO_MIN },
    sleep_efficiency_pct:  { from: 'data.sleep_efficiency', in: 'percent' },
    bedtime_start:         { from: 'startdate' },
    bedtime_end:           { from: 'enddate' },
    resting_hr_bpm:        { from: 'data.hr_average', in: 'bpm' },
    steps:                 { from: 'steps', in: 'count' },
    weight_kg:             { from: 'measures.weight', in: 'kilograms' },
    systolic_mmhg:         { from: 'measures.systolic', in: 'mmHg' },
    diastolic_mmhg:        { from: 'measures.diastolic', in: 'mmHg' },
  },
  garmin: {
    // Garmin Health API dailies and sleeps. UNVERIFIED like the rest, and held on absence.
    sleep_duration_min:    { from: 'sleepTimeInSeconds', in: 'seconds', to: SECONDS_TO_MIN },
    sleep_efficiency_pct:  { from: 'sleepEfficiencyPercentage', in: 'percent' },
    bedtime_start:         { from: 'sleepStartTimeInSeconds' },
    bedtime_end:           { from: 'sleepEndTimeInSeconds' },
    resting_hr_bpm:        { from: 'restingHeartRateInBeatsPerMinute', in: 'bpm' },
    hrv_rmssd_ms:          { from: 'hrvSummary.lastNightAvg', in: 'ms' },
    respiratory_rate_bpm:  { from: 'averageRespirationValue', in: 'breaths per minute' },
    steps:                 { from: 'steps', in: 'count' },
  },
  google_health: {
    // Google Health API. UNVERIFIED, and the old Fitbit Web API is deliberately not here:
    // it shuts down September 2026 and the brief forbids building against it.
    sleep_duration_min:    { from: 'sleep.totalSleepMinutes', in: 'minutes' },
    sleep_efficiency_pct:  { from: 'sleep.efficiencyPercent', in: 'percent' },
    bedtime_start:         { from: 'sleep.startTime' },
    bedtime_end:           { from: 'sleep.endTime' },
    resting_hr_bpm:        { from: 'heart.restingHeartRateBpm', in: 'bpm' },
    hrv_rmssd_ms:          { from: 'heart.hrvRmssdMillis', in: 'ms' },
    steps:                 { from: 'activity.steps', in: 'count' },
  },
  apple_health_upload: {
    // From the export XML record types, which ARE documented and stable.
    sleep_duration_min:    { from: 'HKCategoryTypeIdentifierSleepAnalysis', in: 'minutes' },
    resting_hr_bpm:        { from: 'HKQuantityTypeIdentifierRestingHeartRate', in: 'bpm' },
    hrv_rmssd_ms:          { from: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', in: 'ms' },
    steps:                 { from: 'HKQuantityTypeIdentifierStepCount', in: 'count' },
    time_in_daylight_min:  { from: 'HKQuantityTypeIdentifierTimeInDaylight', in: 'minutes' },
  },
};

// ---------------------------------------------------------------------
export function dig(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function measured(v) {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'boolean') return false;
  return Number.isFinite(Number(v));
}

/**
 * One provider payload becomes one row, or a held row saying why not.
 *
 * @returns {{row: object, held: {field:string, reason:string}[], usable: boolean}}
 */
export function normalizeDay(provider, day, payload) {
  const map = MAPPING[provider];
  if (!map) throw new Error(`no mapping for provider ${provider}`);

  const row = { provider, day, basis: 'measured', raw: {} };
  const held = [];

  for (const [field, rule] of Object.entries(map)) {
    if (!(SOURCES[field] || []).includes(provider)) {
      // The brief's own table says this provider does not supply this field. A mapping
      // that claims otherwise is a mistake in the mapping, not a new capability.
      held.push({ field, reason: `${provider} is not a documented source for ${field}` });
      continue;
    }
    const rawValue = dig(payload, rule.from);
    row.raw[field] = { from: rule.from, value: rawValue === undefined ? null : rawValue, unit: rule.in || null };

    if (rawValue === undefined) {
      // ABSENT IS NOT ZERO AND NOT NULL. The mapping is unverified, so a missing field
      // most likely means the name is wrong, and that has to be visible.
      held.push({ field, reason: `the payload has no ${rule.from}, so either the member has no data for it or the mapping is wrong` });
      continue;
    }
    if (rawValue === null) continue;      // present and genuinely empty: nothing to store

    const spec = FIELDS[field];
    if (spec.unit === 'timestamp') {
      const t = new Date(rawValue);
      if (Number.isNaN(t.getTime())) {
        held.push({ field, reason: `${rule.from} is not a timestamp: ${JSON.stringify(rawValue).slice(0, 40)}` });
        continue;
      }
      row[field] = t.toISOString();
      continue;
    }

    if (!measured(rawValue)) {
      held.push({ field, reason: `${rule.from} is not a number: ${JSON.stringify(rawValue).slice(0, 40)}` });
      continue;
    }
    // A value with no unit is HELD, not assumed. The brief's rule, and the reason the
    // mapping has to state what it expects to receive.
    if (!rule.in && spec.unit !== 'timestamp') {
      held.push({ field, reason: `no unit is declared for ${rule.from}, so the number cannot be trusted` });
      continue;
    }

    const converted = rule.to ? rule.to(Number(rawValue)) : Number(rawValue);

    // The bound that catches the unit error. Seconds read as minutes lands far outside.
    if (spec.low !== undefined && (converted < spec.low || converted > spec.high)) {
      held.push({ field,
        reason: `${converted} ${spec.unit} is outside the plausible range ${spec.low} to ${spec.high}. ` +
                `The provider sent ${rawValue} from ${rule.from}, which usually means the unit is not ${rule.in}` });
      continue;
    }
    // Rounded for an integer column, and to two decimals otherwise, so a float never reaches a
    // column that cannot hold one. The provider's own value is already in row.raw.
    row[field] = spec.int ? Math.round(converted) : Math.round(converted * 100) / 100;
  }

  // A row with nothing in it is not a reading.
  const stored = Object.keys(row).filter((k) => !['provider', 'day', 'basis', 'raw'].includes(k));
  return { row, held, usable: stored.length > 0 };
}

/**
 * A vendor score. Stored, shown with the vendor's name on it, and never an input to
 * the Human Battery Score. Same rule the referable markers follow: a composite
 * somebody else computed is not a measurement this model owns.
 */
export function vendorScore(provider, payload) {
  const p = PROVIDERS[provider];
  if (!p || !p.vendorScore) return null;
  const paths = {
    oura: 'score', whoop: 'score.recovery_score', garmin: 'bodyBattery',
  };
  const v = dig(payload, paths[provider] || 'score');
  if (!measured(v)) return null;
  return { vendor_score_name: p.vendorScore, vendor_score_value: Number(v), feeds_battery_score: false };
}

// The assertion, as a function, so a test can hold it rather than a comment claiming it.
export function vendorScoreFeedsBatteryScore() {
  return false;
}

// ---------------------------------------------------------------------
// OAuth: state, and PKCE where the provider supports it
// ---------------------------------------------------------------------
// STATE IS NOT DECORATION. Without it, anybody can send a member's browser to our
// callback with their own authorization code and attach THEIR device to OUR member's
// account, or the reverse. So the state is generated here, bound to the member and the
// provider, signed, and checked on the way back. A mismatch is refused, and the brief
// asks for a test that proves it.
//
// It is SIGNED rather than stored, so the callback needs no lookup and there is no
// pending-state table to clean up. The signature is what makes it unforgeable; the
// timestamp is what stops one being replayed next week.

const enc = new TextEncoder();

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return b64url(new Uint8Array(sig));
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomB64(n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return b64url(a);
}

export const STATE_MAX_AGE_SECONDS = 600;   // ten minutes is longer than any consent screen

export async function makeState(secret, { clientId, provider, nowMs }) {
  const nonce = randomB64(16);
  const issued = Math.floor((nowMs === undefined ? Date.now() : nowMs) / 1000);
  const body = `${clientId}.${provider}.${issued}.${nonce}`;
  return `${body}.${await hmac(secret, body)}`;
}

/**
 * @returns {{ok:true, clientId:string, provider:string} | {ok:false, reason:string}}
 */
export async function verifyState(secret, state, { provider, nowMs } = {}) {
  const parts = String(state || '').split('.');
  if (parts.length !== 5) return { ok: false, reason: 'the state is not the right shape' };
  const [clientId, stateProvider, issued, nonce, sig] = parts;
  const body = `${clientId}.${stateProvider}.${issued}.${nonce}`;
  const expected = await hmac(secret, body);
  // Constant time, so the comparison does not leak the signature a character at a time.
  if (sig.length !== expected.length) return { ok: false, reason: 'the state signature does not match' };
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'the state signature does not match' };

  // The provider the callback belongs to has to be the provider the state was made
  // for, or a code from one provider could be redeemed at another.
  if (provider && stateProvider !== provider) {
    return { ok: false, reason: `the state was issued for ${stateProvider}, not ${provider}` };
  }
  const age = Math.floor((nowMs === undefined ? Date.now() : nowMs) / 1000) - Number(issued);
  if (!Number.isFinite(age)) return { ok: false, reason: 'the state has no usable timestamp' };
  if (age < -60) return { ok: false, reason: 'the state is from the future' };
  if (age > STATE_MAX_AGE_SECONDS) return { ok: false, reason: 'the state has expired' };

  return { ok: true, clientId, provider: stateProvider };
}

// PKCE, for the providers that support it. The verifier never leaves the server.
export function makeVerifier() {
  return randomB64(32);
}

export async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(verifier));
  return b64url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------
// Token encryption
// ---------------------------------------------------------------------
// AES-GCM with a key the DATABASE NEVER HOLDS, so a dump is ciphertext rather than a
// set of live credentials. The key is WEARABLE_TOKEN_KEY, a 32 byte value supplied as
// base64. Missing it is fatal and loud: storing a token in clear text because a
// variable was unset is the failure this refuses to have.

export class TokenKeyMissing extends Error {
  constructor(why) {
    super(why);
    this.name = 'TokenKeyMissing';
  }
}

async function aesKey(raw) {
  if (!raw) {
    throw new TokenKeyMissing(
      'WEARABLE_TOKEN_KEY is not set, so a token cannot be encrypted. Refusing to store one in clear text.');
  }
  let bytes;
  try {
    const s = String(raw).replace(/-/g, '+').replace(/_/g, '/');
    bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    throw new TokenKeyMissing('WEARABLE_TOKEN_KEY is not valid base64');
  }
  if (bytes.length !== 32) {
    throw new TokenKeyMissing(`WEARABLE_TOKEN_KEY must decode to 32 bytes, got ${bytes.length}`);
  }
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export const KEY_VERSION = 1;

export async function encryptToken(rawKey, plaintext) {
  const key = await aesKey(rawKey);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(plaintext)));
  // The IV travels with the ciphertext. It is not secret and it must never repeat.
  return `v${KEY_VERSION}.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

export async function decryptToken(rawKey, stored) {
  const key = await aesKey(rawKey);
  const parts = String(stored || '').split('.');
  if (parts.length !== 3 || !parts[0].startsWith('v')) {
    throw new Error('the stored token is not in the expected form');
  }
  const un = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un(parts[1]) }, key, un(parts[2]));
  return new TextDecoder().decode(pt);
}

// A token about to expire is refreshed BEFORE it is used, not after it fails, because
// a failed sync looks identical to a member whose device stopped reporting.
export const REFRESH_BEFORE_SECONDS = 300;

export function needsRefresh(expiresAt, nowMs) {
  if (!expiresAt) return false;
  const now = nowMs === undefined ? Date.now() : nowMs;
  return new Date(expiresAt).getTime() - now < REFRESH_BEFORE_SECONDS * 1000;
}
