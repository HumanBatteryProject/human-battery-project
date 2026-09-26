// Day 3: start date selection, program day, and baseline collection context.
//
// The behaviour under test lives mostly in SQL, because that is where it belongs:
// program day must have ONE answer and the offered start dates must have one
// definition. So these are structural checks against the migrations plus the
// arithmetic conventions that the JavaScript side has to agree with.
//
// Stated plainly: this file does not execute program_day(). That is proved against
// the live database in the run recorded in the commit message, because a function
// that reads the participant's timezone from their profile cannot be exercised
// without a participant.

import { readFileSync } from 'node:fs';
import { prose } from './_prose.mjs';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// Flatten whitespace AND the seam between concatenated SQL string literals. A
// comment written as 'must not be rendered as a ' 'number' reads as
// "...rendered as a ' 'number" otherwise, and the check fails on correct text.
// Same trap as the hard-wrapped consent body: a phrase that spans a break is
// still the phrase.
// One normaliser, shared: tests/_prose.mjs.
const flat = (p) => prose(read(p));

const m67 = read('../database/migrations/067_program_day_and_baseline.sql');
const m67f = flat('../database/migrations/067_program_day_and_baseline.sql');
const m68f = flat('../database/migrations/068_fasting_on_submit.sql');

console.log('\nProgram day has one definition, and it is the participant’s');
ok('program_day exists as a function', /create or replace function program_day/.test(m67));
ok('it reads the timezone from the profile, not the server',
   /at time zone coalesce\(p\.timezone/.test(m67));
ok('Day 1 is day_zero, matching the payment schedule',
   /- m\.day_zero\) \+ 1/.test(m67));
ok('no start date gives null, which is not day 0',
   /when m\.day_zero is null then null/.test(m67));
ok('and the comment says null must not be rendered as a number',
   /must not be rendered as a number/.test(m67f));
ok('it reads the LATEST cycle, so a continuing participant is not counted from their first start',
   /order by m\.cycle desc/.test(m67));

console.log('\nThe same Day 1 convention as the money');
// If these two ever disagree, a participant is charged on a different day from
// the one their plan calls Day 1.
const pay = read('../functions/api/_payments.js');
ok('the payment schedule also treats Day 1 as the start date',
   /\(programDay - 1\)/.test(pay) && /Day 1 IS day zero/.test(pay));

console.log('\nStart dates are offered, not accepted from anywhere');
ok('is_offered_start_date exists', /create or replace function is_offered_start_date/.test(m67));
ok('it is defined in terms of program_start_dates, so the lead time is not reimplemented',
   /from program_start_dates\(12\)/.test(m67));
ok('and says why a 1st that is too soon is not an offer',
   /is not an offer even if it is a 1st or a 15th/.test(m67f));
const wl = read('../functions/api/waitlist.js');
ok('the form handler validates against the database rather than re-deriving',
   /is_offered_start_date/.test(wl));
ok('a malformed date is refused before the round trip',
   /That start date is not a date/.test(wl));
const idx = flat('../public/index.html');
ok('the form fetches the dates rather than computing them',
   /fetch\('\/api\/start-dates/.test(idx));
ok('and fails loudly rather than showing an empty dropdown',
   /could not load the start dates/i.test(idx));

console.log('\nA resubmission cannot silently keep the old start date');
ok('the handler compares the stored date with the submitted one',
   /start_date_kept/.test(wl));
ok('it keeps the first application, which is the right precedence',
   /the original is kept/.test(wl));
ok('but says so when the date differs',
   /We have not changed it to the date you just picked/.test(flat('../functions/api/waitlist.js')));
ok('and the form shows the message rather than its own text',
   /res\.d\.message/.test(idx));

console.log('\nCollection context defaults to unknown, never to fasted');
ok('fasting_status exists on the panel', /fasting_status fasting_state not null default 'unknown'/.test(m67));
ok('and the comment says why unknown is the default',
   /unknown is a fact; fasted is a claim/.test(m67f));
ok('fasted_hours is bounded to something possible',
   /fasted_hours between 0 and 48/.test(m67));
ok('the submit path actually writes it, rather than leaving the column to its default',
   /coalesce\(p_fasting, 'unknown'\)/.test(m68f));
ok('a later "unknown" does not erase a recorded fasting status',
   /must not erase a 'fasted' somebody recorded/.test(m68f));
ok('the old five argument signature is dropped, not left as a silent overload',
   /drop function if exists submit_client_result\(uuid, draw_point, date, text, jsonb\)/.test(m68f));
const labs = flat('../public/portal/labs.html');
ok('the entry screen asks, with "I am not sure" as the first option',
   /<option value="unknown">I am not sure<\/option>/.test(labs));
ok('and sends it', /p_fasting: el\('#e-fasting'\)\.value/.test(labs));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['program day computed from the server clock',
   () => !/at time zone/.test('select current_date - m.day_zero + 1')],
  ['Day 1 treated as day_zero + 1',
   () => !/\) \+ 1/.test('select (on_date - m.day_zero) + 2')],
  ['fasting defaulting to fasted',
   () => !/default 'unknown'/.test("fasting_status fasting_state not null default 'fasted'")],
  ['the lead time reimplemented in JavaScript',
   () => !/is_offered_start_date/.test("if (d.getDate() === 1 || d.getDate() === 15) accept();")],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'onboarding fixtures: all pass' : `onboarding fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
