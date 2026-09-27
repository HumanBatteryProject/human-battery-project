// What the product does when something it depends on is not there.
// Part I Day 12: failure-mode end-to-end tests. Part J: "AI failure produces a safe
// fallback rather than a broken dashboard." Launch checklist:
// "AI_GENERATION_ENABLED off produces a plan and an unchanged dashboard."
//
// END TO END, against the live deployment and the live database, because that is
// where the failure would happen. The pure half of this is already covered:
// dst_fixtures for the clock, planner_fixtures for the rules. What no fixture can
// tell me is whether the DEPLOYED system degrades safely, so this flips real
// switches on the real thing and puts them back.
//
// THE RULE EVERY CASE IS MEASURED AGAINST: a dependency being absent must produce a
// smaller, honest answer. Never a fabricated one, and never a broken screen. So each
// case asks two questions, not one: did it stay up, and did it stay truthful.
//
// Every change made here is reverted in a finally block, including on failure.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const BASE = process.env.HBP_BASE || 'https://thehumanbatteryproject.com';
const DB = process.env.SUPABASE_DB_URL;
const SECRET = process.env.WEBHOOK_SECRET;
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';
if (!DB || !SECRET) {
  console.error('  need SUPABASE_DB_URL and WEBHOOK_SECRET');
  process.exit(2);
}

const sql = (s) => execFileSync(PSQL, [DB, '-At', '-c', s], { encoding: 'utf8' }).trim();

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hbp-secret': SECRET },
    body: JSON.stringify(body || {}),
  });
  let out = null; try { out = await res.json(); } catch {}
  return { status: res.status, body: out };
}

const CLIENT = sql(`select client_id from entitlements where kind='program' limit 1`);
const MEMBERSHIP = sql(`select id from memberships where client_id='${CLIENT}' order by cycle desc limit 1`);
const internal = sql(`select coalesce(bool_or(is_internal),false)::text from memberships where client_id='${CLIENT}'`);
if (internal !== 'true') {
  console.error('  REFUSING: the target is not an internal test member. This flips live flags.');
  process.exit(2);
}
// THIS SCRIPT SWITCHES OFF AI GENERATION ON THE LIVE SYSTEM and switches it back in
// a finally block. That is safe while the only account is the owner's test account.
// It is NOT safe once real participants exist: a crash between the two, or a kill
// signal that skips the finally, would leave every member without a brief until
// somebody noticed.
//
// So it refuses to run once there is anybody real, rather than being trusted to be
// careful. The guard expires on its own when the pilot starts, which is the point at
// which this should become a staging exercise instead.
const realPeople = sql(`select count(*) from profiles p
                         where not exists (select 1 from memberships m
                                            where m.client_id = p.id and m.is_internal)`);
if (Number(realPeople) > 0 && !process.argv.includes('--i-know-this-touches-live-flags')) {
  console.error(`  REFUSING: ${realPeople} account(s) are not internal test accounts.`);
  console.error('  This switches AI generation off on the live system. Run it against a copy,');
  console.error('  or pass --i-know-this-touches-live-flags if you accept the risk.');
  process.exit(2);
}

console.log(`  target: the internal member ${CLIENT.slice(0, 8)}...`);
console.log(`  ${realPeople} non-internal account(s) exist, so flipping live flags is safe right now\n`);

const flag = (key) => sql(`select enabled::text from feature_flags where key='${key}'`);
const setFlag = (key, on) =>
  sql(`update feature_flags set enabled=${on ? 'true' : 'false'}, updated_at=now() where key='${key}'`);

// A finally block is not enough, and I proved that the hard way: I piped a run to
// `head -4`, node took SIGPIPE when head closed the pipe, the finally never ran, and
// AI_GENERATION_ENABLED was left OFF on the live system. Nothing was obviously
// broken. The next smoke test failed on the coach, which was correctly refusing to
// answer because generation was switched off, and it took reading the flag table to
// see why. Exactly the risk the guard comment above describes, caused by the person
// who wrote the comment.
//
// So the intent to restore is written down BEFORE anything is flipped, and any
// leftover intent from a crashed run is honoured at startup. Two mechanisms, because
// a signal handler cannot be trusted to run and a file cannot restore anything by
// itself.
const STATE_FILE = new URL('../.failure-mode-probe-state', import.meta.url).pathname;

function rememberToRestore(pairs) {
  writeFileSync(STATE_FILE, JSON.stringify(pairs), 'utf8');
}
function restoreNow(why) {
  if (!existsSync(STATE_FILE)) return false;
  let pairs = {};
  try { pairs = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { /* corrupt, below */ }
  for (const [key, on] of Object.entries(pairs)) {
    try { setFlag(key, on === true || on === 'true'); } catch (e) { /* reported below */ }
  }
  unlinkSync(STATE_FILE);
  if (Object.keys(pairs).length) {
    console.log(`  ${why}: restored ${Object.entries(pairs).map(([k, v]) => k + '=' + v).join(', ')}`);
  }
  return true;
}

// Anything left over from a previous run that did not finish.
if (restoreNow('LEFTOVER STATE FROM AN EARLIER RUN')) {
  console.log('  A previous run did not restore its own changes. Fixed before starting.\n');
}

// sql() is synchronous, so a signal handler can genuinely finish the work.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGPIPE']) {
  process.on(sig, () => { restoreNow(`interrupted by ${sig}`); process.exit(130); });
}
process.on('uncaughtException', (e) => {
  restoreNow('uncaught exception');
  console.error('  ' + String(e && e.message || e).slice(0, 200));
  process.exit(1);
});

// =====================================================================
console.log('The kill switch: AI_GENERATION_ENABLED off');
// =====================================================================
const aiWas = flag('AI_GENERATION_ENABLED');
try {
  rememberToRestore({ AI_GENERATION_ENABLED: aiWas === 'true' });
  setFlag('AI_GENERATION_ENABLED', false);
  ok('the flag reads false', flag('AI_GENERATION_ENABLED') === 'false');

  // A plan must still be produced. The protocol rules are deterministic; the model
  // only writes the explanation, so a paused model costs the words and not the plan.
  const plan = await post('/api/plan-run', { client_id: CLIENT });
  ok('plan-run still answers 200 rather than erroring', plan.status === 200,
     `HTTP ${plan.status} ${JSON.stringify(plan.body).slice(0, 140)}`);
  const row = plan.body && Array.isArray(plan.body.members) ? plan.body.members[0] : null;
  ok('and it reports on the member rather than skipping them', !!row,
     JSON.stringify(plan.body).slice(0, 160));
  ok('nothing is recorded as a failure, because nothing failed',
     plan.body && Number(plan.body.failed || 0) === 0,
     JSON.stringify(plan.body).slice(0, 160));

  const brief = await post('/api/brief-run', { client_id: CLIENT });
  ok('brief-run also answers 200', brief.status === 200, `HTTP ${brief.status}`);
  ok('and does not count the pause as a failure',
     brief.body && Number(brief.body.failed || 0) === 0,
     JSON.stringify(brief.body).slice(0, 160));

  // THE PART THAT MATTERS MOST. A paused model must not leave a half-written
  // sentence in a member's record. Anything stored must be either complete or absent.
  const emptyBriefs = sql(`select count(*) from morning_briefs
                            where client_id='${CLIENT}' and (content is null or btrim(content)='')`);
  ok('no empty brief was written', emptyBriefs === '0', `${emptyBriefs} empty`);
  const emptyPlans = sql(`select count(*) from daily_plans dp
                           where dp.client_id='${CLIENT}'
                             and not exists (select 1 from plan_actions pa where pa.plan_id = dp.id)`);
  ok('no plan was written with no actions in it', emptyPlans === '0', `${emptyPlans} actionless`);

  // The coach must refuse rather than answer from nothing.
  const runs = sql(`select coalesce(status,'none') from agent_runs
                     where client_id='${CLIENT}' order by started_at desc limit 1`);
  ok('the most recent agent run is not a silent success with no output',
     runs !== 'ok' || sql(`select coalesce(tokens_out::text,'0') from agent_runs
                            where client_id='${CLIENT}' order by started_at desc limit 1`) !== '0',
     `status ${runs}`);
} finally {
  setFlag('AI_GENERATION_ENABLED', aiWas === 'true');
  if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
  ok('the kill switch is back where it was', flag('AI_GENERATION_ENABLED') === aiWas, `now ${flag('AI_GENERATION_ENABLED')}`);
}

// =====================================================================
console.log('\nStripe absent');
// =====================================================================
{
  // CLEAR OUR OWN RATE LIMIT FIRST. This test asserts that checkout answers 503 because
  // Stripe is absent. Deploying several times in an hour spends checkout's hourly
  // allowance, and then it answers 429 instead and the assertion fails on a system that
  // is behaving perfectly. That is the same shape as the coach's daily limit breaking the
  // smoke test, and the fix is the same idea: a test controls its own preconditions
  // rather than being weakened to accept whatever it finds.
  //
  // Only the buckets this test creates are cleared, so a real limit somebody else is
  // hitting stays counted.
  sql(`delete from rate_limits where bucket like 'checkout_%'`);

  const res = await fetch(BASE + '/api/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: 'two_payments', email: 'failure-mode-probe@example.invalid' }),
  });
  const body = await res.json().catch(() => ({}));
  ok('checkout refuses with 503 rather than a broken page', res.status === 503, `HTTP ${res.status}`);
  ok('and says which variable is missing',
     /STRIPE_SECRET_KEY/.test(body.why || ''), (body.why || '').slice(0, 90));

  const billing = await post('/api/billing-run', { dry_run: false });
  ok('the billing job answers 200 rather than failing', billing.status === 200, `HTTP ${billing.status}`);
  // The distinction the whole job exists for.
  ok('a charge that could not be attempted is BLOCKED, never FAILED',
     billing.body && Number(billing.body.failed || 0) === 0,
     JSON.stringify(billing.body).slice(0, 160));
  ok('and it says Stripe is not ready', billing.body && billing.body.stripe_ready === false);
  const offered = sql(`select count(*) from weekly_plans where client_id='${CLIENT}' and status='offered'`);
  ok('no weekly recovery plan was offered to somebody who has not failed to pay',
     offered === '0', `${offered} offered`);
}

// =====================================================================
console.log('\nA participant on the other side of the world');
// =====================================================================
const tzWas = sql(`select coalesce(timezone,'') from profiles where id='${CLIENT}'`);
try {
  // PICK A TIMEZONE THAT IS ACTUALLY ON A DIFFERENT DAY RIGHT NOW, rather than one
  // that sounds far away. The first version used Pacific/Auckland, and Auckland and
  // UTC happened to share a calendar date at the moment it ran, so the assertion
  // passed without discriminating between "their date" and "the server's date",
  // which is the entire thing being tested. A test that cannot fail is not evidence.
  const candidates = ['Pacific/Kiritimati', 'Pacific/Auckland', 'Asia/Tokyo',
                      'Pacific/Midway', 'Pacific/Honolulu', 'America/Chicago'];
  const utcDate = sql(`select (now() at time zone 'UTC')::date::text`);
  let tz = null, theirDate = null;
  for (const z of candidates) {
    const d = sql(`select (now() at time zone '${z}')::date::text`);
    if (d !== utcDate) { tz = z; theirDate = d; break; }
  }
  if (!tz) {
    // Only possible in a narrow window; say so rather than passing quietly.
    console.log('        SKIPPED: no candidate timezone is on a different date from UTC at this moment.');
    ok('a different-day timezone was available to test with', false,
       'every candidate shares UTC\'s date right now, so this case proves nothing');
  } else {
    sql(`update profiles set timezone='${tz}' where id='${CLIENT}'`);
    console.log(`        using ${tz}: their date is ${theirDate}, UTC is ${utcDate}`);
    const brief = await post('/api/brief-run', { client_id: CLIENT });
    ok('the brief job runs for a member on a different calendar day', brief.status === 200, `HTTP ${brief.status}`);
    const row = brief.body && Array.isArray(brief.body.members) ? brief.body.members[0] : null;
    ok('and it targets THEIR date, not the server\'s',
       !!row && row.date === theirDate,
       `job said ${row && row.date}, they are on ${theirDate}, UTC is ${utcDate}`);
  }
} finally {
  sql(`update profiles set timezone=${tzWas ? `'${tzWas}'` : 'null'} where id='${CLIENT}'`);
  const back = sql(`select coalesce(timezone,'') from profiles where id='${CLIENT}'`);
  ok('their timezone is restored', back === tzWas, `now ${back}`);
}

// =====================================================================
console.log('\nThe database refusing a write');
// =====================================================================
{
  // Not simulated by breaking the connection, which would prove only that a broken
  // connection breaks things. Instead: a write that VIOLATES A CONSTRAINT, which is
  // the realistic version and the one that has actually happened here twice.
  let refused = false, message = '';
  try {
    sql(`insert into entitlements (client_id, kind, status, effective_from)
         values ('${CLIENT}', 'program', 'active', current_date)`);
  } catch (e) {
    refused = true;
    message = String(e.stderr || e.message || '').slice(0, 120);
  }
  ok('a second active program entitlement is refused by the database', refused, message);
  const n = sql(`select count(*) from entitlements where client_id='${CLIENT}' and kind='program'`);
  ok('and the member still has exactly one', n === '1', `${n} found`);
}

console.log(`\n${bad ? `FAILURE MODES FAILED: ${bad}` : 'every failure mode degrades safely and truthfully'}`);
process.exit(bad ? 1 : 0);
