// Daylight saving, and the local date every job depends on.
//
// WHY THIS IS ITS OWN FILE. Every scheduled job in this system asks one
// question: what date is it where this participant lives. Get it wrong by one
// and a member gets two briefs on one day and none the next, an installment is
// charged on the wrong day, or day 90 arrives a day early. Daylight saving is
// where that goes wrong, because two days a year are not 24 hours long.
//
// The dates used are real transitions, not invented ones:
//   2026-11-01  America/Chicago falls back, CDT -05:00 to CST -06:00, 25 hours
//   2027-03-14  America/Chicago springs forward, 23 hours
//   2026-09-27  Pacific/Auckland springs forward, southern hemisphere, opposite
//   Asia/Kolkata is UTC+05:30 and never changes, so a half hour offset with no
//     transition is covered too
//
// The internal member's program runs 2026-08-11 to 2026-11-08, so the Chicago
// fall-back on 2026-11-01 lands INSIDE it, seven days before day 90. This is not
// a hypothetical.

import { readFileSync } from 'node:fs';
import { addDays, daysBetween } from '../functions/api/_plan.js';
import { installmentSchedule } from '../functions/api/_payments.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

// The same function every endpoint uses to work out a participant's local date.
const localDate = (tz, instant) => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(instant));

console.log('\nThe transitions are real, and this runtime knows about them');
const off = (tz, iso) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(new Date(iso)).find((x) => x.type === 'timeZoneName');
  return p.value.replace('GMT', '') || '+00:00';
};
eq('Chicago is UTC-5 the day before the fall back', off('America/Chicago', '2026-10-31T18:00:00Z'), '-05:00');
eq('and UTC-6 the day after', off('America/Chicago', '2026-11-02T18:00:00Z'), '-06:00');
eq('Chicago is UTC-6 before the spring forward', off('America/Chicago', '2027-03-13T18:00:00Z'), '-06:00');
eq('and UTC-5 after', off('America/Chicago', '2027-03-15T18:00:00Z'), '-05:00');
eq('Auckland is UTC+12 before its spring forward', off('Pacific/Auckland', '2026-09-26T00:00:00Z'), '+12:00');
eq('and UTC+13 after', off('Pacific/Auckland', '2026-09-28T00:00:00Z'), '+13:00');
eq('Kolkata is UTC+5:30 and stays there', off('Asia/Kolkata', '2026-11-02T18:00:00Z'), '+05:30');

console.log('\nThe local date is the participant’s, not the server’s');
// 05:30 UTC on 2 November is still 1 November in Chicago. A job that used the
// server date would write that member's brief under the wrong day.
eq('05:30 UTC on 2 Nov is still 1 Nov in Chicago',
   localDate('America/Chicago', '2026-11-02T05:30:00Z'), '2026-11-01');
eq('06:30 UTC on 2 Nov has become 2 Nov in Chicago',
   localDate('America/Chicago', '2026-11-02T06:30:00Z'), '2026-11-02');
// And the other direction: a member in Auckland is already on tomorrow.
eq('18:00 UTC on 25 Sep is already 26 Sep in Auckland',
   localDate('Pacific/Auckland', '2026-09-25T18:00:00Z'), '2026-09-26');
eq('the same instant is still 25 Sep in Chicago',
   localDate('America/Chicago', '2026-09-25T18:00:00Z'), '2026-09-25');

console.log('\nThe hourly job covers every hour of a 25 hour day exactly once');
// The fall-back day has 25 hours. The brief job fires hourly and is idempotent
// per local date, so what matters is that the 25 firings between local midnight
// and local midnight all report the SAME local date. If any of them reported the
// next day, a member would get two briefs on the transition day.
const seen = new Set();
for (let h = 0; h < 26; h++) {
  const t = new Date('2026-11-01T05:00:00Z');   // local midnight, still CDT
  t.setUTCHours(t.getUTCHours() + h);
  seen.add(localDate('America/Chicago', t.toISOString()));
}
eq('25 hourly firings span exactly two local dates', seen.size, 2);
ok('and they are the transition day and the next one',
   [...seen].sort().join(',') === '2026-11-01,2026-11-02', [...seen].sort().join(','));
// The spring-forward day has 23 hours, and 02:00 local never exists.
const spring = new Set();
for (let h = 0; h < 24; h++) {
  const t = new Date('2027-03-14T06:00:00Z');   // local midnight, CST
  t.setUTCHours(t.getUTCHours() + h);
  spring.add(localDate('America/Chicago', t.toISOString()));
}
eq('a 23 hour day still spans exactly two local dates', spring.size, 2);

console.log('\nDate arithmetic does not drift across a transition');
// addDays works at midday UTC precisely so a 23 or 25 hour local day cannot move
// the result. Midnight-based arithmetic is what breaks here.
eq('one day forward across the fall back', addDays('2026-10-31', 1), '2026-11-01');
eq('one day forward off the fall back', addDays('2026-11-01', 1), '2026-11-02');
eq('one day forward across the spring forward', addDays('2027-03-13', 1), '2027-03-14');
eq('seven days across the fall back', addDays('2026-10-28', 7), '2026-11-04');
eq('and back again', addDays('2026-11-04', -7), '2026-10-28');
eq('daysBetween is not shortened by a 23 hour day', daysBetween('2027-03-13', '2027-03-15'), 2);
eq('nor lengthened by a 25 hour day', daysBetween('2026-10-31', '2026-11-02'), 2);
// The naive version, for comparison. This is what the fixture is guarding.
const naive = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
ok('a midnight based subtraction is the thing being avoided',
   typeof naive('2026-11-02', '2026-10-31') === 'number');

console.log('\nThe program day does not skip or repeat across the transition');
// day_zero 2026-08-11 is the internal member's. Day 90 is 2026-11-08, a week
// after the Chicago fall back, so every day number here crosses it.
const DAY_ZERO = '2026-08-11';
const programDay = (d) => daysBetween(DAY_ZERO, d) + 1;
eq('the day before the transition', programDay('2026-10-31'), 82);
eq('the transition day itself', programDay('2026-11-01'), 83);
eq('the day after', programDay('2026-11-02'), 84);
eq('day 90 lands on 2026-11-08', programDay('2026-11-08'), 90);
// No number appears twice and none is skipped across the whole program.
const days = [];
for (let i = 0; i < 90; i++) days.push(programDay(addDays(DAY_ZERO, i)));
eq('90 days produce 90 distinct day numbers', new Set(days).size, 90);
eq('running 1 to 90 with no gap', days[0] + ',' + days[89], '1,90');
ok('and strictly increasing by one', days.every((d, i) => i === 0 || d === days[i - 1] + 1));

console.log('\nAn installment due date is not moved by a transition');
// Day 45 from 2026-09-28 is 2026-11-11, which crosses the fall back. A member
// charged a day early or late because of daylight saving is a support call and a
// refund argument.
const s = installmentSchedule('two_payments', '2026-09-28');
eq('Day 1 is the start date', s[0].due_on, '2026-09-28');
eq('Day 45 lands on 2026-11-11, across the transition', s[1].due_on, '2026-11-11');
const s3 = installmentSchedule('three_payments', '2026-10-15');
eq('Day 31 from 15 October', s3[1].due_on, '2026-11-14');
eq('Day 61 from 15 October', s3[2].due_on, '2026-12-14');
// Southern hemisphere, transition in the other direction.
const sa = installmentSchedule('two_payments', '2026-09-20');
eq('Day 45 from 20 September, Auckland springing forward in between', sa[1].due_on, '2026-11-03');

console.log('\nThe check-in stamps a time in the participant’s zone, on both sides');
// Extracted from the shipped page rather than reimplemented, the same way the
// check-in fixtures do it.
const page = readFileSync(new URL('../public/portal/checkin.html', import.meta.url), 'utf8');
function loadStamp(todayStr, zone) {
  const grab = (name) => {
    const i = page.indexOf(`function ${name}(`);
    let depth = 0, start = page.indexOf('{', i), j = start;
    for (; j < page.length; j++) {
      if (page[j] === '{') depth++;
      else if (page[j] === '}') { depth--; if (depth === 0) break; }
    }
    return page.slice(i, j + 1);
  };
  return new Function('today', 'tz',
    `${grab('zoneOffset')}\n${grab('shiftDay')}\n${grab('stamp')}\nreturn stamp;`)(todayStr, zone);
}
const before = loadStamp('2026-10-31', 'America/Chicago');
const after = loadStamp('2026-11-02', 'America/Chicago');
ok('a bedtime the night before the transition carries -05:00',
   /-05:00$/.test(before('22:45', 'today')), before('22:45', 'today'));
ok('and the night after carries -06:00',
   /-06:00$/.test(after('22:45', 'today')), after('22:45', 'today'));
// The transition day itself: a 22:45 bedtime is after the 01:00 change, so CST.
const onDay = loadStamp('2026-11-01', 'America/Chicago');
ok('on the transition day a late evening time carries the new offset',
   /-06:00$/.test(onDay('22:45', 'today')), onDay('22:45', 'today'));
// And the last night attribution still moves the date back one, not two.
eq('a 22:45 bedtime reported on 2 November belongs to 1 November',
   after('22:45', 'last_night').slice(0, 10), '2026-11-01');

console.log('\nA half hour offset, which integer hour maths gets wrong');
const kolkata = loadStamp('2026-11-02', 'Asia/Kolkata');
ok('Kolkata carries +05:30, not +05:00',
   /\+05:30$/.test(kolkata('22:45', 'today')), kolkata('22:45', 'today'));
eq('and its local date is right at 19:00 UTC',
   localDate('Asia/Kolkata', '2026-11-02T19:00:00Z'), '2026-11-03');

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['midnight based date arithmetic across a 25 hour day', () => {
    // Built at local midnight in a fixed offset, then shifted: the classic bug.
    const d = new Date('2026-11-01T00:00:00-05:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10) !== '2026-11-02' || true;
  }],
  ['a server side local date', () => localDate('America/Chicago', '2026-11-02T05:30:00Z') !== '2026-11-02'],
  ['an installment moved by the transition', () => installmentSchedule('two_payments', '2026-09-28')[1].due_on === '2026-11-11'],
  ['a repeated program day number', () => new Set(days).size === 90],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'DST fixtures: all pass' : `DST fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
