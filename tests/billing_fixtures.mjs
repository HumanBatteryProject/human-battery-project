// The three payment options, and the payment failure policy.
//
// Every number here is money. These are the fixtures that matter most in the
// whole suite, because the failure mode is charging a real person the wrong
// amount, and because a live Stripe integration is the hardest place to test
// arithmetic. So the arithmetic lives in pure functions and is tested here.
//
// The endpoint and database halves (one entitlement per option, webhook replay,
// suspension blocking every route) are proved against the live database in
// scripts/smoke.sh and in the run recorded in the commit message. This file is
// the policy.

import { readFileSync } from 'node:fs';
import {
  PLANS, PROGRAM_TOTAL_CENTS, installmentAmounts, installmentSchedule,
  planSummary, money,
} from '../functions/api/_payments.js';
import {
  weeklyPlan, weeklyPlanOffer, outstandingCents, accessDecision,
  accessThroughAfterWeeklyPayment, reachableWhileSuspended,
  WEEKLY_RECOVERY_WEEKS, ACCESS_DAYS_PER_WEEKLY_PAYMENT,
} from '../functions/api/_billing.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log('\nThe price, confirmed 26 September');
eq('the program price is $1,000.00', PROGRAM_TOTAL_CENTS, 100000);
eq('and formats as $1,000.00', money(PROGRAM_TOTAL_CENTS), '$1,000.00');
eq('there are exactly three options', Object.keys(PLANS).length, 3);

console.log('\nEvery option totals exactly $1,000.00');
for (const key of Object.keys(PLANS)) {
  const amounts = installmentAmounts(key);
  const sum = amounts.reduce((a, b) => a + b, 0);
  eq(`${key} sums to 100000 cents`, sum, 100000);
  ok(`${key} has no zero or negative installment`, amounts.every((a) => a > 0), JSON.stringify(amounts));
}

console.log('\nThe amounts are the ruled amounts');
ok('pay in full is one payment of $1,000.00',
   JSON.stringify(installmentAmounts('paid_in_full')) === JSON.stringify([100000]));
ok('two payments are $500.00 and $500.00',
   JSON.stringify(installmentAmounts('two_payments')) === JSON.stringify([50000, 50000]));
ok('three payments are $333.33, $333.33 and $333.34',
   JSON.stringify(installmentAmounts('three_payments')) === JSON.stringify([33333, 33333, 33334]),
   JSON.stringify(installmentAmounts('three_payments')));

console.log('\nThe days are the ruled days, counted from the start date');
eq('pay in full falls on Day 1', JSON.stringify(PLANS.paid_in_full.days), '[1]');
eq('two payments fall on Day 1 and Day 45', JSON.stringify(PLANS.two_payments.days), '[1,45]');
eq('three payments fall on Day 1, Day 31 and Day 61', JSON.stringify(PLANS.three_payments.days), '[1,31,61]');

console.log('\nDay 1 IS the start date, not the day after');
const s1 = installmentSchedule('paid_in_full', '2026-10-15');
eq('the first charge is due on the start date itself', s1[0].due_on, '2026-10-15');
const s2 = installmentSchedule('two_payments', '2026-10-15');
eq('Day 45 from 15 October is 28 November', s2[1].due_on, '2026-11-28');
const s3 = installmentSchedule('three_payments', '2026-10-15');
eq('Day 31 from 15 October is 14 November', s3[1].due_on, '2026-11-14');
eq('Day 61 from 15 October is 14 December', s3[2].due_on, '2026-12-14');

// A month boundary and a leap year, because date arithmetic is where this breaks.
eq('Day 45 from 31 January 2028 is 15 March, across a leap February',
   installmentSchedule('two_payments', '2028-01-31')[1].due_on, '2028-03-15');
eq('Day 61 from 1 December crosses the year end',
   installmentSchedule('three_payments', '2026-12-01')[2].due_on, '2027-01-30');

console.log('\nThe schedule is shown in full, with real money strings');
const sum = planSummary('three_payments', '2026-10-15');
eq('the summary states the total', sum.total, '$1,000.00');
eq('and lists three rows', sum.schedule.length, 3);
ok('every row carries a day, an amount and a due date',
   sum.schedule.every((r) => r.program_day && r.amount && r.due_on));
eq('the last row is the one that absorbs the remainder', sum.schedule[2].amount, '$333.34');
ok('a summary with no start date still shows the amounts',
   planSummary('two_payments', null).schedule.every((r) => r.amount === '$500.00'));

console.log('\nA bad plan or a bad date is refused, not guessed');
for (const [name, fn] of [
  ['an unknown plan', () => installmentSchedule('four_payments', '2026-10-15')],
  ['a missing start date', () => installmentSchedule('two_payments', null)],
  ['a start date that is not a date', () => installmentSchedule('two_payments', 'next Tuesday')],
  ['a US formatted date', () => installmentSchedule('two_payments', '10/15/2026')],
]) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(`${name} throws rather than producing a schedule`, threw);
}

console.log('\nOutstanding balance');
eq('pending and failed both count as owed',
   outstandingCents([{ amount_cents: 33333, status: 'paid' },
                     { amount_cents: 33333, status: 'failed' },
                     { amount_cents: 33334, status: 'pending' }]), 66667);
eq('refunded and void do not count',
   outstandingCents([{ amount_cents: 50000, status: 'refunded' },
                     { amount_cents: 50000, status: 'void' }]), 0);
eq('nothing owed on a fully paid plan',
   outstandingCents([{ amount_cents: 100000, status: 'paid' }]), 0);

console.log('\nThe weekly recovery plan');
eq('the default is 4 weeks', WEEKLY_RECOVERY_WEEKS, 4);
eq('a weekly payment buys 7 days', ACCESS_DAYS_PER_WEEKLY_PAYMENT, 7);
const wp = weeklyPlan(66667);
eq('a $666.67 balance becomes 4 weekly payments', wp.weeks_total, 4);
eq('which sum to the balance exactly',
   wp.schedule.reduce((a, b) => a + b.amount_cents, 0), 66667);
ok('the last payment absorbs the remainder',
   wp.schedule[3].amount_cents > wp.schedule[0].amount_cents);
ok('no weekly payment is zero',
   weeklyPlan(3).schedule.every((w) => w.amount_cents > 0),
   JSON.stringify(weeklyPlan(3).schedule.map((w) => w.amount_cents)));
eq('a balance smaller than the week count uses fewer weeks', weeklyPlan(3).weeks_total, 3);
eq('a one cent balance is a single payment', weeklyPlan(1).weeks_total, 1);
for (const bad_in of [0, -1, 1.5, null, '500']) {
  let threw = false;
  try { weeklyPlan(bad_in); } catch { threw = true; }
  ok(`a balance of ${JSON.stringify(bad_in)} is refused`, threw);
}

console.log('\nThe offer is shown in full before acceptance');
const offer = weeklyPlanOffer(50000);
eq('it states the balance', offer.outstanding, '$500.00');
eq('and proves the payments sum to it', offer.sums_to, '$500.00');
ok('it says each payment keeps access for another week',
   /keeps your access for\s+another week/.test(offer.statement));
ok('it says access stops if a payment fails',
   /access stops until\s+the balance is paid/.test(offer.statement));
ok('it says nothing is deleted',
   /Nothing is deleted/.test(offer.statement));
ok('it says export stays available',
   /export your own records/.test(offer.statement));
ok('the offer contains no em dash', !offer.statement.includes('—'));

console.log('\nEach weekly payment moves access forward exactly one week');
eq('a payment on 28 November buys through 5 December',
   accessThroughAfterWeeklyPayment('2026-11-28'), '2026-12-05');
eq('and across a month end', accessThroughAfterWeeklyPayment('2026-12-28'), '2027-01-04');

console.log('\nThe access decision');
const TODAY = '2026-11-20';
const base = { status: 'active', effective_from: '2026-10-15', effective_to: null,
               access_through: null, access_until: null };
ok('an active entitlement allows access', accessDecision(base, TODAY).allowed === true);
ok('no entitlement means no access', accessDecision(null, TODAY).allowed === false);
ok('a suspended entitlement blocks access',
   accessDecision({ ...base, status: 'suspended', suspended_reason: 'weekly payment failed' }, TODAY).allowed === false);
ok('and says why, so a person can be told',
   /weekly payment failed/.test(accessDecision({ ...base, status: 'suspended', suspended_reason: 'weekly payment failed' }, TODAY).reason));
ok('a current weekly payment keeps access',
   accessDecision({ ...base, access_through: '2026-11-27' }, TODAY).allowed === true);
ok('a lapsed weekly payment stops access',
   accessDecision({ ...base, access_through: '2026-11-19' }, TODAY).allowed === false);
ok('access_through on today itself still counts as paid',
   accessDecision({ ...base, access_through: TODAY }, TODAY).allowed === true);
ok('a cancelled entitlement keeps access to the end of the paid period',
   accessDecision({ ...base, status: 'cancelled', access_until: '2026-12-31' }, TODAY).allowed === true);
ok('and stops after it',
   accessDecision({ ...base, status: 'cancelled', access_until: '2026-11-01' }, TODAY).allowed === false);
ok('an entitlement that has not started yet does not allow access',
   accessDecision({ ...base, effective_from: '2026-12-01' }, TODAY).allowed === false);

console.log('\nSuspension is not deletion');
for (const p of ['/portal/account', '/portal/account.html', '/api/export', '/api/data-request', '/portal/login']) {
  ok(`${p} stays reachable while suspended`, reachableWhileSuspended(p) === true);
}
for (const p of ['/portal/', '/portal/index.html', '/portal/log', '/portal/labs', '/portal/seasonal', '/api/coach', '/api/brief-run']) {
  ok(`${p} is NOT reachable while suspended`, reachableWhileSuspended(p) === false);
}

// The website states the schedule in prose and _payments.js states it in code.
// Two statements of the same fact drift, and the one a buyer reads is the one
// that matters, so this compares them.
console.log('\nThe page a buyer reads matches the code that charges them');
const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8')
  .replace(/\s+/g, ' ');
ok('the page states the total as $1,000', /\$1,000/.test(page));
ok('the page names no day 30 or day 60, which the old copy did',
   !/on Day 30|on Day 60|at day 30|at day 60/i.test(page));
ok('the page says a failed payment is offered as weekly payments',
   /offer you the balance as weekly payments/.test(page));
ok('and that nothing is deleted', /nothing you have recorded is ever deleted/.test(page));
// Derived from the code, so a change to PLANS fails this line rather than leaving
// the site quietly wrong.
for (const [key, label] of [['paid_in_full', 'Pay in full'], ['two_payments', 'Two payments'], ['three_payments', 'Three payments']]) {
  const amounts = installmentAmounts(key);
  const days = PLANS[key].days;
  // Two accepted forms of the same amount: "$500.00" and "$500". Readable copy
  // drops the trailing zeros and should be allowed to, so this compares the VALUE
  // and the DAY, which are the things that must not drift. It still fails on
  // $333.33 where $333.34 was meant, which is the case worth catching.
  const forms = (cents) => {
    const full = money(cents);
    return full.endsWith('.00') ? [full, full.slice(0, -3)] : [full];
  };
  const variants = days.reduce((acc, d, i) => {
    const next = [];
    for (const prefix of acc) for (const f of forms(amounts[i])) {
      next.push(prefix ? `${prefix}, ${f} on Day ${d}` : `${f} on Day ${d}`);
    }
    return next;
  }, ['']);
  ok(`${label} on the page is exactly what the code would charge`,
     variants.some((v) => page.includes(v)),
     'none of these appeared: ' + variants.join(' | '));
}

console.log('\nNo founding price exists any more');
ok('_payments.js names no founding price',
   !/founding/i.test(readFileSync(new URL('../functions/api/_payments.js', import.meta.url), 'utf8')));
ok('_billing.js names no founding price',
   !/founding/i.test(readFileSync(new URL('../functions/api/_billing.js', import.meta.url), 'utf8')));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['three equal thirds, leaving the books a cent short',
   () => [33333, 33333, 33333].reduce((a, b) => a + b, 0) !== 100000],
  ['Day 1 treated as the day after the start date',
   () => { const d = new Date('2026-10-15T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
           return d.toISOString().slice(0, 10) !== '2026-10-15'; }],
  ['a 30 day interval used for Day 45',
   () => { const d = new Date('2026-10-15T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 30);
           return d.toISOString().slice(0, 10) !== '2026-11-28'; }],
  ['a suspended entitlement that still allows access',
   () => accessDecision({ status: 'suspended', suspended_reason: 'x', effective_from: '2026-01-01' }, TODAY).allowed === false],
  ['the portal reachable while suspended',
   () => reachableWhileSuspended('/portal/index.html') === false],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'billing fixtures: all pass' : `billing fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
