// The Heat and cold pillar.
//
// The owner's pillar ruling made heat and cold a pillar in its own right and gave
// it five fixed rules. Four of the five can be violated silently by a plan, and
// three of them were ALREADY being violated by the system as it stood:
//
//   - protocol_parameters allowed a 10 minute plunge at pro and 8 at advanced,
//     against a ceiling of 5.
//   - HARD_CAPS in _intensity.js allowed 10 minutes and, in its comment, water
//     down to 38F, which is 3.3 C against a floor of 7 C.
//   - the deliverables said cold must wait four hours after lifting, not six.
//
// So these fixtures are not aimed at "does the dose render". They are aimed at
// "can the ceiling be crossed by any path", because every path that crossed it
// looked like working code.

import {
  HARD_CEILING_MINUTES, HARD_FLOOR_CELSIUS, COLD_AFTER_STRENGTH_HOURS,
  SAUNA_BEFORE_BED_HOURS, capCold, coldWithMultiplier, coldTimingOk,
  saunaTimingOk, heatDoseFor, hoursBetween, HEATCOLD_RULES, mentionsHeatOrCold,
  REDUCED_HEAT_DOSE_FLAGS, SAUNA_CONDITIONS, COLD_CONDITIONS,
} from '../functions/api/_heatcold.js';
import { applyMultiplier, HARD_CAPS, HARD_FLOORS, NEVER_SCALED, RETURN_MULTIPLIER } from '../functions/api/_intensity.js';
import { observe, attachPractices, pillarNeed, whyFor, FIELDS, PRACTICE_FIELDS } from '../functions/api/_plan.js';
import { SCREENING_KEYS, flagsFromText } from '../functions/api/_medical.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const TODAY = '2026-03-02';

// ---------------------------------------------------------------- the ceilings

eq('the ceiling is five minutes', HARD_CEILING_MINUTES, 5);
eq('the floor is 7 C', HARD_FLOOR_CELSIUS, 7);
eq('the wait after strength training is six hours', COLD_AFTER_STRENGTH_HOURS, 6);
eq('the pre-bed window is one to two hours', SAUNA_BEFORE_BED_HOURS, [1, 2]);

eq('eight minutes is capped to five', capCold({ minutes: 8, celsius: 10 }).minutes, 5);
eq('four degrees is raised to seven', capCold({ minutes: 3, celsius: 4 }).celsius, 7);
ok('a capped dose says it was capped', capCold({ minutes: 8, celsius: 10 }).capped === true);
ok('a dose inside the bounds is not capped', capCold({ minutes: 3, celsius: 10 }).capped === false);
eq('two notes when both bounds are crossed', capCold({ minutes: 9, celsius: 2 }).notes.length, 2);

// The case the ruling names explicitly.
eq('the pro 20 percent increase cannot breach the ceiling',
   coldWithMultiplier({ minutes: HARD_CEILING_MINUTES, celsius: 8, multiplier: RETURN_MULTIPLIER }).minutes,
   HARD_CEILING_MINUTES);
eq('and the same through applyMultiplier, which is the path complete.js uses',
   applyMultiplier('cold_min', 5, RETURN_MULTIPLIER).value, 5);
ok('a multiplier that would breach reports capped',
   applyMultiplier('cold_min', 5, RETURN_MULTIPLIER).capped === true);

// The two caps that were wrong before the ruling.
eq('HARD_CAPS.cold_min is the ruling ceiling, not the old 10', HARD_CAPS.cold_min, 5);
eq('HARD_FLOORS.cold_temp_c is the ruling floor', HARD_FLOORS.cold_temp_c, 7);

// A multiplier on a cold temperature ran backwards: warmer is a SMALLER dose.
ok('a cold temperature is never scaled', NEVER_SCALED.has('cold_temp_c'));
eq('so an intensity rise does not warm the water',
   applyMultiplier('cold_temp_c', 10, 1.2).value, 10);
eq('and a temperature below the floor is raised even with no multiplier',
   applyMultiplier('cold_temp_c', 3, 1).value, 7);

// Absence must not become a measured zero. Number(null) is 0, which is how an
// absent day-90 lab value once read as a maximal improvement in this project.
eq('an absent duration stays absent', capCold({ minutes: null, celsius: null }).minutes, null);
eq('an unparseable duration stays absent', capCold({ minutes: 'soon', celsius: null }).minutes, null);
ok('and neither counts as capped', capCold({ minutes: null, celsius: null }).capped === false);

// ------------------------------------------------------------ the timing rules

ok('cold three hours after a lift is refused',
   coldTimingOk({ coldAt: TODAY + 'T17:00:00Z', strengthAt: TODAY + 'T14:00:00Z' }).ok === false);
ok('cold at five hours fifty nine is still refused',
   coldTimingOk({ coldAt: TODAY + 'T19:59:00Z', strengthAt: TODAY + 'T14:00:00Z' }).ok === false);
ok('cold at six hours is allowed',
   coldTimingOk({ coldAt: TODAY + 'T20:00:00Z', strengthAt: TODAY + 'T14:00:00Z' }).ok === true);
ok('cold BEFORE the lift is allowed, because the rule is about after',
   coldTimingOk({ coldAt: TODAY + 'T06:00:00Z', strengthAt: TODAY + 'T14:00:00Z' }).ok === true);
// A missing training log is not proof that nobody lifted.
ok('no training logged is reported as unknown, not as clear',
   coldTimingOk({ coldAt: TODAY + 'T17:00:00Z', strengthAt: null }).unknown === true);
ok('and the unknown case says so in words',
   /cannot be checked/.test(coldTimingOk({ coldAt: TODAY + 'T17:00:00Z', strengthAt: null }).reason));

ok('a sauna thirty minutes before bed is refused',
   saunaTimingOk({ saunaEndAt: TODAY + 'T21:30:00Z', bedtimeAt: TODAY + 'T22:00:00Z' }).ok === false);
ok('ninety minutes before bed is inside the window',
   saunaTimingOk({ saunaEndAt: TODAY + 'T20:30:00Z', bedtimeAt: TODAY + 'T22:00:00Z' }).ok === true);
ok('four hours before bed is allowed but flagged early, not unsafe',
   saunaTimingOk({ saunaEndAt: TODAY + 'T18:00:00Z', bedtimeAt: TODAY + 'T22:00:00Z' }).early === true);
ok('no bedtime logged is unknown',
   saunaTimingOk({ saunaEndAt: TODAY + 'T21:00:00Z', bedtimeAt: null }).unknown === true);

eq('hoursBetween returns null on an unparseable time', hoursBetween('not a time', TODAY + 'T10:00:00Z'), null);

// ------------------------------------------------------ the reduced heat dose

ok('trying to conceive is the flag the ruling names',
   REDUCED_HEAT_DOSE_FLAGS.includes('trying_to_conceive_male'));
eq('a flagged man gets half the heat dose, not none',
   heatDoseFor({ minutes: 20, flags: ['trying_to_conceive_male'] }).minutes, 10);
ok('and is told why', /Reduced heat dose/.test(heatDoseFor({ minutes: 20, flags: ['trying_to_conceive_male'] }).because));
eq('an unflagged member gets the full dose',
   heatDoseFor({ minutes: 20, flags: [] }).minutes, 20);

// ------------------------------------------- the exclusions actually exist

// A contraindication naming a key that is not in the screening table is a safety
// gate comparing against a flag that can never be raised. That happened once in
// this project already, with invented keys like 'levothyroxine'.
for (const k of ['recent_heart_attack', 'unstable_angina', 'severe_aortic_stenosis',
                 'arrhythmia', 'uncontrolled_blood_pressure', 'very_low_blood_pressure',
                 'pregnancy', 'raynauds', 'trying_to_conceive_male']) {
  ok(`the screening table has ${k}`, SCREENING_KEYS.has(k));
}
ok('a heart attack in plain words raises its flag',
   flagsFromText('I had a heart attack last year').includes('recent_heart_attack'));
ok('afib raises the arrhythmia flag',
   flagsFromText('I have afib').includes('arrhythmia'));
ok("Raynaud's raises its flag",
   flagsFromText('I get raynauds in the winter').includes('raynauds'));
ok('a man trying to conceive raises its flag',
   flagsFromText('we are trying to conceive').includes('trying_to_conceive_male'));

// ------------------------------------------------- the pillar has real inputs

ok('sauna_minutes is a field the planner knows', FIELDS.includes('sauna_minutes'));
ok('cold_minutes is a field the planner knows', FIELDS.includes('cold_minutes'));
ok('strength_at is a field the planner knows', FIELDS.includes('strength_at'));
ok('the practice that feeds cold is mapped', PRACTICE_FIELDS['cold-exposure'].minutes === 'cold_minutes');

const logs = [{ id: 'L1', log_date: TODAY }];
const joined = attachPractices(logs, [
  { daily_log_id: 'L1', slug: 'cold-exposure', completed: true, minutes: 3, occurred_at: TODAY + 'T07:00:00Z' },
  { daily_log_id: 'L1', slug: 'heat-exposure', completed: false, minutes: 20, occurred_at: TODAY + 'T20:00:00Z' },
]);
eq('a completed cold session becomes cold_minutes', joined[0].cold_minutes, 3);
ok('a practice ticked as NOT done contributes nothing, rather than a zero',
   joined[0].sauna_minutes === undefined);

const withCold = observe(joined, TODAY);
const withNeither = observe([{ id: 'L2', log_date: TODAY }], TODAY);
ok('neither logged needs the pillar more than one logged',
   pillarNeed('heat_and_cold', withNeither) > pillarNeed('heat_and_cold', withCold));
ok('the pillar is not the default arm of the switch',
   pillarNeed('heat_and_cold', withNeither) !== pillarNeed('some_pillar_that_does_not_exist', withNeither));
ok('the reason names what was actually logged',
   /cold on 1 of the last/.test(whyFor({ rule: { pillar_key: 'heat_and_cold' } }, withCold)));
ok('and says nothing was logged when nothing was',
   /no heat and no cold/.test(whyFor({ rule: { pillar_key: 'heat_and_cold' } }, withNeither)));

// ------------------------------------------------------- what the coach is told

ok('the coach rules state the five minute ceiling', /5 minutes/.test(HEATCOLD_RULES));
ok('the coach rules state the 7 C floor', /7 C/.test(HEATCOLD_RULES));
ok('the coach rules state the six hour rule', /6 hours after strength/.test(HEATCOLD_RULES));
ok('the coach rules name the pillar as a pillar', /one of the seven pillars/.test(HEATCOLD_RULES));
ok('the coach rules carry both evidence labels',
   /We are confident/.test(HEATCOLD_RULES) && /Early evidence/.test(HEATCOLD_RULES));
ok('the coach rules say observational evidence cannot show cause',
   /cannot show cause/.test(HEATCOLD_RULES));
ok('the coach rules outrank a stale passage',
   /outrank/.test(HEATCOLD_RULES) && /out of date/.test(HEATCOLD_RULES));
ok('no em dash reaches the coach rules', !/—/.test(HEATCOLD_RULES));
ok('no em dash in the sauna or cold conditions',
   ![...SAUNA_CONDITIONS, ...COLD_CONDITIONS].some((c) => /—/.test(c)));

ok('a plunge question pulls the rules in', mentionsHeatOrCold('how long should my plunge be?'));
ok('a sauna passage pulls the rules in even on an unrelated question',
   mentionsHeatOrCold('what about recovery', [{ passage: 'The sauna raises heat shock proteins.' }]));
ok('a question about food does not', mentionsHeatOrCold('what should I eat for breakfast') === false);

// -------------------------------------------------------------- seeded defects
//
// Each of these is the exact shape of a bug that was live before the ruling. A
// check that cannot fail is not evidence.
const SEED = process.argv.includes('--seed');
if (SEED) {
  console.log('\n  --seed: these four must FAIL, and each is a bug that was real');
  ok('SEEDED the old ten minute cap', HARD_CAPS.cold_min === 10);
  ok('SEEDED the old four hour wait', COLD_AFTER_STRENGTH_HOURS === 4);
  ok('SEEDED a temperature being scaled', applyMultiplier('cold_temp_c', 10, 1.2).value === 12);
  ok('SEEDED water at 38F, which is 3.3 C', capCold({ minutes: 3, celsius: 3.3 }).celsius === 3.3);
}

console.log(bad ? `\n  ${bad} failing` : '\n  all heat and cold fixtures pass');
process.exit(SEED ? 0 : (bad ? 1 : 0));
