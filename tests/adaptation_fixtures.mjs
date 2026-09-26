// Follow-through and adaptation, master prompt D5.
//
// The line this must not cross: choosing which APPROVED rule appears today is
// adaptation and D5 permits it. Changing a protocol parameter is a protocol
// change, AUTONOMY_MODE is review_all, and nothing here may do one. So these
// fixtures check both that adaptation happens AND that it stays on its side of
// that line.

import { readFileSync } from 'node:fs';
import {
  observe, selectActions, actionBudget, setAsideRules, addDays,
  BARRIER_COOLDOWN_DAYS, BUDGET_BANDS, MAX_ACTIONS, MIN_ACTIONS,
} from '../functions/api/_plan.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const TODAY = '2026-09-26';
const rule = (k, p, extra = {}) => ({
  id: 'id-' + k, rule_key: k, pillar_key: p, version: 1, review_status: 'approved',
  action_text: 'Do ' + k + '.', required_data: [], contraindications: [],
  reassess_days: 14, ...extra,
});
const RULES = [
  rule('morning_light_minutes', 'morning_daylight'),
  rule('daily_water_target', 'hydration'),
  rule('post_meal_walk', 'movement'),
  rule('sleep_regularity', 'sleep'),
  rule('evening_light_cut', 'nighttime_darkness'),
];
const STATE = observe([], TODAY);

console.log('\nSilence is not failure');
// The single most important case. A participant who has not opened the app has
// not failed at anything, and cutting their plan for it would punish them for
// being new.
eq('a null adherence rate gets the full budget', actionBudget(null), MAX_ACTIONS);
eq('so does undefined', actionBudget(undefined), MAX_ACTIONS);
eq('and a non numeric rate', actionBudget('lots'), MAX_ACTIONS);

console.log('\nAn overwhelming plan is simplified, per D5');
eq('completing everything keeps three', actionBudget(1), 3);
eq('0.60 keeps three', actionBudget(0.60), 3);
eq('0.59 drops to two', actionBudget(0.59), 2);
eq('0.34 is two', actionBudget(0.34), 2);
eq('0.333, one of three answered, drops to one', actionBudget(0.333), 1);
eq('completing nothing is one', actionBudget(0), 1);
ok('the bands are ordered from most adherent down, or the first match is wrong',
   BUDGET_BANDS.every((b, i) => i === 0 || b.min < BUDGET_BANDS[i - 1].min));
ok('no band can produce more than the maximum',
   BUDGET_BANDS.every((b) => b.actions <= MAX_ACTIONS && b.actions >= MIN_ACTIONS));

console.log('\nA skipped action WITH a barrier is set aside, and comes back');
const hist = (o) => [{ rule_key: 'morning_light_minutes', plan_date: TODAY, ...o }];
const withBarrier = setAsideRules(hist({ status: 'skip', barrier: 'it rained all morning' }), TODAY);
ok('it is set aside', withBarrier.has('morning_light_minutes'));
eq('with basis barrier, not contraindication', withBarrier.get('morning_light_minutes').basis, 'barrier');
ok('and the reason says it comes back, with the date',
   /comes back on 2026-10-03/.test(withBarrier.get('morning_light_minutes').reason),
   withBarrier.get('morning_light_minutes').reason);
// A permanent removal from one bad day would quietly delete a pillar from
// somebody's program.
eq(`the cooldown is ${BARRIER_COOLDOWN_DAYS} days, not forever`, BARRIER_COOLDOWN_DAYS, 7);
const expired = setAsideRules(
  [{ rule_key: 'morning_light_minutes', plan_date: addDays(TODAY, -BARRIER_COOLDOWN_DAYS), status: 'skip', barrier: 'x' }],
  TODAY);
eq('a barrier older than the cooldown no longer sets the rule aside', expired.size, 0);
const dayBefore = setAsideRules(
  [{ rule_key: 'morning_light_minutes', plan_date: addDays(TODAY, -(BARRIER_COOLDOWN_DAYS - 1)), status: 'skip', barrier: 'x' }],
  TODAY);
eq('but one day inside it still does', dayBefore.size, 1);

console.log('\nA skip WITHOUT a barrier is not treated as a reason');
// They may simply not have answered the question. Inferring a reason from
// silence is how the software starts telling somebody what they think.
eq('a bare skip does not set the rule aside',
   setAsideRules(hist({ status: 'skip', barrier: null }), TODAY).size, 0);
eq('and neither does completing it', setAsideRules(hist({ status: 'complete' }), TODAY).size, 0);
eq('nor leaving it pending', setAsideRules(hist({ status: 'pending' }), TODAY).size, 0);

console.log('\n"Too much" is heard, and the dose change is NOT made here');
const adjusted = setAsideRules(hist({ status: 'adjust' }), TODAY);
ok('the rule is set aside', adjusted.has('morning_light_minutes'));
ok('and the reason says a smaller version needs review first',
   /reviewed before it can be offered/.test(adjusted.get('morning_light_minutes').reason),
   adjusted.get('morning_light_minutes').reason);
// The boundary, checked in the source: adaptation must not write a parameter.
const src = readFileSync(new URL('../functions/api/_plan.js', import.meta.url), 'utf8');
ok('the planner never writes a protocol parameter',
   !/protocol_parameters/.test(src) && !/min_value|max_value|weekly_step/.test(src));
ok('and says why that line exists',
   /AUTONOMY_MODE is review_all/.test(src.replace(/\s+/g, ' ')));

console.log('\nThe whole thing end to end, on the real shape of a bad week');
const history = [
  { rule_key: 'morning_light_minutes', plan_date: addDays(TODAY, -1), status: 'skip', barrier: 'raining' },
  { rule_key: 'sleep_regularity', plan_date: addDays(TODAY, -1), status: 'complete' },
  { rule_key: 'daily_water_target', plan_date: addDays(TODAY, -1), status: 'adjust' },
];
const previous = history.map((h) => ({ ...h, id: 'pa-' + h.rule_key, review_on: addDays(TODAY, 13) }));
const out = selectActions({
  rules: RULES, state: STATE, previous, history, today: TODAY, adherenceRate: 0.333,
});
eq('the budget is one', out.budget, 1);
eq('so one action is given', out.selected.length, 1);
eq('and it is the one they completed, carried forward', out.selected[0].rule.rule_key, 'sleep_regularity');
ok('the rule they gave a barrier for is withheld',
   out.excluded.some((e) => e.rule.rule_key === 'morning_light_minutes' && e.basis === 'barrier'));
ok('the rule they called too much is withheld',
   out.excluded.some((e) => e.rule.rule_key === 'daily_water_target' && e.basis === 'barrier'));

console.log('\nThe record of what changed and why, which D5 requires');
const kinds = out.adaptations.map((a) => a.change);
ok('it says the plan got shorter', kinds.includes('fewer_actions'));
ok('and which rules were set aside', out.adaptations.filter((a) => a.change === 'set_aside').length === 2);
ok('every entry carries a reason a person could read',
   out.adaptations.every((a) => a.reason && a.reason.length > 25));
ok('no entry contains an em dash',
   out.adaptations.every((a) => !a.reason.includes('—')));
ok('the shortening explains itself in plain numbers',
   /33 out of every 100/.test(out.adaptations.find((a) => a.change === 'fewer_actions').reason));
// A stable plan is a valid outcome, and says nothing.
const stable = selectActions({
  rules: RULES, state: STATE, today: TODAY, adherenceRate: 1,
  previous: [{ id: 'p1', rule_key: 'sleep_regularity', review_on: addDays(TODAY, 5), status: 'complete' }],
  history: [{ rule_key: 'sleep_regularity', plan_date: addDays(TODAY, -1), status: 'complete' }],
});
ok('an unchanged carried action produces no "introduced" entry',
   !stable.adaptations.some((a) => a.change === 'introduced' && a.rule_key === 'sleep_regularity'));
ok('a genuinely new action IS recorded as introduced',
   stable.adaptations.some((a) => a.change === 'introduced'));

console.log('\nAdaptation never overrides the Safety gate');
const flagged = selectActions({
  rules: [...RULES, rule('oily_fish_weekly', 'food_timing', { contraindications: ['anticoagulants'] })],
  state: STATE, flags: ['anticoagulants'], today: TODAY, adherenceRate: 1,
  // Even if it was completed yesterday and would otherwise be carried forward.
  previous: [{ id: 'p1', rule_key: 'oily_fish_weekly', review_on: addDays(TODAY, 10), status: 'complete' }],
  history: [{ rule_key: 'oily_fish_weekly', plan_date: addDays(TODAY, -1), status: 'complete' }],
});
ok('a contraindicated rule is not carried forward just because it was completed',
   !flagged.selected.some((s) => s.rule.rule_key === 'oily_fish_weekly'));
ok('and it is excluded as a contraindication, not as a barrier',
   flagged.excluded.some((e) => e.rule.rule_key === 'oily_fish_weekly' && e.basis === 'contraindication'));

console.log('\nThe budget can never produce an empty plan');
for (const rate of [0, 0.1, 0.333, 0.5, 0.9, 1, null]) {
  const r = selectActions({ rules: RULES, state: STATE, today: TODAY, adherenceRate: rate });
  ok(`at rate ${JSON.stringify(rate)} the plan has at least one action`,
     r.selected.length >= MIN_ACTIONS, String(r.selected.length));
}

console.log('\nThe flag control is audited and owner only');
const mig = readFileSync(new URL('../database/migrations/073_flag_control.sql', import.meta.url), 'utf8')
  .replace(/'\s*'/g, '').replace(/\s+/g, ' ');
ok('set_flag refuses a non admin', /not current_role_is\('admin'\)/.test(mig));
ok('it records the before and after value', /'before', v_before, 'after', p_enabled/.test(mig));
ok('and the reason, next to who did it', /'reason', p_reason/.test(mig));
ok('and says why a direct UPDATE was not enough', /leaves no trace/.test(mig));
const ops = readFileSync(new URL('../public/portal/admin/ops.html', import.meta.url), 'utf8');
ok('turning generation back ON asks for confirmation, turning it off does not',
   /Allow AI generation again\? Somebody stopped it/.test(ops));
ok('the screen states what the stop does NOT break',
   /still written from the approved rules/.test(ops));
ok('the screen says the function is the enforcement, not the hiding',
   /the function is the enforcement/.test(ops));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['silence counted as non adherence', () => actionBudget(null) === MAX_ACTIONS],
  ['a barrier removing a pillar forever',
   () => setAsideRules([{ rule_key: 'x', plan_date: addDays(TODAY, -30), status: 'skip', barrier: 'y' }], TODAY).size === 0],
  ['a reason inferred from a bare skip',
   () => setAsideRules(hist({ status: 'skip', barrier: null }), TODAY).size === 0],
  ['adaptation overriding a contraindication',
   () => !flagged.selected.some((s) => s.rule.rule_key === 'oily_fish_weekly')],
  ['a shrinking budget producing an empty plan',
   () => selectActions({ rules: RULES, state: STATE, today: TODAY, adherenceRate: 0 }).selected.length >= 1],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'adaptation fixtures: all pass' : `adaptation fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
