// Wearables. The parts that can be tested without a credential, which is all of the
// parts that decide what a number MEANS.
//
// THE MAPPING IS UNVERIFIED and _wearables.js says so at the top: the vendor field
// names could not be confirmed from the public documentation on 27 September 2026. So
// these fixtures are aimed less at "does the mapping work" and more at "can a wrong
// mapping hurt anybody", which is the question that actually matters while the field
// names are a guess.
//
// The answer has to be no. A missing field must hold rather than read as nothing, and
// a unit error must hold rather than store a wrong number.

import {
  PROVIDERS, BUILD_NOW, FLAGGED_OFF, FIELDS, SOURCES, MAPPING,
  normalizeDay, vendorScore, vendorScoreFeedsBatteryScore,
  makeState, verifyState, makeVerifier, challengeFor, STATE_MAX_AGE_SECONDS,
  encryptToken, decryptToken, needsRefresh, REFRESH_BEFORE_SECONDS, TokenKeyMissing,
  dig,
} from '../functions/api/_wearables.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const SECRET = 'a-test-signing-secret';
const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

const OURA_GOOD = {
  total_sleep_duration: 25860,          // seconds, which is 431 minutes
  efficiency: 91,
  bedtime_start: '2026-09-26T23:10:00Z',
  bedtime_end: '2026-09-27T06:41:00Z',
  lowest_heart_rate: 52,
  average_hrv: 58,
  average_breath: 14.2,
  readiness: { temperature_deviation: -0.2 },
  steps: 8123,
  score: 78,
};

// =====================================================================
console.log('\nThe provider list matches the brief');
eq('four providers are built now', BUILD_NOW.sort(), ['oura', 'polar', 'whoop', 'withings']);
eq('two are built and flagged off', FLAGGED_OFF.sort(), ['garmin', 'google_health']);
ok('Apple Health is upload only, with no OAuth',
   PROVIDERS.apple_health_upload.auth === 'none' && PROVIDERS.apple_health_upload.sync === 'upload');
ok('Samsung and Health Connect are absent, per the brief',
   !PROVIDERS.samsung && !PROVIDERS.health_connect);
ok('Ultrahuman and Dexcom are absent, per the brief',
   !PROVIDERS.ultrahuman && !PROVIDERS.dexcom);
ok('no aggregator is present', !PROVIDERS.terra && !PROVIDERS.junction && !PROVIDERS.rook);
ok('WHOOP records that v1 must not be used', /v2 only/i.test(PROVIDERS.whoop.note));
ok('Google records that the old Fitbit Web API must not be built against',
   /Fitbit Web API/i.test(PROVIDERS.google_health.note));
for (const p of Object.values(PROVIDERS)) {
  ok(`${p.key} names the flag that governs it`, typeof p.flag === 'string' && p.flag.startsWith('WEARABLE_'));
}

console.log('\nEvery mapped field is one the brief says that provider can supply');
for (const [provider, map] of Object.entries(MAPPING)) {
  for (const field of Object.keys(map)) {
    ok(`${provider}.${field} is a documented source`, (SOURCES[field] || []).includes(provider),
       `${provider} is not listed for ${field}`);
    ok(`${provider}.${field} is a field in the schema`, !!FIELDS[field]);
  }
}
eq('time in daylight comes only from the Apple export', SOURCES.time_in_daylight_min, ['apple_health_upload']);
eq('weight comes only from Withings', SOURCES.weight_kg, ['withings']);

// =====================================================================
console.log('\nA correct payload normalizes');
{
  const r = normalizeDay('oura', '2026-09-27', OURA_GOOD);
  eq('seconds become minutes', r.row.sleep_duration_min, 431);
  eq('efficiency is a percentage', r.row.sleep_efficiency_pct, 91);
  eq('resting heart rate', r.row.resting_hr_bpm, 52);
  eq('HRV', r.row.hrv_rmssd_ms, 58);
  eq('nothing is held', r.held.length, 0);
  eq('the basis is MEASURED', r.row.basis, 'measured');
  ok('the raw value and its source field are kept beside the normalized one',
     r.row.raw.sleep_duration_min.from === 'total_sleep_duration'
     && r.row.raw.sleep_duration_min.value === 25860
     && r.row.raw.sleep_duration_min.unit === 'seconds',
     JSON.stringify(r.row.raw.sleep_duration_min));
  ok('the row is usable', r.usable);
}

console.log('\nA UNIT ERROR IS HELD, NOT STORED. This is the one that protects a member.');
{
  // The mistake that actually happens: the provider changes, or my guess was wrong,
  // and a value arrives in a different unit than the mapping expects.
  const r = normalizeDay('oura', '2026-09-27', { ...OURA_GOOD, total_sleep_duration: 431 });
  ok('minutes sent where seconds are expected is held',
     r.held.some((h) => h.field === 'sleep_duration_min'), JSON.stringify(r.held));
  ok('and the wrong number is NOT stored', r.row.sleep_duration_min === undefined,
     String(r.row.sleep_duration_min));
  ok('and the reason names the field the provider sent it in',
     /total_sleep_duration/.test(r.held.find((h) => h.field === 'sleep_duration_min').reason));
}
{
  const r = normalizeDay('oura', '2026-09-27', { ...OURA_GOOD, resting_hr_bpm: 52, lowest_heart_rate: 4 });
  ok('a heart rate of 4 is not plausible and is held',
     r.held.some((h) => h.field === 'resting_hr_bpm'));
}
{
  const r = normalizeDay('oura', '2026-09-27', { ...OURA_GOOD, average_hrv: 4000 });
  ok('an HRV of 4000 ms is not plausible and is held',
     r.held.some((h) => h.field === 'hrv_rmssd_ms'));
}

console.log('\nAn ABSENT field is held, never read as nothing');
{
  const short = { ...OURA_GOOD };
  delete short.average_hrv;
  const r = normalizeDay('oura', '2026-09-27', short);
  ok('a missing field is held', r.held.some((h) => h.field === 'hrv_rmssd_ms'));
  ok('and is not stored as null or zero', r.row.hrv_rmssd_ms === undefined);
  ok('and the reason says the mapping might be wrong',
     /mapping is wrong/.test(r.held.find((h) => h.field === 'hrv_rmssd_ms').reason));
}
{
  // Present and explicitly empty is different from absent: the member has no data.
  const r = normalizeDay('oura', '2026-09-27', { ...OURA_GOOD, average_hrv: null });
  ok('a field the provider sends as null is not held, because nothing is wrong',
     !r.held.some((h) => h.field === 'hrv_rmssd_ms'), JSON.stringify(r.held));
  ok('and it is simply not stored', r.row.hrv_rmssd_ms === undefined);
}
{
  const r = normalizeDay('oura', '2026-09-27', { ...OURA_GOOD, bedtime_start: 'last tuesday' });
  ok('an unparseable timestamp is held', r.held.some((h) => h.field === 'bedtime_start'));
}
{
  const r = normalizeDay('oura', '2026-09-27', { ...OURA_GOOD, efficiency: 'good' });
  ok('a word where a number belongs is held', r.held.some((h) => h.field === 'sleep_efficiency_pct'));
}
{
  const r = normalizeDay('oura', '2026-09-27', {});
  ok('an empty payload produces no usable row', !r.usable, JSON.stringify(r.row));
}

console.log('\nVendor scores are stored, named, and never scored');
{
  const v = vendorScore('oura', OURA_GOOD);
  eq('the Oura score carries the vendor name', v.vendor_score_name, 'Oura Readiness');
  eq('and its value', v.vendor_score_value, 78);
  eq('and states that it does not feed the Battery Score', v.feeds_battery_score, false);
  eq('which is also asserted on its own', vendorScoreFeedsBatteryScore(), false);
  eq('WHOOP names Recovery', vendorScore('whoop', { score: { recovery_score: 66 } }).vendor_score_name, 'WHOOP Recovery');
  eq('Garmin names Body Battery', vendorScore('garmin', { bodyBattery: 41 }).vendor_score_name, 'Garmin Body Battery');
  eq('a provider with no vendor score returns none', vendorScore('polar', { score: 5 }), null);
  ok('a vendor score is never one of the stored measurement fields',
     !Object.keys(FIELDS).some((f) => f.includes('vendor')));
}

// =====================================================================
console.log('\nOAuth state. A mismatch is rejected.');
{
  const state = await makeState(SECRET, { clientId: 'client-1', provider: 'oura' });
  const good = await verifyState(SECRET, state, { provider: 'oura' });
  ok('a state we issued verifies', good.ok);
  eq('and identifies the member it was issued for', good.clientId, 'client-1');

  const wrongProvider = await verifyState(SECRET, state, { provider: 'whoop' });
  ok('a code arriving at the wrong provider callback is rejected', !wrongProvider.ok);
  ok('and says why', /issued for oura/.test(wrongProvider.reason), wrongProvider.reason);

  const tampered = await verifyState(SECRET, state.slice(0, -4) + 'AAAA', { provider: 'oura' });
  ok('a tampered signature is rejected', !tampered.ok);

  const forged = await verifyState('a-different-secret', state, { provider: 'oura' });
  ok('a state signed with another secret is rejected', !forged.ok);

  const swapped = await verifyState(SECRET,
    state.replace('client-1', 'client-2'), { provider: 'oura' });
  ok('changing the member in the state is rejected, so a device cannot be attached to somebody else',
     !swapped.ok, JSON.stringify(swapped));

  ok('no state at all is rejected', !(await verifyState(SECRET, '', { provider: 'oura' })).ok);
  ok('a state of the wrong shape is rejected', !(await verifyState(SECRET, 'a.b.c', { provider: 'oura' })).ok);

  const old = await verifyState(SECRET, state,
    { provider: 'oura', nowMs: Date.now() + (STATE_MAX_AGE_SECONDS + 5) * 1000 });
  ok('an expired state is rejected', !old.ok);
  ok('and says it expired', /expired/.test(old.reason), old.reason);

  const future = await makeState(SECRET, { clientId: 'client-1', provider: 'oura', nowMs: Date.now() + 600000 });
  ok('a state from the future is rejected', !(await verifyState(SECRET, future, { provider: 'oura' })).ok);
}

console.log('\nPKCE');
{
  const v1 = makeVerifier(), v2 = makeVerifier();
  ok('a verifier is not predictable', v1 !== v2);
  ok('a verifier is long enough to matter', v1.length >= 43, String(v1.length));
  const c = await challengeFor(v1);
  ok('the challenge is a hash, not the verifier', c !== v1);
  eq('the same verifier always gives the same challenge', await challengeFor(v1), c);
  ok('a different verifier gives a different challenge', await challengeFor(v2) !== c);
  for (const key of ['oura', 'whoop', 'google_health']) {
    ok(`${key} is marked as supporting PKCE`, PROVIDERS[key].pkce === true);
  }
}

console.log('\nTokens are encrypted, and refuse to be stored if they cannot be');
{
  const ct = await encryptToken(KEY, 'the-access-token');
  ok('the ciphertext does not contain the token', !ct.includes('the-access-token'), ct);
  ok('it records which key version encrypted it', ct.startsWith('v1.'));
  eq('it round trips', await decryptToken(KEY, ct), 'the-access-token');
  const again = await encryptToken(KEY, 'the-access-token');
  ok('the same token encrypts differently each time, so the IV is not reused', ct !== again);

  let threw = null;
  try { await encryptToken('', 'x'); } catch (e) { threw = e; }
  ok('no key means REFUSING to store a token, not storing it in clear text',
     threw instanceof TokenKeyMissing, String(threw));
  ok('and the message says so', /clear text/.test(threw.message), threw.message);

  threw = null;
  try { await encryptToken(btoa('too short'), 'x'); } catch (e) { threw = e; }
  ok('a key of the wrong length is refused', threw instanceof TokenKeyMissing, String(threw && threw.message));

  threw = null;
  try { await decryptToken(KEY, 'not-a-token'); } catch (e) { threw = e; }
  ok('a malformed stored token is refused rather than returning rubbish', !!threw);
}

console.log('\nA token is refreshed before it expires, not after it fails');
{
  const now = Date.now();
  ok('an expiry inside the window needs a refresh',
     needsRefresh(new Date(now + 60000).toISOString(), now));
  ok('an expiry well ahead does not',
     !needsRefresh(new Date(now + 3600000).toISOString(), now));
  ok('an already expired token needs a refresh',
     needsRefresh(new Date(now - 1000).toISOString(), now));
  ok('no expiry recorded means nothing to refresh', !needsRefresh(null, now));
  ok('the window is at least a minute', REFRESH_BEFORE_SECONDS >= 60);
}

console.log('\nSmall things that would be easy to get wrong');
eq('dig reads a nested path', dig({ a: { b: { c: 7 } } }, 'a.b.c'), 7);
eq('dig on a missing path is undefined, not a throw', dig({ a: 1 }, 'a.b.c'), undefined);
eq('every field declares a unit', Object.values(FIELDS).every((f) => !!f.unit), true);
eq('every numeric field declares plausibility bounds',
   Object.entries(FIELDS).filter(([, f]) => f.unit !== 'timestamp')
     .every(([, f]) => f.low !== undefined && f.high !== undefined), true);

console.log(`\n${bad ? `FAILED: ${bad}` : 'wearable fixtures all pass'}`);
process.exit(bad ? 1 : 0);
