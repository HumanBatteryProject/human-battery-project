// Continuing membership and webhook safety. Master prompt D9.
//
// Two classes of failure are tested here and both are silent in production.
//
// MONEY DATES. A renewal date that drifts, or a continuation that starts before
// the program ends, charges somebody twice for one period. Nothing errors.
//
// DUPLICATE AND OUT OF ORDER EVENTS. Stripe retries and does not promise order.
// A replayed event that creates a second entitlement gives a member two end
// dates, and the gate honours the longer one, so the bug is silent and in the
// member's favour, which is the kind nobody reports.

import {
  CONTINUATION_PLANS, CONTINUATION_KINDS, isContinuationKind,
  addInterval, addDays, continuationDates, cancellation, purchaseDecision,
} from '../functions/api/_continuation.js';
import { isStale, eventTime, eventIso, isHandled, sessionIntent } from '../functions/api/_webhook.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log('\nThe two options');
eq('there are exactly two membership options', CONTINUATION_KINDS.length, 2);
eq('monthly and annual', Object.keys(CONTINUATION_PLANS).sort(),
   ['continuation_annual', 'continuation_monthly']);
eq('no price lives in the code', Object.values(CONTINUATION_PLANS).every(
   (p) => !('price_cents' in p) && !('amount' in p)), true);
eq('the program plan is not a membership option', isContinuationKind('two_payments'), false);

console.log('\nRenewal dates do not drift');
eq('31 January plus a month is the last day of February', addInterval('2026-01-31', 'month'), '2026-02-28');
eq('31 January in a leap year', addInterval('2028-01-31', 'month'), '2028-02-29');
eq('31 March plus a month is 30 April', addInterval('2026-03-31', 'month'), '2026-04-30');
eq('30 November plus a month is 30 December', addInterval('2026-11-30', 'month'), '2026-12-30');
eq('a December month crosses the year', addInterval('2026-12-15', 'month'), '2027-01-15');
eq('29 February plus a year clamps to 28', addInterval('2028-02-29', 'year'), '2029-02-28');
eq('an ordinary month is the same day next month', addInterval('2026-09-26', 'month'), '2026-10-26');
{
  // The drift this guards: twelve consecutive monthly renewals from the 31st must
  // land on a real date every time and must never run away from the 28th to 31st
  // window. Adding a month with setUTCMonth would roll 31 January into 3 March
  // and then keep sliding.
  let d = '2026-01-31';
  const seen = [];
  for (let i = 0; i < 12; i++) { d = addInterval(d, 'month'); seen.push(d); }
  ok('twelve monthly renewals never produce an invalid date',
     seen.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x))),
     JSON.stringify(seen));
  ok('and never drift below the 28th', seen.every((x) => Number(x.slice(8)) >= 28), JSON.stringify(seen));
}

console.log('\nBuying membership before day 90 does not start it early');
{
  const d = continuationDates('continuation_monthly', '2026-10-01', '2026-12-15');
  eq('it starts the day AFTER the program ends', d.starts_on, '2026-12-16');
  eq('the first charge is that day, not today', d.first_charge_on, '2026-12-16');
  eq('and it renews a month after it starts', d.renews_on, '2027-01-16');
  eq('bought early is stated, not implied', d.bought_early, true);
  ok('and the member is told they are not charged yet',
     /will not be charged until then/.test(d.statement), d.statement);
}
{
  const d = continuationDates('continuation_monthly', '2026-12-20', '2026-12-15');
  eq('buying after the program ends starts today', d.starts_on, '2026-12-20');
  eq('and is not flagged as early', d.bought_early, false);
}
{
  const d = continuationDates('continuation_annual', '2026-10-01', null);
  eq('with no program at all it starts today', d.starts_on, '2026-10-01');
  eq('and renews in a year', d.renews_on, '2027-10-01');
  eq('and says so in years', d.every, 'year');
}

console.log('\nCancelling keeps access to the end of the paid period');
{
  const c = cancellation({ renews_on: '2026-11-15' }, '2026-10-20');
  eq('access runs to the day before the next renewal', c.access_until, '2026-11-14');
  eq('charges stop', c.charges_stop, true);
  eq('and nothing is deleted', c.keeps_data, true);
  ok('the member is told the date', /2026-11-14/.test(c.statement), c.statement);
  ok('and told data is separate from payment',
     /Nothing is deleted/.test(c.statement) && /export/.test(c.statement), c.statement);
}
{
  const c = cancellation({ renews_on: '2026-10-01' }, '2026-10-20');
  eq('a period that already ended does not grant access in the past', c.access_until, '2026-10-20');
}

console.log('\nNo overlap and no double billing when plans change');
{
  const d = purchaseDecision({ kind: 'continuation_monthly', existing: [], consentGranted: false });
  eq('no subscription consent, no purchase', d.allowed, false);
  ok('and the reason names consent', /consent/.test(d.reason), d.reason);
}
{
  const existing = [{ id: 'e1', kind: 'continuation_monthly', status: 'active' }];
  const d = purchaseDecision({ kind: 'continuation_monthly', existing, consentGranted: true });
  eq('buying the same plan twice is refused', d.allowed, false);
  eq('and points at the one they already have', d.existing_id, 'e1');
}
{
  const existing = [{ id: 'e1', kind: 'continuation_monthly', status: 'active' }];
  const d = purchaseDecision({ kind: 'continuation_annual', existing, consentGranted: true });
  eq('switching plans is allowed', d.allowed, true);
  eq('as a plan change, not a second membership', d.as, 'plan change');
  eq('and the old one MUST be closed in the same operation', d.must_close, 'e1');
}
{
  const existing = [{ id: 'e1', kind: 'continuation_monthly', status: 'cancelled' }];
  const d = purchaseDecision({ kind: 'continuation_monthly', existing, consentGranted: true });
  eq('a cancelled membership does not block a new one', d.allowed, true);
  eq('and is a new membership, not a change', d.as, 'new membership');
}
{
  const existing = [{ id: 'e1', kind: 'program', status: 'active' }];
  const d = purchaseDecision({ kind: 'continuation_monthly', existing, consentGranted: true });
  eq('an active PROGRAM does not block buying membership', d.allowed, true);
}
{
  const existing = [{ id: 'e1', kind: 'continuation_monthly', status: 'suspended' }];
  const d = purchaseDecision({ kind: 'continuation_annual', existing, consentGranted: true });
  eq('a SUSPENDED membership still counts as chargeable', d.as, 'plan change');
  eq('and must be closed too', d.must_close, 'e1');
}

console.log('\nOut of order events are decided by the provider clock');
{
  const tenAm = 1790000000;          // seconds
  const applied = new Date(tenAm * 1000).toISOString();
  eq('an older event is stale', isStale(applied, tenAm - 60), true);
  eq('a newer event is not', isStale(applied, tenAm + 60), false);
  eq('the same second is NOT stale, because two real events can share one',
     isStale(applied, tenAm), false);
  eq('nothing applied yet means nothing is stale', isStale(null, tenAm), false);
  eq('an event with no clock is not called stale', isStale(applied, null), false);
  eq('a nonsense clock is not called stale', isStale(applied, 'soon'), false);
}
eq('event time converts seconds to milliseconds', eventTime(1790000000), 1790000000000);
eq('and zero is not a time', eventTime(0), null);
ok('the ISO form round trips', eventIso(1790000000).startsWith('20'), eventIso(1790000000));

console.log('\nWhich events are acted on');
eq('a renewal is handled', isHandled('invoice.paid'), true);
eq('a cancellation is handled', isHandled('customer.subscription.deleted'), true);
eq('a failed payment is handled', isHandled('invoice.payment_failed'), true);
eq('an event we do not act on is not handled', isHandled('customer.created'), false);

console.log('\nWhat a checkout session means is read, never inferred');
{
  const i = sessionIntent({ metadata: { kind: 'program', plan: 'three_payments',
    application_id: 'a1', program_total_cents: '80000', installments: '3' } });
  eq('a program session is a program', i.kind, 'program');
  eq('with its plan', i.plan, 'three_payments');
  eq('and the DISCOUNTED total, as an integer', i.total_cents, 80000);
}
{
  const i = sessionIntent({ metadata: { kind: 'continuation_annual', client_id: 'c1',
    price_cents: '34900', starts_on: '2026-12-16', renews_on: '2027-12-16' } });
  eq('a membership session is a membership', i.kind, 'continuation_annual');
  eq('carrying the price agreed', i.price_cents, 34900);
  eq('and the dates disclosed', [i.starts_on, i.renews_on], ['2026-12-16', '2027-12-16']);
}
{
  const i = sessionIntent({ metadata: {} });
  eq('a session with no kind is NOT guessed at', i.kind, 'unknown');
  ok('and says what it saw', /kind/.test(i.why), i.why);
}
{
  const i = sessionIntent({ metadata: { kind: 'program', plan: 'paid_in_full', program_total_cents: '1000.00' } });
  eq('a non-integer amount is refused rather than rounded', i.total_cents, null);
}

console.log('\nDay arithmetic');
eq('a day after', addDays('2026-12-31', 1), '2027-01-01');
eq('a day before', addDays('2026-01-01', -1), '2025-12-31');
eq('89 days after day zero is day 90', addDays('2026-10-15', 89), '2027-01-12');

console.log(`\n${bad ? `FAILED: ${bad}` : 'continuation and webhook fixtures all pass'}`);
process.exit(bad ? 1 : 0);
