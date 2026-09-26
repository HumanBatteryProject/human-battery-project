// The day 90 comparison. Master prompt D8.
//
// The test that matters most in this file is the sign of improvement. A marker
// where lower is better, moving lower, must read as BETTER, and the same number
// moving lower on a marker where higher is better must read as WORSE. Get that
// backwards and nothing errors: a member is congratulated on inflammation that
// climbed. So it is tested from both directions, and the eight markers with no
// established direction are tested for refusing to judge at all.

import {
  symptomsAndFunction, fitnessMeasures, laboratoryResults,
  habitsAndConsistency, remainingUncertainties, maintenancePriorities,
  measured, WINDOW_DAYS, MAX_PRIORITIES,
} from '../functions/api/_completion.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want),
     `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const day = (n) => {
  const d = new Date('2026-01-01T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// =====================================================================
console.log('\nLaboratory results: the direction of improvement');

const lowerIsBetter = { slug: 'hs-crp', name: 'hs-CRP', unit: 'mg/L', better_direction: -1, role: 'referable' };
const higherIsBetter = { slug: 'omega3-index', name: 'Omega-3 Index', unit: '%', better_direction: 1, role: 'scored' };
const noDirection = { slug: 'ferritin', name: 'Ferritin', unit: 'ng/mL', better_direction: 0, role: 'referable' };

{
  const r = laboratoryResults([{ ...lowerIsBetter, day0: 3.2, day90: 1.1 }]);
  eq('hs-CRP falling is BETTER', r.compared[0].direction, 'better');
  eq('and is listed as improved', r.improved, ['hs-crp']);
}
{
  const r = laboratoryResults([{ ...lowerIsBetter, day0: 1.1, day90: 3.2 }]);
  eq('hs-CRP rising is WORSE', r.compared[0].direction, 'worse');
  eq('and is listed as worsened', r.worsened, ['hs-crp']);
}
{
  const r = laboratoryResults([{ ...higherIsBetter, day0: 4.0, day90: 8.0 }]);
  eq('Omega-3 Index rising is BETTER', r.compared[0].direction, 'better');
}
{
  const r = laboratoryResults([{ ...higherIsBetter, day0: 8.0, day90: 4.0 }]);
  eq('Omega-3 Index falling is WORSE', r.compared[0].direction, 'worse');
}
{
  // The same arithmetic on two markers, opposite verdicts. This is the pair that
  // catches a sign error, because a single marker passes either way.
  const r = laboratoryResults([
    { ...lowerIsBetter, day0: 5, day90: 3 },
    { ...higherIsBetter, day0: 5, day90: 3 },
  ]);
  eq('the same fall is better for one and worse for the other',
     r.compared.map((m) => m.direction), ['better', 'worse']);
}
{
  const r = laboratoryResults([{ ...noDirection, day0: 40, day90: 120 }]);
  eq('a marker with no better direction is NOT judged', r.compared[0].direction, 'not judged');
  eq('and appears in neither improved nor worsened', [r.improved, r.worsened], [[], []]);
  eq('and is named as unjudged', r.unjudged, ['ferritin']);
}
{
  const r = laboratoryResults([{ ...lowerIsBetter, day0: 2.0, day90: 2.0 }]);
  eq('no change is unchanged, not better', r.compared[0].direction, 'unchanged');
}

console.log('\nAbsence is not a measurement');
// The bug this catches: Number(null) is 0 and Number('') is 0, both finite. The
// first version used Number.isFinite, so a result that never arrived was compared
// as a measured zero. On hs-CRP, where lower is better, that reported an absent
// day 90 as a fall from 3.2 to 0, which is the largest improvement possible.
eq('null is not a measurement', measured(null), false);
eq('undefined is not a measurement', measured(undefined), false);
eq('empty string is not a measurement', measured(''), false);
eq('a boolean is not a measurement', measured(true), false);
eq('zero IS a measurement', measured(0), true);
eq('a numeric string is a measurement', measured('1.8'), true);
eq('NaN is not a measurement', measured(NaN), false);
{
  const r = laboratoryResults([{ ...lowerIsBetter, day0: 3.2, day90: null }]);
  ok('an absent day 90 is NEVER reported as an improvement',
     !(r.improved || []).includes('hs-crp'), JSON.stringify(r.improved));
  eq('and the comparison is refused outright', r.available, false);
}
{
  const r = fitnessMeasures([
    { draw_point: 'day_0', vo2max: 34 },
    { draw_point: 'day_90', vo2max: null },
  ]);
  eq('an absent VO2 max is not a fall to zero', r.available, false);
}

console.log('\nLaboratory results: absence is never a zero');
{
  const r = laboratoryResults([{ ...lowerIsBetter, day0: 3.2, day90: null }]);
  eq('measured at one end only is not comparable', r.available, false);
  eq('and says which marker', r.one_end_only, ['hs-crp']);
}
eq('no markers at all reports unavailable', laboratoryResults([]).available, false);
eq('and does not claim a zero change',
   /No laboratory marker was measured at both ends/.test(laboratoryResults([]).statement), true);
{
  const r = laboratoryResults([{ ...lowerIsBetter, day0: 0, day90: 1.5 }]);
  eq('a zero baseline does not divide by zero', r.compared[0].pct_change, null);
}

// =====================================================================
console.log('\nFitness measures');
{
  const tests = [
    { draw_point: 'day_0', tested_on: day(0), method: 'field', vo2max: 34, hr_recovery_60s: 18, lactate_rest_mmol: 1.8 },
    { draw_point: 'day_90', tested_on: day(90), method: 'field', vo2max: 39, hr_recovery_60s: 24, lactate_rest_mmol: 1.2 },
  ];
  const r = fitnessMeasures(tests);
  eq('VO2 max rising is better', r.measures.find((m) => m.key === 'vo2max').direction, 'better');
  eq('heart rate recovery rising is better', r.measures.find((m) => m.key === 'hr_recovery_60s').direction, 'better');
  eq('resting lactate FALLING is better', r.measures.find((m) => m.key === 'lactate_rest_mmol').direction, 'better');
}
{
  const tests = [
    { draw_point: 'day_0', tested_on: day(0), vo2max: 34, lactate_rest_mmol: 1.2 },
    { draw_point: 'day_90', tested_on: day(90), vo2max: 30, lactate_rest_mmol: 1.8 },
  ];
  const r = fitnessMeasures(tests);
  eq('VO2 max falling is worse', r.measures.find((m) => m.key === 'vo2max').direction, 'worse');
  eq('resting lactate rising is worse', r.measures.find((m) => m.key === 'lactate_rest_mmol').direction, 'worse');
}
{
  const r = fitnessMeasures([{ draw_point: 'day_0', vo2max: 34 }]);
  eq('a baseline with no follow-up is not a comparison', r.available, false);
  eq('and says which end exists', r.have, 'day_0');
}
eq('no fitness tests at all is unavailable', fitnessMeasures([]).available, false);
{
  const r = fitnessMeasures([
    { draw_point: 'day_0', vo2max: 34 },
    { draw_point: 'day_90', hr_recovery_60s: 24 },
  ]);
  eq('tests at both ends sharing no measure is not a comparison', r.available, false);
}

// =====================================================================
console.log('\nSymptoms and function');
{
  const logs = [];
  for (let i = 0; i < 40; i++) {
    logs.push({ log_date: day(i), energy: 4, symptoms: ['afternoon crash', 'brain fog'] });
  }
  for (let i = 40; i < 80; i++) {
    logs.push({ log_date: day(i), energy: 7, symptoms: i % 4 === 0 ? ['brain fog'] : [] });
  }
  const r = symptomsAndFunction(logs);
  eq('a symptom present at the start and gone by the end is resolved',
     r.resolved, ['afternoon crash']);
  eq('energy is compared across the two windows', r.energy.change, 3);
  eq('windows do not overlap when there are enough days', r.overlapping_windows, false);
  const fog = r.symptoms.find((s) => s.symptom === 'brain fog');
  eq('a symptom that persists reports days at both ends',
     [fog.days_at_start > 0, fog.days_at_end > 0], [true, true]);
}
{
  const logs = [{ log_date: day(0), energy: 3, symptoms: ['x'] },
                { log_date: day(1), energy: 8, symptoms: [] }];
  const r = symptomsAndFunction(logs);
  eq('two logged days flags overlapping windows rather than reporting a trend',
     r.overlapping_windows, true);
}
eq('one logged day cannot be compared', symptomsAndFunction([{ log_date: day(0) }]).available, false);
{
  const logs = Array.from({ length: 30 }, (_, i) => ({ log_date: day(i), symptoms: [] }));
  const r = symptomsAndFunction(logs);
  eq('energy never logged says so rather than reporting zero', r.energy.available, false);
}

// =====================================================================
console.log('\nHabits and consistency');
{
  const logs = Array.from({ length: 9 }, (_, i) => ({ log_date: day(i), adherence_pct: 90, daily_five_score: 5 }));
  const r = habitsAndConsistency(logs, 90);
  eq('nine logged days is reported as nine', r.days_logged, 9);
  eq('and as ten percent of the program', r.logged_pct, 10);
  eq('adherence of 90 percent across nine days is still reported as 90', r.adherence_pct, 90);
  eq('the streak is the run of consecutive days', r.longest_streak_days, 9);
}
{
  const logs = [day(0), day(1), day(5), day(6), day(7), day(8)]
    .map((d) => ({ log_date: d, adherence_pct: 50 }));
  const r = habitsAndConsistency(logs, 90);
  eq('a gap breaks the streak', r.longest_streak_days, 4);
}
eq('nothing logged is unavailable, not zero percent', habitsAndConsistency([], 90).available, false);

// =====================================================================
console.log('\nRemaining uncertainties');
{
  const r = remainingUncertainties({
    dimensions: { flow: { day0: 50, day90: 60, change: 10, markers_present: 2, markers_expected: 4 } },
    labs: laboratoryResults([]), fitness: fitnessMeasures([]),
    habits: habitsAndConsistency([{ log_date: day(0), adherence_pct: 80 }], 90),
    frontier: [{ dimension: 'charge', body: 'No whole-person measurement exists.' }],
    held: 2,
  });
  const kinds = r.items.map((i) => i.kind);
  ok('thin marker coverage is named', kinds.includes('thin coverage'), JSON.stringify(kinds));
  ok('a missing lab comparison is named', kinds.includes('no lab comparison'));
  ok('a missing fitness comparison is named', kinds.includes('no fitness comparison'));
  ok('sparse logging is named', kinds.includes('sparse logging'));
  ok('a frontier dimension is named as not measurable today', kinds.includes('not measurable today'));
  ok('held results are named', kinds.includes('unresolved result'));
}
{
  const r = remainingUncertainties({
    dimensions: { timing: { day0: null, day90: 55, change: null, markers_present: 3, markers_expected: 3 } },
    labs: { available: true, compared: [], one_end_only: [], unjudged: [] },
    fitness: { available: true }, habits: { available: true, logged_pct: 90 },
    frontier: [], held: 0,
  });
  eq('a dimension with no baseline is named', r.items.map((i) => i.kind), ['no baseline']);
}

// =====================================================================
console.log('\nMaintenance priorities');
{
  const r = maintenancePriorities({
    dimensions: { flow: { change: -8 }, timing: { change: 3 } },
    labs: laboratoryResults([{ ...lowerIsBetter, day0: 1.0, day90: 4.0 }]),
    habits: { available: true, adherence_start: 85, adherence_end: 60 },
  });
  eq(`at most ${MAX_PRIORITIES} priorities`, r.priorities.length <= MAX_PRIORITIES, true);
  ok('a dimension that fell outranks a habit', r.priorities[0].subject === 'flow',
     JSON.stringify(r.priorities.map((p) => p.subject)));
  ok('the marker that moved the wrong way is a priority',
     r.priorities.some((p) => p.subject === 'hs-crp'));
}
{
  const r = maintenancePriorities({
    dimensions: { flow: { change: 12 }, timing: { change: 4 } },
    labs: { available: true, compared: [] },
    habits: { available: true, adherence_start: 70, adherence_end: 90 },
  });
  eq('when nothing went wrong, holding the biggest gain is the priority',
     r.priorities[0].subject, 'flow');
  eq('and the basis says so', r.priorities[0].basis, 'hold what improved');
}
{
  const r = maintenancePriorities({ dimensions: {}, labs: { available: false }, habits: { available: false } });
  eq('no movement names no priority rather than inventing one', r.available, false);
}

console.log(`\n${bad ? `FAILED: ${bad}` : 'day 90 comparison fixtures all pass'}`);
process.exit(bad ? 1 : 0);
