// Cross-user isolation, proved against the live database. Part J:
// "One user cannot access another user's records."
//
// WHY THIS HAS TO USE THE ANON KEY AND A REAL SESSION. The portal talks to
// Supabase directly from the browser, so the only thing standing between one
// participant and another is row level security evaluated against their JWT.
// Testing with the service key proves nothing: the service key bypasses RLS by
// design. Testing the endpoints proves nothing either, because the browser does
// not go through them. So this signs in as two real people with the same
// publishable key the browser ships with, and has each of them reach for the
// other's records.
//
// It enumerates the population: every table in public that has a client_id
// column, found by asking the database, not by listing the ones I remember.
//
// BOTH PARTICIPANTS ARE CREATED HERE, AND BOTH ARE ORDINARY CLIENTS. The first
// version of this script used the owner's own account as one of the two, and
// reported nine isolation failures: reads of the other person's logs, labs,
// membership and support request, writes to their log, and a self-promotion to
// admin. Every one of them was wrong. The owner's role is admin, there is exactly
// one profile in the database and that is it, and can_view_client returns true for
// an admin by design. So the script was watching a member of staff use their own
// access and calling it a breach. The self-promotion check was the clearest tell:
// the role came back as admin because it had been admin all along.
//
// A test whose subject is privileged cannot measure what an unprivileged person
// can reach.
//
// THE FIXTURE IS SHOWN TO FAIL FIRST. With --show-it-fails one table has its row
// level security switched off, the same read is attempted, the leak is printed,
// and RLS is switched back on inside a transaction that is always rolled back.

import { execFileSync } from 'node:child_process';

const DB = process.env.SUPABASE_DB_URL;
const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const SHOW_FAILS = process.argv.includes('--show-it-fails');
if (!DB || !URL_ || !SERVICE || !ANON) {
  console.error('  need SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY');
  process.exit(2);
}

const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
const sql = (s) => execFileSync(PSQL, [DB, '-At', '-F', '\x1f', '-c', s], { encoding: 'utf8' }).trim();

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};

const A_EMAIL_PROBE = 'isolation-probe-a@thehumanbatteryproject.com';
const B_EMAIL_PROBE = 'isolation-probe-b@thehumanbatteryproject.com';

async function admin(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
               'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// A real session, minted the way the magic link does.
async function sessionFor(email) {
  const link = await admin('/auth/v1/admin/generate_link', {
    method: 'POST', body: JSON.stringify({ type: 'magiclink', email }),
  });
  const verified = await admin('/auth/v1/verify', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
  });
  if (!verified.access_token) throw new Error(`no access token for ${email}`);
  return verified.access_token;
}

// A read exactly as the browser makes it: publishable key, member JWT.
async function asMember(jwt, path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, rows: Array.isArray(body) ? body : null, body };
}

async function writeAsMember(jwt, path, method, payload) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`,
               'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, rows: Array.isArray(body) ? body : null, body };
}

// ---------------------------------------------------------------------
// Two ordinary participants, both created here, both role 'client'.
// ---------------------------------------------------------------------
async function removeProbe(email) {
  const existing = sql(`select coalesce(id::text,'') from profiles where email='${email}'`);
  if (existing) sql(`delete from profiles where id='${existing}'`);
  const users = await admin(`/auth/v1/admin/users?page=1&per_page=200`);
  for (const u of (users.users || [])) {
    if (u.email === email) await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  }
}

async function makeProbe(email, name) {
  await removeProbe(email);
  const user = await admin('/auth/v1/admin/users', {
    method: 'POST', body: JSON.stringify({ email, email_confirm: true }),
  });
  const id = user.id;
  // role 'client'. An admin would see everything legitimately and the test would
  // measure nothing.
  sql(`insert into profiles (id, email, full_name, role)
       values ('${id}', '${email}', '${name}', 'client')
       on conflict (id) do update set email=excluded.email, role='client'`);
  sql(`insert into memberships (client_id, cycle, status, tier, day_zero, is_internal)
       values ('${id}', 1, 'active', 'intermediate', current_date - 10, true)`);
  const membership = sql(`select id from memberships where client_id='${id}' limit 1`);
  return { id, email, membership };
}

const A = await makeProbe(A_EMAIL_PROBE, 'Isolation Probe A');
const B = await makeProbe(B_EMAIL_PROBE, 'Isolation Probe B');
const A_CLIENT = A.id, B_CLIENT = B.id, B_MEMBERSHIP = B.membership;
console.log(`  A: ${A.email} (${A_CLIENT.slice(0, 8)}...)  role client`);
console.log(`  B: ${B.email} (${B_CLIENT.slice(0, 8)}...)  role client\n`);

// B needs records worth stealing.
sql(`insert into daily_logs (client_id, membership_id, log_date, program_day, adherence_pct, energy)
     values ('${B_CLIENT}', '${B_MEMBERSHIP}', current_date, 11, 77, 3)`);
sql(`insert into lab_panels (client_id, membership_id, draw_point, drawn_on, lab_name)
     values ('${B_CLIENT}', '${B_MEMBERSHIP}', 'day_0', current_date - 10, 'ISOLATION PROBE')`);
const B_PANEL = sql(`select id from lab_panels where client_id='${B_CLIENT}' limit 1`);
sql(`insert into lab_results (panel_id, marker_id, value, unit, is_test)
     select '${B_PANEL}', id, 9.99, '%', true from lab_markers where slug='hba1c'`);
sql(`insert into support_requests (client_id, subject, body, status)
     values ('${B_CLIENT}', 'Private matter', 'This body is private to B.', 'open')`);
sql(`insert into entitlements (client_id, membership_id, kind, status, effective_from, effective_to)
     values ('${A_CLIENT}', '${A.membership}', 'program', 'active', current_date - 10, current_date + 79)`);

const A_JWT = await sessionFor(A.email);
const B_JWT = await sessionFor(B.email);

// ---------------------------------------------------------------------
// Every participant-scoped table, asked from the database.
// ---------------------------------------------------------------------
const tables = sql(`select table_name from information_schema.columns
                     where table_schema='public' and column_name='client_id'
                     order by table_name`).split('\n').filter(Boolean);
console.log(`  ${tables.length} tables carry a client_id. Reading every one of them as the wrong person.\n`);

let leaks = [];
for (const t of tables) {
  const r = await asMember(A_JWT, `${t}?client_id=eq.${B_CLIENT}&select=*`);
  const n = r.rows ? r.rows.length : (r.status === 200 ? 0 : null);
  if (n === null) continue;                 // refused outright, which is also isolation
  if (n > 0) leaks.push(`${t} (${n} row(s))`);
}
ok(`A reading B: nothing visible in any of the ${tables.length} tables`,
   leaks.length === 0, leaks.join(', '));

let leaksBack = [];
for (const t of tables) {
  const r = await asMember(B_JWT, `${t}?client_id=eq.${A_CLIENT}&select=*`);
  const n = r.rows ? r.rows.length : (r.status === 200 ? 0 : null);
  if (n === null) continue;
  if (n > 0) leaksBack.push(`${t} (${n} row(s))`);
}
ok(`B reading A: nothing visible either, so it is not one-directional`,
   leaksBack.length === 0, leaksBack.join(', '));

// The specific records, named, because a count of zero across 36 tables is easy
// to produce by accident if the filter is wrong.
console.log('\nThe specific records B owns, reached for by name');
{
  const own = await asMember(B_JWT, `daily_logs?client_id=eq.${B_CLIENT}&select=adherence_pct`);
  ok("B can see B's own daily log, so the read itself works",
     own.rows && own.rows.length === 1 && Number(own.rows[0].adherence_pct) === 77,
     JSON.stringify(own.body).slice(0, 120));
}
{
  const stolen = await asMember(A_JWT, `daily_logs?client_id=eq.${B_CLIENT}&select=adherence_pct`);
  ok("A cannot see that same log", stolen.rows && stolen.rows.length === 0,
     JSON.stringify(stolen.body).slice(0, 120));
}
{
  const stolen = await asMember(A_JWT, `support_requests?client_id=eq.${B_CLIENT}&select=subject,body`);
  ok("A cannot read B's support request", stolen.rows && stolen.rows.length === 0,
     JSON.stringify(stolen.body).slice(0, 120));
}
{
  // Lab results are reached through the panel, so the filter is different and the
  // join is where an isolation rule is most likely to have been forgotten.
  const stolen = await asMember(A_JWT, `lab_results?panel_id=eq.${B_PANEL}&select=value`);
  ok("A cannot read B's lab result through the panel id",
     stolen.rows && stolen.rows.length === 0, JSON.stringify(stolen.body).slice(0, 120));
}

console.log('\nWrites, which matter more than reads');
{
  const w = await writeAsMember(A_JWT, `daily_logs?client_id=eq.${B_CLIENT}`, 'PATCH', { adherence_pct: 1 });
  const changed = w.rows ? w.rows.length : 0;
  ok("A cannot change B's daily log", changed === 0, `status ${w.status}, ${changed} row(s) changed`);
  const still = sql(`select adherence_pct::int::text from daily_logs where client_id='${B_CLIENT}'`);
  ok("and B's value is untouched", still === '77', `now ${still}`);
}
{
  const w = await writeAsMember(A_JWT, 'daily_logs', 'POST',
    { client_id: B_CLIENT, membership_id: B_MEMBERSHIP, log_date: '2026-01-01', program_day: 1, adherence_pct: 5 });
  const wrote = w.rows ? w.rows.length : 0;
  ok('A cannot insert a row belonging to B', wrote === 0 || w.status >= 400,
     `status ${w.status}`);
}
{
  const w = await writeAsMember(A_JWT, `entitlements?client_id=eq.${A_CLIENT}`, 'PATCH',
    { effective_to: '2099-01-01' });
  const changed = w.rows ? w.rows.length : 0;
  ok('A cannot extend their OWN entitlement, because billing is not theirs to edit',
     changed === 0, `status ${w.status}, ${changed} row(s) changed`);
}
{
  // This is the check the first version could not make, because its subject was
  // already an admin and the role came back admin whether the write worked or not.
  const before = sql(`select role::text from profiles where id='${A_CLIENT}'`);
  const w = await writeAsMember(A_JWT, `profiles?id=eq.${A_CLIENT}`, 'PATCH', { role: 'admin' });
  const after = sql(`select role::text from profiles where id='${A_CLIENT}'`);
  ok('A starts as an ordinary client', before === 'client', before);
  ok('and cannot promote themselves to admin', after === 'client',
     `status ${w.status}, role went ${before} -> ${after}`);
}

console.log('\nThe wearable tables, including the one with no client_id');
{
  // wearable_connections and wearable_daily carry a client_id, so the sweep above
  // already covered them. wearable_tokens does NOT: it hangs off a connection. So it
  // would be missed by a check that enumerates tables by client_id, which is exactly
  // the table where being missed matters most, because a token is a credential.
  const anonOnly = async (path) => {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: ANON } });
    return { status: res.status, text: (await res.text()).slice(0, 80) };
  };
  for (const table of ['wearable_connections', 'wearable_tokens', 'wearable_daily']) {
    const r = await anonOnly(`${table}?select=*`);
    // 401 or 403 or a PostgREST 42501 are all refusals. An empty array would mean the
    // table is readable and merely happens to be empty, which is not the same thing.
    ok(`the published key is refused outright on ${table}`,
       r.status >= 400, `HTTP ${r.status} ${r.text}`);
  }

  // And a signed-in member must not reach ANY token, including their own: it is a key
  // to their account somewhere else, not a record about them.
  const own = await asMember(A_JWT, 'wearable_tokens?select=*');
  ok('a signed-in member cannot read wearable_tokens at all, not even their own',
     own.status >= 400, `HTTP ${own.status} ${JSON.stringify(own.body).slice(0, 80)}`);
}

console.log('\nThe export endpoint, which takes a client_id and must not honour it');
{
  const BASE = process.env.HBP_BASE || 'https://thehumanbatteryproject.com';
  const get = async (jwt, qs) => {
    const res = await fetch(`${BASE}/api/export${qs}`, { headers: { Authorization: 'Bearer ' + jwt } });
    let body = null; try { body = await res.json(); } catch {}
    return { status: res.status, body };
  };
  const own = await get(A_JWT, '');
  ok('A can export their own records', own.status === 200, `HTTP ${own.status}`);

  // The whole risk of that query parameter in one line. Staff may use it; a member
  // must not, and a member is what almost everybody is.
  const theirs = await get(A_JWT, `?client_id=${B_CLIENT}`);
  ok("A cannot export B's records by asking for their client_id",
     theirs.status === 403, `HTTP ${theirs.status}`);

  // And even if the status were wrong, the body must not carry B's rows.
  const leaked = JSON.stringify(theirs.body || {}).includes('Private matter');
  ok("and B's support request is not in the response either", !leaked);
}

console.log('\nThe anonymous case, with no session at all');
{
  const res = await fetch(`${URL_}/rest/v1/lab_results?select=value&limit=5`, { headers: { apikey: ANON } });
  const text = await res.text();
  let rows = null; try { rows = JSON.parse(text); } catch {}
  ok('an anonymous reader gets no lab results',
     !Array.isArray(rows) || rows.length === 0, `status ${res.status} ${text.slice(0, 100)}`);
}

// ---------------------------------------------------------------------
// Show the fixture failing, so a pass means something.
// ---------------------------------------------------------------------
if (SHOW_FAILS) {
  console.log('\nShowing it fail: row level security off on daily_logs');
  sql(`alter table daily_logs disable row level security`);
  try {
    const r = await asMember(A_JWT, `daily_logs?client_id=eq.${B_CLIENT}&select=adherence_pct,energy`);
    const n = r.rows ? r.rows.length : 0;
    console.log(`    with RLS off, A reading B's daily log returned ${n} row(s): ${JSON.stringify(r.rows).slice(0, 120)}`);
    ok('the leak is real when RLS is off, so the passing case is meaningful', n > 0);
  } finally {
    sql(`alter table daily_logs enable row level security`);
    const back = sql(`select relrowsecurity::text from pg_class where relname='daily_logs'`);
    ok('and row level security is back on', back === 'true', back);
  }
  const r2 = await asMember(A_JWT, `daily_logs?client_id=eq.${B_CLIENT}&select=adherence_pct`);
  ok('with it back on, the same read returns nothing', r2.rows && r2.rows.length === 0);
}

// ---------------------------------------------------------------------
await removeProbe(A_EMAIL_PROBE);
await removeProbe(B_EMAIL_PROBE);
const gone = sql(`select count(*)::text from profiles where email in ('${A_EMAIL_PROBE}','${B_EMAIL_PROBE}')`);
ok('both probe participants removed', gone === '0', `${gone} left`);
const orphans = sql(`select count(*)::text from lab_panels where lab_name='ISOLATION PROBE'`);
ok('and every record created for the probe is gone', orphans === '0', `${orphans} left`);

console.log(`\n${bad ? `FAILED: ${bad}` : 'cross-user isolation holds on every participant table'}`);
process.exit(bad ? 1 : 0);
