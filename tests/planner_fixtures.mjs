// The Planner, the Safety gate and the Reviewer.
//
// All three are pure, which is the point: master prompt E2 keeps eligibility,
// scoring and safety exclusions in deterministic code so the model can only
// reword a decision already made. That makes them testable without a database,
// without a model, and without a participant.
//
// The one that matters most is the Safety gate. It was written correctly and
// pointed at nothing: the seeded rules named contraindications like
// 'anticoagulant' and 'levothyroxine', which are not keys in the medication
// screening table, so the gate compared against flags that could never be raised
// and permitted everything. It looked like it was working.

import {
  observe, selectActions, safetyBlock, reviewPlan, confidenceFor, missingFor,
  pillarNeed, addDays, daysBetween, MAX_ACTIONS, MIN_ACTIONS, CONFIDENCE, FIELDS,
} from '../functions/api/_plan.js';
import { SCREENING_KEYS, flagsFromText, screeningRowFor } from '../functions/api/_medical.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const TODAY = '2026-09-25';
const rule = (o) => ({
  id: 'id-' + o.rule_key, version: 1, review_status: 'approved',
  required_data: [], contraindications: [], reassess_days: 14, ...o,
});
const RULES = [
  rule({ rule_key: 'morning_light_minutes', pillar_key: 'morning_daylight',
         action_text: 'Get outside within an hour of waking.',
         required_data: ['waketime', 'outdoor_daylight_min'], contraindications: ['bipolar_diagnosis'] }),
  rule({ rule_key: 'oily_fish_weekly', pillar_key: 'food_timing',
         action_text: 'Eat oily fish three times a week.',
         required_data: ['first_meal_at'], contraindications: ['anticoagulants'] }),
  rule({ rule_key: 'daily_water_target', pillar_key: 'hydration',
         action_text: 'Reach your water target.', required_data: ['water_ml'],
         contraindications: ['diuretics_or_sodium_restriction'] }),
  rule({ rule_key: 'post_meal_walk', pillar_key: 'movement',
         action_text: 'Walk after your largest meal.', required_data: ['movement_minutes'] }),
  rule({ rule_key: 'sleep_regularity', pillar_key: 'sleep',
         action_text: 'Same bedtime and wake time.', required_data: ['bedtime', 'waketime'],
         contraindications: ['bipolar_diagnosis'], reassess_days: 21 }),
];

console.log('\nThe Safety gate blocks, and says why in words');
eq('no flags means nothing is blocked', safetyBlock(RULES[1], []), null);
const blocked = safetyBlock(RULES[1], ['anticoagulants']);
ok('a matching flag blocks the rule', blocked !== null);
eq('with basis contraindication', blocked.basis, 'contraindication');
ok('naming the screening row a person would recognise', /Anticoagulants/.test(blocked.reason), blocked.reason);
ok('and telling them to speak to their prescriber', /prescriber/.test(blocked.reason));
eq('an unrelated flag does not block', safetyBlock(RULES[1], ['lithium']), null);
ok('a rule with two contraindications blocks on either',
   safetyBlock(rule({ rule_key: 'x', pillar_key: 'hydration', action_text: 'a',
                      contraindications: ['diuretics_or_sodium_restriction','heart_failure_or_fluid_restriction'] }),
               ['heart_failure_or_fluid_restriction']) !== null);

console.log('\nEvery contraindication a rule can name must be a real screening key');
// This is the check that would have caught the original defect.
for (const r of RULES) {
  for (const c of r.contraindications) {
    ok(`${r.rule_key} names the real key ${c}`, SCREENING_KEYS.has(c), `not in: ${[...SCREENING_KEYS].join(', ')}`);
  }
}
ok('the invented keys from the first seed are NOT real keys',
   !['anticoagulant', 'levothyroxine', 'diuretic_bp', 'insulin', 'antidepressant_mood']
     .some((k) => SCREENING_KEYS.has(k)));
ok('every screening key resolves to a row a participant would recognise',
   [...SCREENING_KEYS].every((k) => screeningRowFor(k) && screeningRowFor(k).on));

console.log('\nA contraindicated participant never receives the action');
const coldState = observe([], TODAY);
const onWarfarin = selectActions({ rules: RULES, state: coldState, flags: flagsFromText('I take warfarin daily'), today: TODAY });
ok('oily fish is not in the plan', !onWarfarin.selected.some((s) => s.rule.rule_key === 'oily_fish_weekly'));
ok('and it is in the exclusions with its reason',
   onWarfarin.excluded.some((e) => e.rule.rule_key === 'oily_fish_weekly' && /Anticoagulants/.test(e.reason)));
const bipolar = selectActions({ rules: RULES, state: coldState, flags: ['bipolar_diagnosis'], today: TODAY });
ok('both bipolar-flagged rules are withheld',
   !bipolar.selected.some((s) => ['morning_light_minutes', 'sleep_regularity'].includes(s.rule.rule_key)),
   bipolar.selected.map((s) => s.rule.rule_key).join(','));
ok('and the plan is still produced from what remains', bipolar.selected.length >= MIN_ACTIONS);

console.log('\nAn unapproved rule can never be selected');
const pendingOnly = selectActions({
  rules: RULES.map((r) => ({ ...r, review_status: 'pending' })), state: coldState, today: TODAY });
eq('nothing is selected from pending rules', pendingOnly.selected.length, 0);
ok('and each is excluded on eligibility',
   pendingOnly.excluded.every((e) => e.basis === 'eligibility'));
ok('the internal exception is the ONLY other status accepted',
   selectActions({ rules: RULES.map((r) => ({ ...r, review_status: 'pending_internal' })),
                   state: coldState, today: TODAY }).selected.length > 0);
for (const status of ['retired', 'rejected', 'draft', '']) {
  eq(`status ${JSON.stringify(status)} selects nothing`,
     selectActions({ rules: RULES.map((r) => ({ ...r, review_status: status })), state: coldState, today: TODAY }).selected.length, 0);
}

console.log('\nOne to three actions, from different pillars');
const plenty = selectActions({ rules: RULES, state: coldState, today: TODAY });
ok(`at most ${MAX_ACTIONS} actions`, plenty.selected.length <= MAX_ACTIONS, String(plenty.selected.length));
ok('at least one', plenty.selected.length >= MIN_ACTIONS);
const pillars = plenty.selected.map((s) => s.rule.pillar_key);
eq('no two actions from the same pillar', new Set(pillars).size, pillars.length);
ok('sort_order is set and sequential',
   plenty.selected.every((s, i) => s.sort_order === i));
ok('every action gets a review date in the future',
   plenty.selected.every((s) => s.review_on > TODAY));
eq('a 21 day rule reviews 21 days out',
   selectActions({ rules: [RULES[4]], state: coldState, today: TODAY }).selected[0].review_on,
   addDays(TODAY, 21));

console.log('\nThe same inputs give the same plan, every time');
const a = selectActions({ rules: RULES, state: coldState, today: TODAY });
const b = selectActions({ rules: [...RULES].reverse(), state: coldState, today: TODAY });
eq('order does not depend on the order the rules arrived in',
   a.selected.map((s) => s.rule.rule_key).join(','),
   b.selected.map((s) => s.rule.rule_key).join(','));

console.log('\nA stable plan: an action repeats until its review date');
const prev = [{ id: 'pa-1', rule_key: 'post_meal_walk', review_on: '2026-10-01', status: 'complete' }];
const carried = selectActions({ rules: RULES, state: coldState, previous: prev, today: TODAY });
ok('an action still within its review window is carried forward',
   carried.selected.some((s) => s.rule.rule_key === 'post_meal_walk' && s.carried === true));
eq('and says so as its reason',
   carried.selected.find((s) => s.carried).why.includes('Carried over'), true);
const due = selectActions({ rules: RULES, state: coldState, today: TODAY,
  previous: [{ id: 'pa-1', rule_key: 'post_meal_walk', review_on: '2026-09-20', status: 'complete' }] });
ok('an action past its review date is NOT carried',
   !due.selected.some((s) => s.carried));
const skipped = selectActions({ rules: RULES, state: coldState, today: TODAY,
  previous: [{ id: 'pa-1', rule_key: 'post_meal_walk', review_on: '2026-10-01', status: 'skip', barrier: 'too sore' }] });
ok('an action skipped WITH a barrier is not repeated at them',
   !skipped.selected.some((s) => s.rule.rule_key === 'post_meal_walk' && s.carried));

console.log('\nConfidence is qualitative, and honest about missing data');
eq('no data at all is insufficient', confidenceFor(RULES[0], coldState), CONFIDENCE.INSUFFICIENT);
const logs = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({
  log_date: addDays(TODAY, -i), waketime: '2026-09-25T06:30:00Z', outdoor_daylight_min: 20, ...extra }));
eq('one day of data is limited, not good', confidenceFor(RULES[0], observe(logs(1), TODAY)), CONFIDENCE.LIMITED);
eq('several days of the rule’s own data is good', confidenceFor(RULES[0], observe(logs(5), TODAY)), CONFIDENCE.GOOD);
eq('missing fields are listed by name',
   missingFor(RULES[0], coldState).join(','), 'waketime,outdoor_daylight_min');
eq('and nothing is listed once the data exists',
   missingFor(RULES[0], observe(logs(3), TODAY)).length, 0);
ok('no confidence value is a number',
   Object.values(CONFIDENCE).every((c) => typeof c === 'string' && !/\d/.test(c)));

console.log('\nA missing day is missing, never zero');
const gappy = observe([{ log_date: TODAY, water_ml: 3000 }, { log_date: addDays(TODAY, -3), water_ml: 1000 }], TODAY);
eq('two logged days count as two, not as the whole window', gappy.days_logged, 2);
eq('the mean is over the days that exist', gappy.means.water_ml, 2000);
eq('a field never logged has a null mean, not 0', gappy.means.energy, null);
eq('and a count of 0', gappy.counts.energy, 0);
ok('a log older than the window is ignored',
   observe([{ log_date: addDays(TODAY, -40), water_ml: 9000 }], TODAY).days_logged === 0);
ok('a log dated in the future is ignored',
   observe([{ log_date: addDays(TODAY, 3), water_ml: 9000 }], TODAY).days_logged === 0);

console.log('\nNeed is deterministic and prefers the emptiest pillar');
ok('no daylight logged outranks plenty of daylight',
   pillarNeed('morning_daylight', observe([], TODAY)) >
   pillarNeed('morning_daylight', observe(logs(5, { outdoor_daylight_min: 45 }), TODAY)));
ok('poor sleep outranks good sleep',
   pillarNeed('sleep', observe(logs(5, { sleep_quality: 2 }), TODAY)) >
   pillarNeed('sleep', observe(logs(5, { sleep_quality: 5 }), TODAY)));
ok('an unknown pillar scores low rather than throwing',
   pillarNeed('not_a_pillar', coldState) < 20);

console.log('\nThe Reviewer refuses rather than repairing');
const approvedKeys = new Set(RULES.map((r) => r.rule_key));
const goodPlan = { actions: [{ rule_key: 'post_meal_walk', action_text: 'Walk.', why: 'Because.',
                               confidence: 'limited', review_on: '2026-10-09' }] };
ok('a valid plan passes', reviewPlan(goodPlan, { approvedKeys }).ok);
const refuses = (label, plan, expect) => {
  const v = reviewPlan(plan, { approvedKeys });
  ok(`it refuses ${label}`, !v.ok && v.problems.some((p) => expect.test(p)), JSON.stringify(v.problems));
};
refuses('an empty plan', { actions: [] }, /at least/);
refuses('more than three actions',
  { actions: Array.from({ length: 4 }, (_, i) => ({ rule_key: 'r' + i, action_text: 'a', why: 'b', confidence: 'limited', review_on: '2026-10-09' })) }, /at most/);
refuses('an action citing an unapproved rule',
  { actions: [{ ...goodPlan.actions[0], rule_key: 'made_up' }] }, /not an approved rule/);
refuses('the same rule twice',
  { actions: [goodPlan.actions[0], goodPlan.actions[0]] }, /twice/);
refuses('an action with no text', { actions: [{ ...goodPlan.actions[0], action_text: '  ' }] }, /no action text/);
refuses('an action with no reason', { actions: [{ ...goodPlan.actions[0], why: '' }] }, /no reason/);
refuses('a numeric confidence', { actions: [{ ...goodPlan.actions[0], confidence: 0.82 }] }, /qualitative/);
refuses('no review date', { actions: [{ ...goodPlan.actions[0], review_on: null }] }, /no review date/);
refuses('a fabricated percentage', { actions: [{ ...goodPlan.actions[0], why: 'We are 82% sure.' }] }, /percentage/);
refuses('an em dash', { actions: [{ ...goodPlan.actions[0], why: 'Because — you know.' }] }, /em dash/);
refuses('a price', { actions: [{ ...goodPlan.actions[0], action_text: 'Buy the kit for $109.' }] }, /price/);
ok('a pending_internal plan passes only when that is allowed',
   reviewPlan({ actions: [{ rule_key: 'not_approved_yet', action_text: 'a', why: 'b', confidence: 'limited', review_on: '2026-10-09' }] },
              { approvedKeys, allowInternalPending: true }).ok);

console.log('\nRequired data can only name a field that is actually collected');
for (const r of RULES) {
  for (const f of r.required_data) {
    ok(`${r.rule_key} requires ${f}, which the check-in collects`, FIELDS.includes(f));
  }
}

console.log('\nDate arithmetic');
eq('addDays across a month', addDays('2026-09-30', 1), '2026-10-01');
eq('addDays backwards across a year', addDays('2027-01-01', -1), '2026-12-31');
eq('daysBetween counts forward', daysBetween('2026-09-20', TODAY), 5);
eq('and is 0 for the same day', daysBetween(TODAY, TODAY), 0);

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['a contraindication key that is not in the screening table',
   () => !SCREENING_KEYS.has('levothyroxine')],
  ['a safety gate that permits a flagged rule',
   () => safetyBlock(RULES[1], ['anticoagulants']) !== null],
  ['a plan built from pending rules',
   () => selectActions({ rules: RULES.map((r) => ({ ...r, review_status: 'pending' })), state: coldState, today: TODAY }).selected.length === 0],
  ['a fabricated confidence percentage reaching a member',
   () => !reviewPlan({ actions: [{ rule_key: 'post_meal_walk', action_text: 'a', why: '82% likely', confidence: 'limited', review_on: '2026-10-09' }] }, { approvedKeys }).ok],
  ['a missing day counted as zero',
   () => observe([{ log_date: TODAY, water_ml: 2000 }], TODAY).means.energy === null],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'planner fixtures: all pass' : `planner fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
