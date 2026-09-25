// Bounded autonomy fixtures. Brief 06A A3 asks for one change that applies,
// one blocked by each of the five rules, one member decline and one admin
// revert. All eight are here.
//
// evaluate() is pure, so these assert on the verdict rather than on a database
// round trip. "Blocked by rule 3" is then a thing a test can state.

import { evaluate, RULES, CONFIDENCE_FLOOR, AUTONOMY_MODE } from '../functions/api/_autonomy.js';

const BOUND = {                       // morning_light_min, intermediate
  param: 'morning_light_min', tier: 'intermediate', unit: 'minutes',
  min_value: 10, max_value: 30, weekly_step: 5, intervention: 'morning light',
};
const SAUNA = {
  param: 'sauna_min', tier: 'intermediate', unit: 'minutes',
  min_value: 0, max_value: 15, weekly_step: 5, intervention: 'sauna',
};
const OK = {
  param: 'morning_light_min', from_value: 10, to_value: 15, tier: 'intermediate',
  bound: BOUND, tiers: ['established'], flags: [], days_logged: 12, window_days: 14,
};

let bad = 0;
const t = (label, got, want) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log('%s %s got=%s', ok ? 'ok  ' : 'FAIL', label.padEnd(58),
    JSON.stringify(got).slice(0, 60));
};

console.log('AUTONOMY_MODE = %s, CONFIDENCE_FLOOR = %s\n', AUTONOMY_MODE, CONFIDENCE_FLOOR);

// 1. applies
const a = evaluate(OK, 'bounded');
t('a change inside every bound APPLIES', a.apply, true);
t('  and records the rule that permitted it', typeof a.permitted_by, 'string');

// 2. blocked by rule 1, target outside the published range
t('rule 1 blocks a target above the tier maximum',
  evaluate({ ...OK, to_value: 40 }, 'bounded').blocked_by, 'rule 1: ' + RULES[1]);
t('rule 1 blocks a parameter the tier does not define',
  evaluate({ ...OK, bound: null }, 'bounded').blocked_by, 'rule 1: ' + RULES[1]);

// 3. blocked by rule 2, evidence too weak to trigger
t('rule 2 blocks when the best tier is "Early evidence"',
  evaluate({ ...OK, tiers: ['emerging'] }, 'bounded').blocked_by, 'rule 2: ' + RULES[2]);
t('rule 2 blocks on "Dr. Micah\'s idea, being tested" alone',
  evaluate({ ...OK, tiers: ['hypothesis'] }, 'bounded').blocked_by, 'rule 2: ' + RULES[2]);
t('rule 2 blocks on "Published, and argued about" alone',
  evaluate({ ...OK, tiers: ['contested'] }, 'bounded').blocked_by, 'rule 2: ' + RULES[2]);

// 4. blocked by rule 3, screening flag on the intervention
t('rule 3 blocks when the member is flagged on that intervention',
  evaluate({ ...OK, bound: SAUNA, to_value: 5, from_value: 0, flags: ['sauna'] }, 'bounded').blocked_by,
  'rule 3: ' + RULES[3]);
t('  a flag on a DIFFERENT intervention does not block',
  evaluate({ ...OK, flags: ['sauna'] }, 'bounded').apply, true);

// 5. blocked by rule 4, step too large
t('rule 4 blocks a jump larger than the weekly step',
  evaluate({ ...OK, to_value: 25 }, 'bounded').blocked_by, 'rule 4: ' + RULES[4]);

// 6. blocked by rule 5, not enough logged data
t('rule 5 blocks when coverage is below the floor',
  evaluate({ ...OK, days_logged: 5 }, 'bounded').blocked_by, 'rule 5: ' + RULES[5]);
t('  a missing week is not a signal',
  evaluate({ ...OK, days_logged: 7 }, 'bounded').apply, false);

// 7 and 8. decline and revert are state transitions, asserted on the shape the
// database enforces rather than on evaluate()
// queued -> applied IS legitimate: that is an admin approving something the
// bounds sent to review. My first version of this fixture asserted it was
// forbidden, which was wrong about the design rather than about the code.
// What must NOT be possible is re-applying something already declined.
const ALLOWED = {
  applied:  ['declined', 'reverted'],
  queued:   ['applied', 'declined'],
  declined: [],
  reverted: [],
};
const TRANSITIONS = [
  ['a member declines an applied change',      'applied',  'declined', true],
  ['an admin reverts an applied change',       'applied',  'reverted', true],
  ['an admin approves a queued change',        'queued',   'applied',  true],
  ['a DECLINED change cannot be re-applied',   'declined', 'applied',  false],
  ['a REVERTED change cannot be re-applied',   'reverted', 'applied',  false],
];
for (const [label, from, to, want] of TRANSITIONS) {
  t(label, (ALLOWED[from] || []).includes(to), want);
}

// ---------------------------------------------------------------------
// The mode gate itself.
//
// Brief 08 section 8 decision 1 launches V1 at review_all. The five rules above
// are tested in 'bounded' explicitly, so these are the cases that prove the
// mode actually gates, and that the shipped value is the one the brief chose.
// Without these, flipping the constant back to 'bounded' by accident would pass
// every test in this file.
// ---------------------------------------------------------------------
console.log('\nMode gate');
t('the shipped mode is review_all, per Brief 08 section 8 decision 1',
  AUTONOMY_MODE, 'review_all');
t('review_all blocks a change that bounded would allow',
  evaluate(OK, 'review_all').apply, false);
t('and says the mode is why, not a rule number',
  evaluate(OK, 'review_all').blocked_by, 'AUTONOMY_MODE is review_all');
t('bounded still allows that same change, so the rules are reachable',
  evaluate(OK, 'bounded').apply, true);
t('review_all still reports weakness, so the queue can show it',
  evaluate({ ...OK, tiers: ['hypothesis'] }, 'review_all').weak, true);
t('calling evaluate with no mode uses the shipped constant',
  evaluate(OK).blocked_by, evaluate(OK, AUTONOMY_MODE).blocked_by);

console.log('\n%d case(s) failed', bad);
process.exit(bad ? 1 : 0);
