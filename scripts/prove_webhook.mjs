// Prove the Day 10 webhook acceptance criteria against the LIVE deployment.
//
//   test cards create exactly one entitlement
//   replayed and out-of-order webhooks create none
//
// Stripe test keys have not landed, so no card can be charged. What CAN be proved
// is everything downstream of the card: the webhook verifies signatures against
// STRIPE_WEBHOOK_SECRET, so signing a payload with the same value the deployment
// holds exercises the real endpoint, the real signature check, and the real
// database writes. What is NOT proved here is Stripe's own behaviour, and that is
// stated rather than implied.
//
// A CONTINUATION event is used deliberately. A program event would trigger the
// onboarding agent, which calls Anthropic twice and emails the member, so proving
// idempotency with it would cost money and rewrite the test member's plan.

import { createHmac, randomBytes } from 'node:crypto';
import { onRequestPost } from '../functions/api/stripe-webhook.js';

// WHY THE HANDLER IS CALLED DIRECTLY RATHER THAN OVER HTTP.
//
// The live deployment cannot verify a signature, because Cloudflare holds no
// Stripe secrets, so a signed request there returns 503 by design. Posting at it
// would prove only that the refusal works, which is proved separately.
//
// So this imports the real module and calls the real exported handler with a real
// Request, a real signature and the real database. Signature verification, the
// claim in webhook_events, the entitlement writes and the staleness comparison are
// all the shipped code. What is NOT exercised is Cloudflare's routing, which is
// proved by the endpoint answering its own 405 and 503 over HTTP.
//
// The secret is generated per run. The API key is a fake that would fail loudly
// the instant anything tried to use it, and the continuation path deliberately
// makes no Stripe API call at all: that is why continuation is the event chosen.
const SECRET = 'whsec_' + randomBytes(24).toString('hex');
const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('  need SUPABASE_URL and SUPABASE_SERVICE_KEY');
  process.exit(2);
}

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_THIS_IS_NOT_A_KEY_any_api_call_must_fail',
  STRIPE_WEBHOOK_SECRET: SECRET,
  SUPABASE_URL, SUPABASE_SERVICE_KEY: KEY,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || 'unused-here',
};

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`,
               'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

function sign(body, timestamp) {
  const mac = createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

async function call(body, signature) {
  const request = new Request('https://thehumanbatteryproject.com/api/stripe-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signature },
    body,
  });
  const res = await onRequestPost({ request, env: ENV, waitUntil: null });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function post(event) {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  return call(body, sign(body, ts));
}

const nowSec = Math.floor(Date.now() / 1000);
const day = (n) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---- the test member ----
const ents = await rest(`entitlements?kind=eq.program&select=client_id&limit=1`);
const CLIENT = ents[0].client_id;
const internal = await rest(`memberships?client_id=eq.${CLIENT}&select=is_internal&limit=1`);
if (!internal.length || internal[0].is_internal !== true) {
  console.error('  REFUSING: the target membership is not is_internal. This script writes entitlements.');
  process.exit(2);
}
console.log(`  target: the internal member ${CLIENT.slice(0, 8)}...\n`);

const SUB = `sub_day10probe_${nowSec}`;
const EVENT_A = `evt_day10probe_a_${nowSec}`;
const EVENT_B = `evt_day10probe_b_${nowSec}`;

async function continuationCount() {
  const rows = await rest(
    `entitlements?client_id=eq.${CLIENT}&kind=in.(continuation_monthly,continuation_annual)` +
    `&select=id,kind,status,price_cents,renews_on,access_until,last_event_at,cancel_at_period_end`);
  return rows;
}

async function cleanup() {
  await rest(`entitlements?client_id=eq.${CLIENT}&kind=in.(continuation_monthly,continuation_annual)`,
             { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await rest(`webhook_events?event_id=like.evt_day10probe*`,
             { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await rest(`audit_log?action=eq.continuation.started&detail->>by=eq.stripe-webhook`,
             { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
}

await cleanup();
const before = await continuationCount();
ok('no continuation entitlement before we start', before.length === 0, `${before.length} found`);

const session = (eventId, created) => ({
  id: eventId, object: 'event', type: 'checkout.session.completed', created,
  data: { object: {
    id: `cs_day10probe_${nowSec}`, object: 'checkout.session',
    customer: `cus_day10probe_${nowSec}`, subscription: SUB,
    customer_email: 'micah@alpha1entertainment.com',
    amount_total: 3999, mode: 'subscription',
    metadata: {
      kind: 'continuation_monthly', client_id: CLIENT, consent_id: '',
      price_cents: '3999', starts_on: day(1), renews_on: day(32),
      replaces_entitlement: '',
    },
  } },
});

console.log('One paid checkout creates exactly one entitlement');
const first = await post(session(EVENT_A, nowSec));
ok('the webhook accepted it', first.status === 200, JSON.stringify(first.body).slice(0, 200));
let rows = await continuationCount();
ok('exactly one entitlement exists', rows.length === 1, `${rows.length} found`);
ok('it is active', rows[0] && rows[0].status === 'active', rows[0] && rows[0].status);
ok('it stores the price agreed, not the current setting', rows[0] && rows[0].price_cents === 3999,
   rows[0] && String(rows[0].price_cents));
ok('and the renewal date disclosed at checkout', rows[0] && rows[0].renews_on === day(32),
   rows[0] && rows[0].renews_on);

console.log('\nA REPLAY of the same event creates none');
const replay = await post(session(EVENT_A, nowSec));
ok('the replay is acknowledged, not errored', replay.status === 200, String(replay.status));
ok('and is identified as a duplicate', replay.body && replay.body.duplicate === true,
   JSON.stringify(replay.body).slice(0, 160));
rows = await continuationCount();
ok('still exactly one entitlement', rows.length === 1, `${rows.length} found`);

console.log('\nA DIFFERENT event id for the same purchase still creates none');
const again = await post(session(EVENT_B, nowSec + 1));
ok('accepted', again.status === 200, String(again.status));
rows = await continuationCount();
ok('still exactly one entitlement', rows.length === 1, `${rows.length} found`);

console.log('\nAn OUT OF ORDER cancellation older than what was applied is ignored');
const applied = rows[0].last_event_at;
const staleCancel = {
  id: `evt_day10probe_stale_${nowSec}`, object: 'event',
  type: 'customer.subscription.deleted',
  created: Math.floor(new Date(applied).getTime() / 1000) - 600,   // ten minutes older
  data: { object: { id: SUB, object: 'subscription', status: 'canceled',
                    current_period_end: nowSec + 86400 * 30 } },
};
const stale = await post(staleCancel);
ok('accepted rather than errored', stale.status === 200, String(stale.status));
rows = await continuationCount();
ok('the membership is STILL ACTIVE, not resurrected into cancelled',
   rows[0] && rows[0].status === 'active', rows[0] && rows[0].status);
ok('and no second entitlement appeared', rows.length === 1, `${rows.length} found`);

console.log('\nA NEWER cancellation is applied, and keeps the paid period');
const freshCancel = {
  id: `evt_day10probe_fresh_${nowSec}`, object: 'event',
  type: 'customer.subscription.deleted', created: nowSec + 60,
  data: { object: { id: SUB, object: 'subscription', status: 'canceled',
                    current_period_end: Math.floor(new Date(day(32) + 'T12:00:00Z').getTime() / 1000) } },
};
const fresh = await post(freshCancel);
ok('accepted', fresh.status === 200, String(fresh.status));
rows = await continuationCount();
ok('now cancelled', rows[0] && rows[0].status === 'cancelled', rows[0] && rows[0].status);
ok('access runs to the day before the next renewal',
   rows[0] && rows[0].access_until === day(31), rows[0] && rows[0].access_until);
ok('and still exactly one entitlement', rows.length === 1, `${rows.length} found`);

console.log('\nA forged signature is refused');
const forgedBody = JSON.stringify(session(`evt_day10probe_forged_${nowSec}`, nowSec));
const forged = await call(forgedBody, `t=${nowSec},v1=${'0'.repeat(64)}`);
ok('a bad signature is rejected with 400', forged.status === 400, String(forged.status));
rows = await continuationCount();
ok('and wrote nothing', rows.length === 1, `${rows.length} found`);

console.log('\nWhat was recorded');
const events = await rest(`webhook_events?event_id=like.evt_day10probe*&select=event_id,event_type,status&order=received_at.asc`);
for (const e of events) console.log(`    ${e.status.padEnd(10)} ${e.event_type.padEnd(38)} ${e.event_id}`);

await cleanup();
const after = await continuationCount();
ok('\n  cleaned up: no fabricated entitlement left behind', after.length === 0, `${after.length} remain`);

console.log(`\n${bad ? `FAILED: ${bad}` : 'every webhook acceptance line passes'}`);
process.exit(bad ? 1 : 0);
