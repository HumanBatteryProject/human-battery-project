// The day 90 comparison, as arithmetic. Master prompt D8.
//
// D8 names six comparisons and the summary made two of them. The other four are
// here, pure, so the part that decides whether a person got better or worse can
// be tested without a database and without the model.
//
// THE MOST DANGEROUS LINE IN THIS FILE is the one that decides what counts as
// improvement. lab_markers.better_direction is 1 when a rise is good, -1 when a
// fall is good, and 0 for the eight markers where neither is. Getting the sign
// backwards does not produce an error. It produces a confident sentence telling
// somebody their inflammation improved while it climbed. So direction is never
// inferred from the number: a marker with no stated direction is reported as
// changed and explicitly not judged.
//
// Everything here refuses to speak when it has no data. A zero and an absence
// look identical once they reach a sentence, and this program sells the day 0 to
// day 90 comparison, so an absent baseline has to say so rather than average to
// nothing.

// How many logged days at each end make up a window. Two weeks, because a single
// day is a mood and the program is ninety days long.
export const WINDOW_DAYS = 14;

// A dimension whose markers are thinner at day 90 than at day 0 has not been
// measured better, it has been measured less, and the change is not comparable.
export const COVERAGE_TOLERANCE = 0;

// Number(null) is 0. So is Number(''). Both are finite, so a plain
// Number.isFinite check treats a result that never arrived as a measured zero,
// and on a marker where lower is better an absent day 90 reads as a spectacular
// improvement. Every numeric gate in this file goes through here.
export function measured(v) {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'boolean') return false;
  const n = Number(v);
  return Number.isFinite(n);
}

function nums(xs) {
  return (xs || []).filter(measured).map(Number);
}

function mean(xs) {
  const v = nums(xs);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function round1(n) {
  return n == null ? null : Math.round(n * 10) / 10;
}

function absent(what) {
  return { available: false, statement: what };
}

// ---------------------------------------------------------------------
// 1. Symptoms and function
// ---------------------------------------------------------------------
// daily_logs.symptoms is an array per day, so the comparison is which symptoms
// were reported in the first two weeks of logging against the last two, plus
// logged energy. Counting days a symptom appears, not occurrences, because a
// symptom logged twice on one day is still one bad day.
export function symptomsAndFunction(logs) {
  const withDates = (logs || []).filter((l) => l.log_date).slice();
  if (withDates.length < 2) {
    return absent('Not enough logged days to compare the start with the end.');
  }
  withDates.sort((a, b) => String(a.log_date).localeCompare(String(b.log_date)));

  const start = withDates.slice(0, WINDOW_DAYS);
  const end = withDates.slice(-WINDOW_DAYS);

  // Overlapping windows would compare a period with itself. Say so rather than
  // reporting a change of zero, which reads as stability.
  const overlapping = withDates.length < WINDOW_DAYS * 2;

  const tally = (rows) => {
    const days = {};
    for (const r of rows) {
      for (const s of (Array.isArray(r.symptoms) ? r.symptoms : [])) {
        const k = String(s).trim().toLowerCase();
        if (k) days[k] = (days[k] || 0) + 1;
      }
    }
    return days;
  };

  const a = tally(start);
  const b = tally(end);
  const all = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

  const symptoms = all.map((k) => ({
    symptom: k,
    days_at_start: a[k] || 0,
    days_at_end: b[k] || 0,
    of_start_days: start.length,
    of_end_days: end.length,
  }));

  const energyStart = mean(start.map((r) => r.energy));
  const energyEnd = mean(end.map((r) => r.energy));

  return {
    available: true,
    overlapping_windows: overlapping,
    window_days: WINDOW_DAYS,
    start_days: start.length,
    end_days: end.length,
    symptoms,
    resolved: symptoms.filter((s) => s.days_at_start > 0 && s.days_at_end === 0)
      .map((s) => s.symptom),
    appeared: symptoms.filter((s) => s.days_at_start === 0 && s.days_at_end > 0)
      .map((s) => s.symptom),
    energy: energyStart == null || energyEnd == null
      ? { available: false, statement: 'Energy was not logged at both ends.' }
      : { start: round1(energyStart), end: round1(energyEnd),
          change: round1(energyEnd - energyStart) },
  };
}

// ---------------------------------------------------------------------
// 2. Fitness measures
// ---------------------------------------------------------------------
// Every one of these rises when it improves except resting lactate, so the
// direction is stated per field rather than assumed across the row.
export const FITNESS_FIELDS = [
  { key: 'vo2max', label: 'VO2 max', unit: 'ml/kg/min', better: 1 },
  { key: 'mets', label: 'METs', unit: 'METs', better: 1 },
  { key: 'hr_recovery_60s', label: 'Heart rate recovery at 60 seconds', unit: 'bpm', better: 1 },
  { key: 'lactate_rest_mmol', label: 'Resting lactate', unit: 'mmol/L', better: -1 },
  { key: 'fixed_load_watts', label: 'Power at fixed load', unit: 'W', better: 1 },
];

export function fitnessMeasures(tests) {
  const at = (point) => (tests || []).filter((t) => t.draw_point === point)
    .sort((x, y) => String(y.tested_on || '').localeCompare(String(x.tested_on || '')))[0] || null;
  const base = at('day_0');
  const follow = at('day_90');

  if (!base && !follow) {
    return absent('No fitness test was recorded at either end.');
  }
  if (!base || !follow) {
    return {
      available: false,
      statement: base
        ? 'A day 0 fitness test exists and a day 90 one does not, so there is nothing to compare it with.'
        : 'A day 90 fitness test exists and a day 0 one does not, so there is no baseline to compare it with.',
      have: base ? 'day_0' : 'day_90',
    };
  }

  const measures = [];
  for (const f of FITNESS_FIELDS) {
    if (!measured(base[f.key]) || !measured(follow[f.key])) continue;
    const b = Number(base[f.key]);
    const a = Number(follow[f.key]);
    const delta = a - b;
    measures.push({
      key: f.key, label: f.label, unit: f.unit,
      day0: b, day90: a, change: round1(delta),
      direction: delta === 0 ? 'unchanged' : (delta * f.better > 0 ? 'better' : 'worse'),
    });
  }

  if (!measures.length) {
    return absent('Fitness tests exist at both ends but share no measure in common.');
  }
  return {
    available: true,
    tested_on: { day0: base.tested_on || null, day90: follow.tested_on || null },
    method: { day0: base.method || null, day90: follow.method || null },
    measures,
  };
}

// ---------------------------------------------------------------------
// 3. Laboratory results
// ---------------------------------------------------------------------
/**
 * @param {{slug:string,name:string,unit:string,better_direction:number,role:string,
 *          day0:number|null,day90:number|null}[]} markers
 */
export function laboratoryResults(markers) {
  const rows = (markers || []).filter((m) => measured(m.day0) && measured(m.day90));
  const oneEnd = (markers || []).filter((m) => measured(m.day0) !== measured(m.day90));

  if (!rows.length) {
    return {
      available: false,
      statement: oneEnd.length
        ? `${oneEnd.length} marker(s) were measured at one end only, so none can be compared.`
        : 'No laboratory marker was measured at both ends.',
      one_end_only: oneEnd.map((m) => m.slug),
    };
  }

  const compared = rows.map((m) => {
    const d0 = Number(m.day0), d90 = Number(m.day90);
    const delta = d90 - d0;
    const dir = Number(m.better_direction);
    // A marker with no stated better direction is reported and NOT judged.
    // Eight of the thirty-three are like this, and calling a change in one of
    // them an improvement would be inventing a clinical opinion.
    const judged = dir === 1 || dir === -1;
    return {
      slug: m.slug, name: m.name || m.slug, unit: m.unit || null, role: m.role || null,
      day0: d0, day90: d90, change: round1(delta),
      pct_change: d0 === 0 ? null : round1((delta / Math.abs(d0)) * 100),
      direction: !judged ? 'not judged'
        : delta === 0 ? 'unchanged'
        : (delta * dir > 0 ? 'better' : 'worse'),
      judged,
    };
  });

  return {
    available: true,
    compared,
    improved: compared.filter((m) => m.direction === 'better').map((m) => m.slug),
    worsened: compared.filter((m) => m.direction === 'worse').map((m) => m.slug),
    unjudged: compared.filter((m) => !m.judged).map((m) => m.slug),
    one_end_only: oneEnd.map((m) => m.slug),
  };
}

// ---------------------------------------------------------------------
// 4. Habits and consistency
// ---------------------------------------------------------------------
// Consistency is the point, so this reports how OFTEN they logged as well as how
// well they scored. Ninety percent adherence across nine logged days is not
// ninety percent adherence.
export function habitsAndConsistency(logs, programDays = 90) {
  const rows = (logs || []).filter((l) => l.log_date);
  if (!rows.length) return absent('Nothing was logged, so there is no record of habits.');

  const adherence = mean(rows.map((r) => r.adherence_pct));
  const five = mean(rows.map((r) => r.daily_five_score));

  rows.sort((a, b) => String(a.log_date).localeCompare(String(b.log_date)));
  const first = rows.slice(0, WINDOW_DAYS);
  const last = rows.slice(-WINDOW_DAYS);

  // Longest run of consecutive calendar days logged.
  let longest = 1, run = 1;
  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].log_date + 'T12:00:00Z');
    const cur = new Date(rows[i].log_date + 'T12:00:00Z');
    const gap = Math.round((cur - prev) / 86400000);
    run = gap === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  return {
    available: true,
    days_logged: rows.length,
    of_program_days: programDays,
    logged_pct: Math.round((rows.length / programDays) * 100),
    longest_streak_days: longest,
    adherence_pct: adherence == null ? null : Math.round(adherence),
    daily_five_avg: round1(five),
    adherence_start: (() => { const m = mean(first.map((r) => r.adherence_pct)); return m == null ? null : Math.round(m); })(),
    adherence_end: (() => { const m = mean(last.map((r) => r.adherence_pct)); return m == null ? null : Math.round(m); })(),
  };
}

// ---------------------------------------------------------------------
// 5. Remaining uncertainties
// ---------------------------------------------------------------------
// The honest part. What this ninety days did NOT establish. Three sources, and
// the third is permanent: charge, redox and leak have no whole-person clinical
// measurement, so they are uncertain by construction rather than by omission,
// and saying so is the difference between a limit and a gap.
export function remainingUncertainties({ dimensions, labs, fitness, habits, frontier, held }) {
  const items = [];

  for (const [name, d] of Object.entries(dimensions || {})) {
    if (!measured(d.day0)) {
      items.push({ kind: 'no baseline', subject: name,
        statement: `${name} has a day 90 score and no day 0 score, so its change is unknown.` });
      continue;
    }
    if (!measured(d.markers_present) || !measured(d.markers_expected)) continue;
    const present = Number(d.markers_present), expected = Number(d.markers_expected);
    if (expected - present > COVERAGE_TOLERANCE) {
      items.push({ kind: 'thin coverage', subject: name,
        statement: `${name} rests on ${present} of ${expected} markers, so its score is less certain than a full one.` });
    }
  }

  if (labs && labs.available === false) {
    items.push({ kind: 'no lab comparison', subject: 'laboratory results', statement: labs.statement });
  } else if (labs && labs.one_end_only && labs.one_end_only.length) {
    items.push({ kind: 'measured once', subject: 'laboratory results',
      statement: `${labs.one_end_only.length} marker(s) were measured at one end only and cannot be compared.` });
  }
  if (labs && labs.unjudged && labs.unjudged.length) {
    items.push({ kind: 'no better direction', subject: 'laboratory results',
      statement: `${labs.unjudged.length} marker(s) changed but have no established better direction, so the change is reported and not judged.` });
  }

  if (fitness && fitness.available === false) {
    items.push({ kind: 'no fitness comparison', subject: 'fitness measures', statement: fitness.statement });
  }

  if (habits && habits.available && habits.logged_pct < 50) {
    items.push({ kind: 'sparse logging', subject: 'habits',
      statement: `Days were logged on ${habits.logged_pct} percent of the program, so the habit record is partial.` });
  }

  for (const f of (frontier || [])) {
    items.push({ kind: 'not measurable today', subject: f.dimension || f,
      statement: f.body || `${f.dimension || f} has no validated whole-person measurement, so this program does not score it.` });
  }

  if (Number(held) > 0) {
    items.push({ kind: 'unresolved result', subject: 'laboratory results',
      statement: `${held} uploaded result(s) could not be matched to a marker and are waiting on review.` });
  }

  return { available: true, count: items.length, items };
}

// ---------------------------------------------------------------------
// 6. Suggested maintenance priorities
// ---------------------------------------------------------------------
// Derived from what the stored numbers already say, and capped, because a list
// of nine priorities is not a list of priorities. Nothing new is introduced:
// every priority points at a dimension, a marker or a habit that the comparison
// above already reported on.
export const MAX_PRIORITIES = 3;

// Ordering is a BAND first and a magnitude only inside the band.
//
// The first version added the magnitude to the band number, which looks like the
// same thing and is not: a marker that tripled scored 50 + 300 and outranked a
// dimension that fell, whose band started at 100. Percent and points are
// different scales, and adding either to a band lets the magnitude decide which
// KIND of thing matters most. The band is a judgement and belongs in one place.
//
// A falling dimension leads because a dimension is composed of markers, so it is
// the broader statement; the specific marker that moved follows it as the detail.
const BANDS = {
  'dimension fell': 4,
  'marker moved the wrong way': 3,
  'adherence fell over the program': 2,
  'hold what improved': 1,
};

export function maintenancePriorities({ dimensions, labs, habits }) {
  const candidates = [];

  // A dimension that fell is the first thing to hold.
  for (const [name, d] of Object.entries(dimensions || {})) {
    if (d.change != null && d.change < 0) {
      candidates.push({ magnitude: Math.abs(d.change), subject: name, basis: 'dimension fell',
        statement: `${name} fell ${Math.abs(d.change)} points over the program.` });
    }
  }

  // A marker that moved the wrong way, worst first.
  for (const m of ((labs && labs.compared) || [])) {
    if (m.direction === 'worse') {
      candidates.push({ magnitude: Math.abs(Number(m.pct_change) || 0), subject: m.slug,
        basis: 'marker moved the wrong way',
        statement: `${m.name} moved from ${m.day0} to ${m.day90}${m.unit ? ' ' + m.unit : ''}, which is the wrong direction.` });
    }
  }

  // Consistency that fell away at the end is the habit most likely to lapse.
  if (habits && habits.available
      && habits.adherence_start != null && habits.adherence_end != null
      && habits.adherence_end < habits.adherence_start) {
    candidates.push({ magnitude: habits.adherence_start - habits.adherence_end, subject: 'consistency',
      basis: 'adherence fell over the program',
      statement: `Adherence was ${habits.adherence_start} percent at the start and ${habits.adherence_end} percent at the end.` });
  }

  // A dimension that rose is worth keeping, and is the fallback when nothing
  // went wrong, because "nothing to do" is not a maintenance plan.
  if (!candidates.length) {
    const rose = Object.entries(dimensions || {})
      .filter(([, d]) => d.change != null && d.change > 0)
      .sort((a, b) => b[1].change - a[1].change);
    for (const [name, d] of rose) {
      candidates.push({ magnitude: d.change, subject: name, basis: 'hold what improved',
        statement: `${name} rose ${d.change} points. Holding it is the priority.` });
    }
  }

  if (!candidates.length) {
    return absent('There is not enough movement in the stored numbers to name a priority.');
  }

  candidates.sort((a, b) =>
    (BANDS[b.basis] || 0) - (BANDS[a.basis] || 0) || b.magnitude - a.magnitude);
  return {
    available: true,
    priorities: candidates.slice(0, MAX_PRIORITIES).map(({ magnitude, ...rest }) => rest),
    considered: candidates.length,
  };
}

// ---------------------------------------------------------------------
// What the model is given
// ---------------------------------------------------------------------
/**
 * The six comparisons, compacted to the facts a short summary needs.
 *
 * WHY THIS EXISTS. The first version handed the model all six objects whole,
 * which came to 14,341 input tokens for a summary of a few hundred words. The
 * reply then spent its entire max_tokens on thinking and came back with no text
 * at all, twice, at 500 and again at 2,000. Raising the budget further is a losing
 * game: the thinking expands to fill whatever it is given.
 *
 * The objects carry things a narrative has no use for. Percentage changes when the
 * before and after are both stated. Per-symptom day counts across two windows.
 * Units repeated on every row. Every marker's role. All of it real, none of it
 * needed to write two paragraphs, and every extra field is one more thing for a
 * sentence to be built out of wrongly.
 *
 * So the model gets the headline of each comparison and the names attached to it.
 * The full objects are still stored, so nothing is lost: the summary row keeps
 * everything and the model reads a briefing.
 */
export function narrativeFacts({ dimensions, symptoms, fitness, labs, habits, uncertainties, priorities }) {
  const out = {};

  out.dimension_scores = Object.fromEntries(
    Object.entries(dimensions || {}).map(([k, d]) => [k,
      d.day0 == null ? 'no day 0 score, so the change is unknown'
                     : { day0: d.day0, day90: d.day90, change: d.change }]));

  out.symptoms_and_function = symptoms && symptoms.available
    ? {
        resolved: symptoms.resolved,
        appeared: symptoms.appeared,
        still_present: (symptoms.symptoms || [])
          .filter((s) => s.days_at_start > 0 && s.days_at_end > 0).map((s) => s.symptom),
        energy: symptoms.energy && symptoms.energy.available === false
          ? 'not logged at both ends'
          : { day0: symptoms.energy.start, day90: symptoms.energy.end },
      }
    : { available: false, why: symptoms ? symptoms.statement : 'not computed' };

  out.fitness_measures = fitness && fitness.available
    ? (fitness.measures || []).map((m) =>
        `${m.label}: ${m.day0} to ${m.day90} ${m.unit}, ${m.direction}`)
    : { available: false, why: fitness ? fitness.statement : 'not computed' };

  out.laboratory_results = labs && labs.available
    ? {
        improved: (labs.compared || []).filter((m) => m.direction === 'better')
          .map((m) => `${m.name}: ${m.day0} to ${m.day90}`),
        worsened: (labs.compared || []).filter((m) => m.direction === 'worse')
          .map((m) => `${m.name}: ${m.day0} to ${m.day90}`),
        changed_but_not_judged: (labs.compared || []).filter((m) => !m.judged)
          .map((m) => `${m.name}: ${m.day0} to ${m.day90}, no established better direction`),
        unchanged: (labs.compared || []).filter((m) => m.direction === 'unchanged').map((m) => m.name),
      }
    : { available: false, why: labs ? labs.statement : 'not computed' };

  out.habits_and_consistency = habits && habits.available
    ? {
        days_logged: habits.days_logged,
        of_program_days: habits.of_program_days,
        longest_streak_days: habits.longest_streak_days,
        adherence_pct_first_two_weeks: habits.adherence_start,
        adherence_pct_last_two_weeks: habits.adherence_end,
      }
    : { available: false, why: habits ? habits.statement : 'not computed' };

  // Already one sentence each, so they pass through as written.
  out.remaining_uncertainties = ((uncertainties && uncertainties.items) || []).map((i) => i.statement);
  out.maintenance_priorities = priorities && priorities.available
    ? priorities.priorities.map((p) => p.statement)
    : [];

  return out;
}
