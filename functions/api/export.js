// GET /api/export
//
// Everything we hold about one person, as one JSON file. Part J: "Data export and
// deletion behave as documented." Also Part G, which lists export as a right that
// does not depend on paying us, which is why _billing.js keeps this reachable while
// a membership is suspended.
//
// WHAT WAS WRONG. The export ran in the browser and read 12 tables. 39 hold a
// participant's records, so 27 were missing: their dimension scores, briefs, plans,
// weekly reviews, measurements, intake answers, memberships, entitlements, payments
// and support requests among them. The button said "Download everything". The file
// downloaded, looked substantial, and was a quarter of their record.
//
// READ WITH THE MEMBER'S OWN TOKEN, NOT THE SERVICE KEY. The service key bypasses
// row level security, so a mistake in one filter would put another participant's
// rows in somebody's download. Using their session means row level security is the
// backstop: the worst a filter bug can do is return less than it should. A staff
// export on somebody's behalf does use the service key, and then the client id is
// applied explicitly to every single query.
//
// EMPTY TABLES ARE INCLUDED AS EMPTY. "We looked and there was nothing" and "we did
// not look" are different answers and a person asking for their data deserves the
// first one.

import { json } from './_agent.js';
import { DIRECT, INDIRECT, EXCLUDED, EXPORT_NOTE, PUBLISHABLE_KEY } from './_export.js';

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return json({ error: 'not allowed' }, 403);

  const who = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!who.ok) return json({ error: 'not allowed' }, 403);
  const user = await who.json();
  if (!user || !user.id) return json({ error: 'not allowed' }, 403);

  const url = new URL(request.url);
  const asked = String(url.searchParams.get('client_id') || '').trim();

  // Staff may export on somebody's behalf, and that is the only case that uses the
  // service key. A member asking about anybody but themselves is refused here and
  // would be refused by row level security anyway.
  let clientId = user.id;
  let readerKey = env.SUPABASE_ANON_KEY || PUBLISHABLE_KEY;
  let readerToken = token;
  if (asked && asked !== user.id) {
    const profile = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
    const rows = profile.ok ? await profile.json() : [];
    const role = rows.length ? rows[0].role : null;
    if (!['admin', 'coach'].includes(role)) return json({ error: 'not allowed' }, 403);
    clientId = asked;
    readerKey = env.SUPABASE_SERVICE_KEY;
    readerToken = env.SUPABASE_SERVICE_KEY;
  }

  const read = async (path) => {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: readerKey, Authorization: `Bearer ${readerToken}` },
    });
    if (!res.ok) {
      return { error: `${res.status}`, detail: (await res.text()).slice(0, 200) };
    }
    return res.json();
  };

  const data = {};
  const manifest = { exported: [], excluded: [], failed: [] };

  for (const table of DIRECT) {
    const rows = await read(`${table}?client_id=eq.${clientId}&select=*`);
    if (Array.isArray(rows)) {
      data[table] = rows;
      manifest.exported.push({ table, rows: rows.length, how: 'by client_id' });
    } else {
      data[table] = [];
      manifest.failed.push({ table, why: rows.error, detail: rows.detail });
    }
  }

  for (const [table, rule] of Object.entries(INDIRECT)) {
    // The parent rows are already in `data`, so the ids come from what was just
    // read rather than from a second query. If the parent came back empty, the
    // child is empty too, and that is correct rather than a failure.
    const parents = Array.isArray(data[rule.via]) ? data[rule.via] : [];
    const ids = parents.map((r) => r.id).filter(Boolean);
    if (!ids.length) {
      data[table] = [];
      manifest.exported.push({ table, rows: 0, how: `through ${rule.via}, which is empty` });
      continue;
    }
    const rows = await read(`${table}?${rule.parentKey}=in.(${ids.join(',')})&select=*`);
    if (Array.isArray(rows)) {
      data[table] = rows;
      manifest.exported.push({ table, rows: rows.length, how: `through ${rule.via}.${rule.parentKey}` });
    } else {
      data[table] = [];
      manifest.failed.push({ table, why: rows.error, detail: rows.detail });
    }
  }

  for (const [table, why] of Object.entries(EXCLUDED)) {
    manifest.excluded.push({ table, why });
  }

  const total = manifest.exported.reduce((a, b) => a + b.rows, 0);
  const body = {
    about: EXPORT_NOTE,
    client_id: clientId,
    exported_at: new Date().toISOString(),
    total_rows: total,
    manifest,
    // Stated rather than assumed, so a person can check the file is complete
    // without knowing the schema.
    tables_exported: manifest.exported.length,
    tables_excluded: manifest.excluded.length,
    tables_failed: manifest.failed.length,
    data,
  };

  // A partial export must not look like a complete one. If any table failed, the
  // file says so at the top level and the status is 207 rather than 200.
  const status = manifest.failed.length ? 207 : 200;
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="human-battery-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
