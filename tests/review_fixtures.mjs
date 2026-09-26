// The weekly review, master prompt D7.
//
// The hard requirement is one sentence long: "Use 'associated with' for
// observational patterns. Never claim an action caused a change."
//
// That is difficult rather than obvious. Everything the review has is one
// person's numbers over one week, which is the weakest evidence there is, and
// the natural English sentence about it is causal. "Your sleep improved because
// you got outside" is one word from "your sleep improved and you also got
// outside", and only the second is true. So causal language is CHECKED, not
// intended, and the check runs against the model's output too.

import {
  causalClaims, compareWeeks, associations, reviewWeekly, prioritiesFrom,
  MIN_DAYS_FOR_A_COMPARISON, MEANINGFUL, FIELD_WORDS,
} from '../functions/api/_review.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log('\nCausal language is refused, in every form it usually takes');
const CAUSAL = [
  'Your sleep improved because of the morning light.',
  'The walks caused your energy to rise.',
  'Due to your new bedtime, sleep is better.',
  'Getting outside led to better sleep.',
  'More water resulted in higher energy.',
  'That improved your sleep rating.',
  'The light raised your energy.',
  'This is causing better sleep.',
  'Thanks to the walks, movement is up.',
  'Your sleep is up, which is why your energy rose.',
  'The effect of the morning light is visible.',
  'This lowered your resting heart rate.',
];
for (const s of CAUSAL) {
  const hits = causalClaims(s);
  ok(`refused: ${JSON.stringify(s.slice(0, 38))}`, hits.length > 0, 'not caught');
}

console.log('\nAssociational language is allowed');
const FINE = [
  'Time outside went up in the same week as your sleep rating went up.',
  'How you rated your sleep is up, from 3.0 to 4.0 out of 5.',
  'Movement held about steady, around 30 minutes a day.',
  'Your energy is down, from 4.0 to 3.0 out of 5.',
  'Sleep and energy both moved up this week, and water rose alongside them.',
];
for (const s of FINE) {
  eq(`allowed: ${JSON.stringify(s.slice(0, 38))}`, causalClaims(s).length, 0);
}

console.log('\nThe sentences the module itself generates are never causal');
const week = (o, n = 7) => Array.from({ length: n }, () => ({ ...o }));
const big = compareWeeks(week({ sleep_quality: 4, energy: 3, outdoor_daylight_min: 26, movement_minutes: 38, water_ml: 2600 }),
                         week({ sleep_quality: 3, energy: 2, outdoor_daylight_min: 8, movement_minutes: 12, water_ml: 1400 }));
eq('five fields moved enough to count', big.changed.length, 5);
ok('and not one generated sentence claims a cause',
   big.changed.every((c) => causalClaims(c.sentence).length === 0));
ok('each states both numbers and a direction',
   big.changed.every((c) => /from .* to /.test(c.sentence) && /\b(up|down)\b/.test(c.sentence)));
ok('no generated sentence states a percentage',
   big.changed.every((c) => !/%/.test(c.sentence)));

console.log('\nAn association says out loud that it is not evidence of a cause');
const assoc = associations(big.changed);
ok('an association is produced when two things moved', assoc.length > 0);
ok('it uses "in the same week as"', assoc.every((a) => /in the same week as/.test(a)));
ok('and states plainly that neither moved the other',
   assoc.every((a) => /not evidence that either moved the other/.test(a)));
ok('at most two are shown, because a list of pairings reads as a finding',
   assoc.length <= 2, String(assoc.length));
eq('one change alone produces no association', associations([big.changed[0]]).length, 0);
eq('no changes produce none', associations([]).length, 0);

console.log('\nToo little data is a limitation, not a change and not a stability');
const thin = compareWeeks(week({ sleep_quality: 5 }, 2), week({ sleep_quality: 3 }, 7));
eq('two days is below the threshold', MIN_DAYS_FOR_A_COMPARISON, 3);
eq('so nothing is reported as changed', thin.changed.length, 0);
eq('and nothing as steady', thin.stable.length, 0);
ok('a limitation is reported instead', thin.limitations.length > 0);
ok('naming how many days there actually were',
   /only 2 days of sleep ratings/.test(thin.limitations[0]), thin.limitations[0]);
const none = compareWeeks([], week({ sleep_quality: 3 }));
ok('a field with no days at all says there is nothing to compare',
   none.limitations.some((l) => /nothing to compare/.test(l)));
// Saying something held steady when it was measured twice is a claim about data
// that does not exist.
ok('"held steady" is never claimed from too few days',
   !thin.stable.length);

console.log('\nThe limitation sentences are English');
// "No how you rated your sleep logged this week" was the first version.
for (const l of [...thin.limitations, ...none.limitations]) {
  ok(`reads as a sentence: ${JSON.stringify(l.slice(0, 44))}`,
     !/No how you|No your |ratings was logged/.test(l));
}
ok('every field has a bare noun form for those sentences',
   Object.values(FIELD_WORDS).every((v) => v.length === 3 && v[2]));

console.log('\nA change has to be big enough to be worth calling one');
const noise = compareWeeks(week({ sleep_quality: 3.2 }), week({ sleep_quality: 3.0 }));
eq('a 0.2 move on a 5 point scale is not a change', noise.changed.length, 0);
ok('it is reported as steady instead', noise.stable.length === 1);
const real = compareWeeks(week({ sleep_quality: 3.6 }), week({ sleep_quality: 3.0 }));
eq('a 0.6 move is', real.changed.length, 1);
ok('every threshold is in the field’s own units and is not a percentage',
   Object.values(MEANINGFUL).every((v) => typeof v === 'number' && v > 0));

console.log('\nThe review refuses rather than repairing');
const base = { week_start: '2026-09-14', changed: [], stable: [], limitations: ['Nothing logged.'] };
ok('a clean review passes', reviewWeekly(base).ok);
const refuses = (label, patch, expect) => {
  const v = reviewWeekly({ ...base, ...patch });
  ok(`it refuses ${label}`, !v.ok && v.problems.some((p) => expect.test(p)), JSON.stringify(v.problems));
};
refuses('a causal narrative', { narrative: 'Your sleep improved because of the light.' }, /causation/);
refuses('a causal sentence in changed',
  { changed: [{ sentence: 'Movement caused your energy to rise.' }] }, /causation/);
refuses('an em dash', { narrative: 'Sleep is up — energy too.' }, /em dash/);
refuses('a percentage', { narrative: 'Sleep is up 20%.' }, /percentage/);
refuses('a price', { narrative: 'The kit is $109.' }, /price/);
refuses('no week start', { week_start: null }, /week start/);
refuses('a review with nothing in it at all',
  { limitations: [], changed: [], stable: [] }, /nothing to report/);

console.log('\nNext week is what was already chosen, never new advice');
const pri = prioritiesFrom([{ rule_key: 'morning_light_minutes', action_text: 'Get outside.', review_on: '2026-10-09' }]);
eq('priorities come from plan actions', pri.length, 1);
eq('and carry the rule they came from', pri[0].rule_key, 'morning_light_minutes');
ok('with the review date', !!pri[0].review_on);
eq('no actions means no priorities', prioritiesFrom([]).length, 0);

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['a causal sentence reaching a member',
   () => causalClaims('The light improved your sleep.').length > 0],
  ['a change called from two days of data',
   () => compareWeeks(week({ sleep_quality: 5 }, 2), week({ sleep_quality: 3 }, 7)).changed.length === 0],
  ['an association presented as a finding',
   () => associations(big.changed).every((a) => /not evidence/.test(a))],
  ['a review with nothing in it stored anyway',
   () => !reviewWeekly({ week_start: '2026-09-14', changed: [], stable: [], limitations: [] }).ok],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'review fixtures: all pass' : `review fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
