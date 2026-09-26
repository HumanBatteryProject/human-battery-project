// There are no cohorts. Every participant is an N of 1.
//
// This is a structural fixture because the thing being protected is an absence:
// the cohort concept must not creep back into the membership path. The two start
// dates each month remain, but only as start dates, and the reason they exist is
// the lab lead time for a NEW participant.
//
// The defect this guards against already happened once. memberships was NOT NULL
// on cohort_id and UNIQUE on (client_id, cohort_id), which meant cycle 2 for the
// same person was a duplicate, so cycle chaining could not work at all and
// nothing said so until a smoke test tried it.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Strip comments, so an explanatory mention of the word does not read as a use.
const code = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*$/gm, '')
  .replace(/\/\/[^\n]*/g, '');

console.log('\nThe membership path names no cohort');
const FILES = [
  '../functions/api/complete.js',
  '../functions/api/checkout.js',
  '../functions/api/stripe-webhook.js',
  '../functions/api/cycle-boundary.js',
  '../functions/api/brief-run.js',
  '../public/portal/app.js',
];
for (const f of FILES) {
  const src = code(f);
  ok(`${f.split('/').pop()} does not read or write a cohort`,
     !/cohort/i.test(src),
     (src.match(/.{0,40}cohort.{0,40}/i) || [''])[0].trim());
}

console.log('\nThe schema says one membership per participant per cycle');
const mig = read('../database/migrations/061_no_cohorts.sql');
ok('the (client_id, cohort_id) constraint is dropped',
   /drop constraint if exists memberships_client_id_cohort_id_key/.test(mig));
ok('(client_id, cycle) is the invariant instead',
   /unique \(client_id, cycle\)/.test(mig));
ok('memberships.cohort_id is dropped, not merely made nullable',
   /alter table memberships drop column if exists cohort_id/.test(mig));
// Bounded to the CREATE VIEW statement itself. The first version sliced to the
// end of the file, which swept in the deprecation comment's legitimate mention of
// applications.cohort_id and reported a correct migration as broken. A check that
// cries wolf gets switched off.
const viewStart = mig.indexOf('create view participant_memberships');
const viewStmt = mig.slice(viewStart, mig.indexOf(';', viewStart));
ok('participant_memberships is rebuilt without it', !/cohort/i.test(viewStmt));
ok('the rebuilt view keeps security_invoker, or it bypasses row level security',
   /create view participant_memberships with \(security_invoker = on\)/.test(mig));
ok('the cohorts table is marked deprecated rather than left looking live',
   /DEPRECATED, 061/.test(mig));

console.log('\nStart dates exist, and for the stated reason');
ok('program_start_dates applies the lead time, for a new participant',
   /minimum_lead_days/.test(mig) && /program_start_dates/.test(mig));
const mig63 = read('../database/migrations/063_next_start_after.sql');
ok('next_start_date_after applies NO lead time, for a continuing participant',
   /NO lead time/.test(mig63.replace(/\s+/g, ' ')));
ok('and says why the two are separate functions',
   /day 90 draw is the same draw as the next cycle/.test(mig63.replace(/\s+/g, ' ')));

console.log('\nChaining sets the next start date');
const complete = code('../functions/api/complete.js');
ok('the chained cycle is given a day_zero',
   /day_zero: nextStart/.test(complete));
ok('it comes from next_start_date_after and not from arithmetic here',
   /next_start_date_after/.test(complete));
ok('the chained cycle is enrolled, not active, so nothing starts itself',
   /status: 'enrolled'/.test(complete));

console.log('\nNothing member facing groups people');
for (const f of ['../public/terms.html', '../public/privacy.html']) {
  const src = read(f);
  ok(`${f.split('/').pop()} does not tell a member they are in a cohort`,
     !/your cohort|cohort seat|cohort dates/i.test(src),
     (src.match(/.{0,30}cohort.{0,30}/i) || [''])[0].trim());
}

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['a cohort_id written back into a membership insert',
   () => /cohort/i.test("sb.insert('memberships', { client_id, cohort_id: x })")],
  ['a nullable cohort_id instead of a dropped one',
   () => !/drop column if exists cohort_id/.test('alter table memberships alter column cohort_id drop not null;')],
  ['a chained cycle with no start date',
   () => !/day_zero: nextStart/.test("sb.insert('memberships', { cycle: 2 })")],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'cohortless fixtures: all pass' : `cohortless fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
