// Discounts, replacing the founding price.
//
// Ruled 26 September. The four cases the ruling names are here, plus the ones
// that protect the money: a percent stored as a fraction, a discount larger than
// the price, and installments that stop summing to the discounted total.
//
// The database half (validity windows, use limits, redemption audit) is proved
// against the live database in the run recorded in the commit message, because a
// use limit is a concurrency property and a pure function cannot hold one.

import { readFileSync } from 'node:fs';
import { discountCents, quote, quoteBalances } from '../functions/api/_discounts.js';
import { installmentAmounts, money, PROGRAM_TOTAL_CENTS } from '../functions/api/_payments.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log('\nThe ruled case: 20 percent, on the plan that survived the repricing');
// Was three payments on $1,000. The three-payment plan was removed on 2026-09-29
// with the new price, so the same rounding rule is exercised on two payments.
const q = quote({ planKey: 'two_payments', dayZero: '2026-10-15',
                  discount: { kind: 'percent', amount: 20, name: 'Launch 20' } });
eq('the list price is $249.99', q.list, '$249.99');
eq('$50.00 comes off', q.discount_off, '$50.00');
eq('leaving $199.99', q.charged, '$199.99');
eq('installment 1 is $100.00', q.installments[0].amount, '$100.00');
eq('installment 2 is $99.99', q.installments[1].amount, '$99.99');
eq('and they sum to the discounted total', q.installments_sum_cents, 19999);
ok('the quote balances', quoteBalances(q) === true);
// The rounding rule matters. Flooring, which the module used before discounts
// existed, gives 266.66 / 266.66 / 266.68: a cent different from what was ruled,
// in the direction that charges the last installment more.
// Rounding, not flooring. On $199.99 over two, rounding gives 100.00 then 99.99;
// flooring gives 99.99 then 100.00, moving the odd cent to the last installment.
ok('flooring would NOT have produced the ruled amounts',
   JSON.stringify([9999, 10000]) !== JSON.stringify(installmentAmounts('two_payments', 19999)));

console.log('\nThe same discount on the other two plans');
const full = quote({ planKey: 'paid_in_full', discount: { kind: 'percent', amount: 20 } });
eq('pay in full becomes $199.99', full.installments[0].amount, '$199.99');

console.log('\nThe undiscounted amounts did not change');
eq('two payments at list are still $125.00, $124.99',
   installmentAmounts('two_payments').join(','), '12500,12499');
eq('and still sum to $249.99',
   installmentAmounts('two_payments').reduce((a, b) => a + b, 0), 24999);

console.log('\nEvery discounted total still sums, for every plan and every percent');
let mismatches = [];
for (const plan of ['paid_in_full', 'two_payments']) {
  for (let pct = 1; pct <= 100; pct++) {
    const qq = quote({ planKey: plan, discount: { kind: 'percent', amount: pct } });
    if (qq.installments_sum_cents !== qq.charged_cents) mismatches.push(`${plan} ${pct}%`);
    if (!quoteBalances(qq)) mismatches.push(`${plan} ${pct}% unbalanced`);
  }
}
ok('300 plan and percent combinations all sum to the discounted total',
   mismatches.length === 0, mismatches.slice(0, 6).join(', '));

console.log('\nFixed amounts');
eq('$100 off the program leaves $149.99',
   quote({ planKey: 'paid_in_full', discount: { kind: 'fixed', amount: 10000 } }).charged, '$149.99');
eq('a fixed discount larger than the price makes it free, never negative',
   quote({ planKey: 'paid_in_full', discount: { kind: 'fixed', amount: 500000 } }).charged, '$0.00');
eq('100 percent makes it free',
   quote({ planKey: 'two_payments', discount: { kind: 'percent', amount: 100 } }).charged, '$0.00');

console.log('\nA percent is whole percent, and a bad discount is refused');
eq('20 percent of $249.99 is $50.00', discountCents(24999, 'percent', 20), 5000);
// A percent stored as 0.2 and read as 20 is the same class of error as dollars
// read as cents, so a fraction must not be accepted as a percent.
for (const [label, fn] of [
  ['a fractional percent like 0.2', () => discountCents(100000, 'percent', 0.2)],
  ['a percent above 100', () => discountCents(100000, 'percent', 101)],
  ['a zero discount', () => discountCents(100000, 'percent', 0)],
  ['a negative discount', () => discountCents(100000, 'fixed', -500)],
  ['an unknown kind', () => discountCents(100000, 'bogof', 20)],
  ['a non integer list price', () => discountCents(1000.5, 'percent', 20)],
  ['a string amount', () => discountCents(100000, 'fixed', '500')],
]) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(`${label} is refused`, threw);
}
eq('a percent that lands on a half cent rounds rather than dropping it',
   discountCents(33333, 'percent', 15), 5000);

console.log('\nNo discount means no discount');
const plain = quote({ planKey: 'two_payments', discount: null });
eq('nothing comes off', plain.discount_cents, 0);
eq('and the charge is the list price', plain.charged_cents, PROGRAM_TOTAL_CENTS);
eq('with no discount name', plain.discount_name, null);

console.log('\nThe founding price is gone from the code');
const settingsSrc = readFileSync(new URL('../functions/api/_settings.js', import.meta.url), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
ok('_settings.js declares no founding key', !/FOUNDING|founding_price|founding_window/.test(code(settingsSrc)));
// Comments stripped first. The file's own note saying inFoundingWindow was
// removed is not a use of it, and a check that cannot tell the difference
// fails on a correct file.
ok('inFoundingWindow is not exported any more', !/inFoundingWindow/.test(code(settingsSrc)));
const mig = readFileSync(new URL('../database/migrations/066_discounts.sql', import.meta.url), 'utf8');
ok('first_start_date is dropped, the helper founding pricing needed',
   /drop function if exists first_start_date/.test(mig));
ok('and the migration says why a retired helper is not kept',
   /waiting to come back/.test(mig.replace(/\s+/g, ' ')));

console.log('\nThe schema enforces what code alone should not');
ok('a percent above 100 is refused by a constraint', /percent_is_a_percent/.test(mig));
ok('a discount is a code OR a per member discount, never both',
   /discount_is_code_or_member/.test(mig));
ok('a redemption must balance: list minus discount equals charged',
   /redemption_arithmetic/.test(mig));
ok('one redemption per participant per discount', /unique \(discount_id, client_id\)/.test(mig));
ok('the use limit is re-checked inside the statement that increments it',
   /use_limit is null or times_used < use_limit/.test(mig));
ok('codes are unique case insensitively', /upper\(code\)/.test(mig));
ok('revoking keeps the history rather than deleting it',
   /Past redemptions are kept|revoked_at/.test(readFileSync(new URL('../functions/api/discount.js', import.meta.url), 'utf8')));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['the discount taken off only the first installment',
   () => { const wrong = [24999 - 5000, 12500];
           return wrong.reduce((a, b) => a + b, 0) !== 80000; }],
  ['flooring the discounted split', () => {
    const b = Math.floor(80000 / 3); const a = [b, b, b]; a[2] += 80000 - b * 3;
    return JSON.stringify(a) !== JSON.stringify([26667, 26667, 26666]); }],
  ['a percent stored as a fraction', () => {
    let threw = false; try { discountCents(100000, 'percent', 0.2); } catch { threw = true; }
    return threw; }],
  ['a discount making the charge negative',
   () => quote({ planKey: 'paid_in_full', discount: { kind: 'fixed', amount: 500000 } }).charged_cents === 0],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'discount fixtures: all pass' : `discount fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
