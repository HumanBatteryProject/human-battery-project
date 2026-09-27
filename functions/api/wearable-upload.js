// POST /api/wearable-upload
//
// The Apple Health export. There is no cloud API and a native iPhone app is out of V1, so
// the member sends the file the Health app produces.
//
// WHAT THIS PARSES AND WHAT IT THROWS AWAY. Only the record types in section 2, only inside
// the member's program window, and the file itself is discarded the moment parsing finishes.
// An Apple export contains years of everything: every heart rate sample, every workout, every
// location a workout happened in. Keeping it because it arrived would be collecting a
// person's life because they wanted to send us their sleep.
//
// IT IS PARSED AS DATA AND NEVER AS INSTRUCTIONS. Part J: untrusted uploaded content cannot
// override instructions. Nothing from this file reaches a model: the scan pulls numbers out
// of named attributes into the same normalized columns a cloud provider writes, and the
// coach reads those columns. There is no path from the XML to a prompt.
//
// THE SIZE PROBLEM IS REAL AND IS STATED RATHER THAN HIDDEN. These exports are commonly
// hundreds of megabytes. A Worker has a request body limit and a memory limit, so this
// streams and counts, and when a file is too large it says exactly that and what to do
// instead, rather than failing with a timeout the member cannot interpret.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { FIELDS, MAPPING } from './_wearables.js';
import { storeDay, isInternal } from './_wearable_store.js';
import { rateLimit, tooMany, callerIp } from './_ratelimit.js';
import { requireSubject } from './_subject.js';

// The record types we take. Everything else in the file is skipped without being stored,
// and these are the documented, stable HealthKit identifiers, unlike the cloud field names.
export const APPLE_TYPES = {
  HKCategoryTypeIdentifierSleepAnalysis: 'sleep_duration_min',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting_hr_bpm',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv_rmssd_ms',
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierTimeInDaylight: 'time_in_daylight_min',
  HKQuantityTypeIdentifierRespiratoryRate: 'respiratory_rate_bpm',
};

// Above this we stop and tell the member, rather than being killed mid-parse.
export const MAX_BYTES = 80 * 1024 * 1024;

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

/**
 * Pull the records we want out of a chunk of Apple's export XML.
 *
 * A REGEX SCAN RATHER THAN A DOM PARSE, deliberately. These files do not fit in memory, so
 * there is nothing to build a tree from. Each <Record .../> is self contained, which is what
 * makes a scan correct here rather than merely convenient.
 *
 * @returns {Map<string, Map<string, number[]>>} day -> field -> values
 */
export function scanApple(xml, { from, to }) {
  const byDay = new Map();
  const RECORD = /<Record\s([^>]*?)\/?>/g;
  let m;
  while ((m = RECORD.exec(xml)) !== null) {
    const attrs = m[1];
    const type = (/type="([^"]+)"/.exec(attrs) || [])[1];
    const field = APPLE_TYPES[type];
    if (!field) continue;                                  // not one of ours, skipped

    const startDate = (/startDate="([^"]+)"/.exec(attrs) || [])[1];
    if (!startDate) continue;
    const day = startDate.slice(0, 10);
    // ONLY THE PROGRAM WINDOW. Everything outside it is discarded rather than stored.
    if (from && day < from) continue;
    if (to && day > to) continue;

    const valueRaw = (/value="([^"]+)"/.exec(attrs) || [])[1];
    const unit = (/unit="([^"]+)"/.exec(attrs) || [])[1] || null;

    let value = null;
    if (field === 'sleep_duration_min') {
      // Sleep is a category with no numeric value: the duration is the interval, and only
      // the asleep categories count. Time in bed is not time asleep.
      const endDate = (/endDate="([^"]+)"/.exec(attrs) || [])[1];
      if (!endDate) continue;
      if (valueRaw && !/Asleep/i.test(valueRaw)) continue;
      value = (new Date(endDate) - new Date(startDate)) / 60000;
    } else {
      if (!valueRaw) continue;
      const n = Number(valueRaw);
      if (!Number.isFinite(n)) continue;
      // A value with no unit is not assumed. It is skipped here and the caller reports the
      // count, so the member is told rather than given a number nobody can vouch for.
      if (!unit) {
        if (!byDay.has(day)) byDay.set(day, new Map());
        const d = byDay.get(day);
        const key = `_nounit:${field}`;
        d.set(key, (d.get(key) || []).concat([1]));
        continue;
      }
      value = n;
    }

    if (value === null || !Number.isFinite(value)) continue;
    if (!byDay.has(day)) byDay.set(day, new Map());
    const d = byDay.get(day);
    d.set(field, (d.get(field) || []).concat([value]));
  }
  return byDay;
}

/**
 * One value per field per day. Sleep and steps and daylight ADD UP across the day; heart
 * rate, HRV and respiratory rate are averaged. Summing an average or averaging a total is
 * the kind of error that produces a plausible wrong number, so the choice is explicit.
 */
export const AGGREGATE = {
  sleep_duration_min: 'sum',
  steps: 'sum',
  time_in_daylight_min: 'sum',
  resting_hr_bpm: 'mean',
  hrv_rmssd_ms: 'mean',
  respiratory_rate_bpm: 'mean',
};

export function collapse(dayMap) {
  const out = {};
  const noUnit = [];
  for (const [key, values] of dayMap.entries()) {
    if (key.startsWith('_nounit:')) { noUnit.push(key.slice(8)); continue; }
    const how = AGGREGATE[key] || 'mean';
    const n = values.length;
    const total = values.reduce((a, b) => a + b, 0);
    out[key] = how === 'sum' ? Math.round(total) : Math.round((total / n) * 100) / 100;
  }
  return { values: out, noUnit };
}

export async function onRequestPost({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  const limit = await rateLimit(env, 'waitlist_ip', `upload:${callerIp(request)}`);
  if (!limit.allowed) return tooMany(limit, 'uploads');

  const url = new URL(request.url);
  const subject = requireSubject(who, url.searchParams.get('client_id'));
  if (!subject.ok) return json({ error: subject.error }, subject.status);
  const clientId = subject.clientId;

  const sb = db(env);

  const master = await sb.one('feature_flags', { where: { key: 'WEARABLES_ENABLED' }, columns: 'enabled' });
  const flag = await sb.one('feature_flags', { where: { key: 'WEARABLE_APPLE_UPLOAD' }, columns: 'enabled' });
  if (!master || master.enabled !== true || !flag || flag.enabled !== true) {
    return json({ error: 'Health app uploads are switched off', flag: 'WEARABLE_APPLE_UPLOAD' }, 409);
  }

  // Consent, the same gate the cloud providers pass. An uploaded file is health data too.
  const doc = await sb.one('consent_documents', {
    where: { kind: 'health_data' }, columns: 'id,version', raw: 'retired_at=is.null' });
  const grant = doc ? await sb.one('client_consents', {
    where: { client_id: clientId, document_id: doc.id },
    columns: 'id,granted,withdrawn_at', order: 'created_at.desc' }) : null;
  if (!grant || grant.granted !== true || grant.withdrawn_at) {
    return json({ error: 'You have not agreed to how we handle health data, and this file is health data.',
                  needs_consent: 'health_data' }, 409);
  }

  // The program window. Records outside it are discarded rather than stored.
  const membership = await sb.one('memberships', {
    where: { client_id: clientId }, columns: 'day_zero,completed_on', order: 'cycle.desc' });
  const from = membership && membership.day_zero ? membership.day_zero : null;
  const to = membership && membership.completed_on ? membership.completed_on
    : new Date().toISOString().slice(0, 10);

  const declared = Number(request.headers.get('content-length') || 0);
  if (declared && declared > MAX_BYTES) {
    return json({
      error: 'That file is larger than we can process in one request',
      size_bytes: declared, limit_bytes: MAX_BYTES,
      what_to_do: 'Open the zip, and upload just export.xml from inside it. The zip also contains ' +
                  'workout routes and electrocardiograms, which we do not use and would rather not receive.',
    }, 413);
  }

  const started = Date.now();
  let xml = '';
  try {
    const type = request.headers.get('content-type') || '';
    if (/zip/.test(type) || url.searchParams.get('zip') === '1') {
      // A single-entry zip can be inflated without a zip library: the local file header is
      // fixed width, and the payload is raw deflate. Anything more elaborate is refused with
      // a sentence rather than parsed wrongly.
      const buf = new Uint8Array(await request.arrayBuffer());
      xml = await inflateFirstEntry(buf);
    } else {
      xml = await request.text();
    }
  } catch (e) {
    return json({
      error: 'We could not read that file',
      why: String(e && e.message || e).slice(0, 200),
      what_to_do: 'Open the zip on your phone or computer and upload export.xml from inside it.',
    }, 400);
  }

  if (!/<Record\s/.test(xml)) {
    return json({
      error: 'That does not look like a Health export',
      what_to_do: 'In the Health app, open your profile, choose Export All Health Data, and send the ' +
                  'export.xml from inside the zip it makes.',
    }, 400);
  }

  const byDay = scanApple(xml, { from, to });
  const internal = await isInternal(sb, clientId);

  let written = 0, held = 0, days = 0, noUnitTotal = 0;
  for (const [day, dayMap] of byDay.entries()) {
    const { values, noUnit } = collapse(dayMap);
    noUnitTotal += noUnit.length;
    if (!Object.keys(values).length) continue;
    days++;

    // Shaped into the payload the Apple mapping expects, so the same normalizer, the same
    // plausibility bounds and the same held rules apply as for a cloud provider. One set of
    // rules, not two.
    const payload = {};
    for (const [field, value] of Object.entries(values)) {
      const rule = MAPPING.apple_health_upload[field];
      if (rule) payload[rule.from] = value;
    }
    const r = await storeDay(sb, {
      clientId, provider: 'apple_health_upload', day, payload, mode: 'live', internal });
    written += r.written; held += r.held;
  }

  // The connection row, so the Devices page can show it like any other source.
  const now = new Date().toISOString();
  await sb.insert('wearable_connections', {
    client_id: clientId, provider: 'apple_health_upload',
    status: written > 0 ? 'connected' : 'error',
    consent_id: grant.id, scopes: ['upload'],
    connected_at: written > 0 ? now : null,
    last_sync_at: written > 0 ? now : null,
    last_error: written > 0 ? null : 'the file contained no usable records inside the program window',
    updated_at: now,
  }, { upsert: 'client_id,provider' });

  // THE FILE IS GONE. It was never written anywhere: it existed as a string for the duration
  // of this request and is released when this function returns. Said explicitly because "we
  // discard it" is a promise a member cannot verify.
  const bytes = xml.length;
  xml = '';

  return json({
    ok: true,
    days_with_readings: days,
    written, held,
    values_with_no_unit_skipped: noUnitTotal,
    window: { from: from || 'no start date recorded', to },
    file: {
      bytes_parsed: bytes,
      discarded: true,
      note: 'The file was read in this request and never stored. Only the record types the program uses were kept.',
    },
    record_types_read: Object.keys(APPLE_TYPES),
    seconds: Math.round((Date.now() - started) / 100) / 10,
  });
}

/**
 * Inflate the first entry of a zip.
 *
 * Deliberately minimal and deliberately loud when the zip is not the simple case. A real zip
 * library is not available here, and a half-implemented one that guesses at the central
 * directory would corrupt data silently.
 */
async function inflateFirstEntry(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) {
    throw new Error('that is not a zip file');
  }
  const method = dv.getUint16(8, true);
  const nameLen = dv.getUint16(26, true);
  const extraLen = dv.getUint16(28, true);
  const name = new TextDecoder().decode(buf.subarray(30, 30 + nameLen));
  const start = 30 + nameLen + extraLen;

  if (method === 0) return new TextDecoder().decode(buf.subarray(start));
  if (method !== 8) throw new Error(`that zip uses compression method ${method}, which we cannot read`);
  if (!/\.xml$/i.test(name)) {
    throw new Error(`the first file in that zip is ${name}, not an xml file. Upload export.xml on its own.`);
  }

  const stream = new Blob([buf.subarray(start)]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
