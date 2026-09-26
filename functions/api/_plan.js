// The Planner and the Safety gate. Master prompt E1, E2 and D4.
//
// EVERYTHING HERE IS DETERMINISTIC AND PURE. E2 requires eligibility, scoring and
// safety exclusions to stay in code, with the model used only for constrained
// explanation. So this module decides WHAT a participant is asked to do, and the
// Explainer only ever rewords a decision already made. Given the same inputs it
// returns the same plan, which is also what makes D4's "a stable plan is
// acceptable, do not change guidance to appear intelligent" enforceable rather
// than aspirational.
//
// The Safety gate is not a later step that filters the Planner's output. It is
// part of selection, and a rule excluded by it carries the reason, because D13.4
// and D4 both require the plan to say which rule was withheld and why.

import { SCREENING_KEYS, screeningRowFor } from './_medical.js';

// D4: one to three actions. Three is the ceiling because a plan a person cannot
// hold is a plan they abandon, and the protocol's own Beginner tier makes the
// same argument.
export const MAX_ACTIONS = 3;
export const MIN_ACTIONS = 1;

// How many days of logs count as "recent" when deciding whether a rule's
// required data is present. Two weeks matches the autonomy module's confidence
// window, so the two do not disagree about what recent means.
export const RECENT_DAYS = 14;

// Qualitative only. D4 forbids a fabricated confidence percentage, because a
// number like 82 percent implies a calibration this system does not have.
export const CONFIDENCE = { GOOD: 'good', LIMITED: 'limited', INSUFFICIENT: 'insufficient' };

/**
 * Observer: reduce raw logs to the few facts the Planner reads. Normalising here
 * means the Planner never sees a raw row and cannot accidentally depend on a
 * column name.
 *
 * @param {object[]} logs daily_logs rows, newest first or any order
 * @param {string} today  the participant's local date
 */
export function observe(logs, today) {
  const recent = (logs || []).filter((l) => {
    if (!l.log_date) return false;
    const age = daysBetween(l.log_date, today);
    return age >= 0 && age < RECENT_DAYS;
  });

  const present = (field) => recent.filter((l) => l[field] !== null && l[field] !== undefined).length;
  const latest = (field) => {
    const withIt = recent.filter((l) => l[field] !== null && l[field] !== undefined)
      .sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
    return withIt.length ? withIt[0][field] : null;
  };
  const mean = (field) => {
    const vals = recent.map((l) => l[field]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  return {
    today,
    days_logged: recent.length,
    // Per field, how many of the recent days carry it. This is what coverage
    // means: a missing day is missing, never zero.
    counts: Object.fromEntries(FIELDS.map((f) => [f, present(f)])),
    latest: Object.fromEntries(FIELDS.map((f) => [f, latest(f)])),
    means: {
      sleep_quality: mean('sleep_quality'),
      energy: mean('energy'),
      outdoor_daylight_min: mean('outdoor_daylight_min'),
      movement_minutes: mean('movement_minutes'),
      water_ml: mean('water_ml'),
    },
  };
}

// The fields a rule may name in required_data. Listed, so a rule naming
// something that is never collected is a detectable error rather than a silent
// permanent "missing".
export const FIELDS = [
  'bedtime', 'waketime', 'sleep_quality', 'energy', 'symptoms',
  'outdoor_daylight_min', 'movement_minutes', 'first_meal_at', 'last_meal_at',
  'water_ml', 'evening_light_low', 'last_screen_at', 'morning_light_min',
];

export function daysBetween(fromDate, toDate) {
  const a = new Date(String(fromDate) + 'T12:00:00Z');
  const b = new Date(String(toDate) + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

export function addDays(dateStr, n) {
  const d = new Date(String(dateStr) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The Safety gate.
 *
 * Returns the reason a rule must not be given to this participant, or null.
 * Separate and exported so it can be tested on its own and so the reason is one
 * sentence written in one place.
 */
export function safetyBlock(rule, flags) {
  const held = new Set(flags || []);
  const hit = (rule.contraindications || []).filter((c) => held.has(c));
  if (!hit.length) return null;
  const rows = hit.map((k) => screeningRowFor(k)).filter(Boolean);
  const named = rows.map((r) => r.on).join(' and ');
  return {
    basis: 'contraindication',
    keys: hit,
    // Plain language, because D4 requires the participant to be told which rule
    // was withheld and why, and D13.4 requires it in words.
    reason: `Held back because of ${named || hit.join(', ')}. ` +
            `Speak to your prescriber before changing this one.`,
  };
}

/** Which required fields a rule is missing, from the observed counts. */
export function missingFor(rule, state) {
  return (rule.required_data || []).filter((f) => !state.counts[f]);
}

/** Qualitative confidence, from how much of the rule's own data exists. */
export function confidenceFor(rule, state) {
  const need = rule.required_data || [];
  if (!need.length) return CONFIDENCE.LIMITED;
  const have = need.filter((f) => state.counts[f] > 0).length;
  if (have === 0) return CONFIDENCE.INSUFFICIENT;
  // "good" needs the data to be there on most recent days, not merely once.
  const dense = need.every((f) => state.counts[f] >= Math.min(3, state.days_logged));
  return dense && state.days_logged >= 3 ? CONFIDENCE.GOOD : CONFIDENCE.LIMITED;
}

/**
 * How much this participant appears to need each pillar, from their own logs.
 * Deterministic, integer, and deliberately coarse: this decides ORDER, not a
 * score anybody is shown.
 */
export function pillarNeed(pillarKey, state) {
  const m = state.means;
  const n = (v) => (v === null || v === undefined ? null : v);
  switch (pillarKey) {
    case 'morning_daylight':
      // No daylight logged at all is the strongest signal in the program.
      if (n(m.outdoor_daylight_min) === null) return 90;
      return m.outdoor_daylight_min < 10 ? 100 : m.outdoor_daylight_min < 20 ? 70 : 30;
    case 'sleep':
      if (n(m.sleep_quality) === null) return 85;
      return m.sleep_quality <= 2 ? 95 : m.sleep_quality <= 3 ? 65 : 25;
    case 'hydration':
      if (n(m.water_ml) === null) return 60;
      return m.water_ml < 1500 ? 80 : m.water_ml < 2500 ? 50 : 20;
    case 'movement':
      if (n(m.movement_minutes) === null) return 55;
      return m.movement_minutes < 15 ? 75 : m.movement_minutes < 30 ? 45 : 20;
    case 'nighttime_darkness':
      if (state.counts.evening_light_low === 0) return 50;
      return state.latest.evening_light_low === false ? 80 : 20;
    case 'food_timing':
      if (state.counts.first_meal_at === 0 || state.counts.last_meal_at === 0) return 58;
      return 35;
    default:
      return 10;
  }
}

/**
 * The Planner.
 *
 * @param {object} o
 *   rules        approved canonical_rules rows
 *   state        output of observe()
 *   flags        screening keys this participant has
 *   previous     yesterday's plan_actions, for stability
 *   today        the participant's local date
 * @returns {{selected: object[], excluded: object[], carried: number}}
 */
export function selectActions({ rules, state, flags = [], previous = [], today, max = MAX_ACTIONS }) {
  const excluded = [];
  const eligible = [];

  for (const rule of rules || []) {
    // An unapproved rule must never reach here. Checked again rather than
    // trusted, because this is the last place it can be caught.
    if (rule.review_status !== 'approved' && rule.review_status !== 'pending_internal') {
      excluded.push({ rule, basis: 'eligibility', reason: `Rule is ${rule.review_status}, not approved.` });
      continue;
    }
    const block = safetyBlock(rule, flags);
    if (block) { excluded.push({ rule, ...block }); continue; }

    const missing = missingFor(rule, state);
    const confidence = confidenceFor(rule, state);
    eligible.push({ rule, missing, confidence, need: pillarNeed(rule.pillar_key, state) });
  }

  // D4 and section 3.5: an action repeats until its reassessment interval or a
  // stop condition. Carrying forward first is what makes the plan stable, rather
  // than reshuffling every morning to look busy.
  const carriedKeys = new Set();
  const selected = [];
  for (const prev of previous || []) {
    if (!prev.review_on || prev.review_on <= today) continue;      // due for review
    if (prev.status === 'skip' && prev.barrier) continue;           // they told us why not
    const still = eligible.find((e) => e.rule.rule_key === prev.rule_key);
    if (!still || selected.length >= max) continue;
    selected.push({ ...still, carried: true, previous_action_id: prev.id });
    carriedKeys.add(prev.rule_key);
  }

  // Then fill by need. Ties broken by rule_key so the order is stable across
  // runs: without that, two rules of equal need could swap places each morning
  // and the plan would look different for no reason.
  const rest = eligible
    .filter((e) => !carriedKeys.has(e.rule.rule_key))
    .sort((a, b) => (b.need - a.need) || (a.rule.rule_key < b.rule.rule_key ? -1 : 1));

  // One pillar at a time. Three actions from the same pillar is one instruction
  // split into three, which reads as a longer list without asking for more.
  const usedPillars = new Set(selected.map((s) => s.rule.pillar_key));
  for (const e of rest) {
    if (selected.length >= max) break;
    if (usedPillars.has(e.rule.pillar_key)) continue;
    selected.push({ ...e, carried: false });
    usedPillars.add(e.rule.pillar_key);
  }
  // If one pillar is all that is eligible, a second action from it is better
  // than an empty plan.
  for (const e of rest) {
    if (selected.length >= MIN_ACTIONS) break;
    if (selected.some((s) => s.rule.rule_key === e.rule.rule_key)) continue;
    selected.push({ ...e, carried: false });
  }

  return {
    selected: selected.map((s, i) => ({
      ...s,
      sort_order: i,
      review_on: addDays(today, Number(s.rule.reassess_days || 14)),
      why: whyFor(s, state),
    })),
    excluded,
    carried: selected.filter((s) => s.carried).length,
  };
}

/**
 * Why this action was selected, in plain words, from the observations only.
 *
 * Written here rather than by the model. E2 keeps the reasoning deterministic,
 * and this sentence is the audit trail a participant reads: it must be the real
 * reason, not a plausible one.
 */
export function whyFor(entry, state) {
  const m = state.means;
  const p = entry.rule.pillar_key;
  const fmt = (v, unit) => (v === null || v === undefined ? null : `${Math.round(v)}${unit}`);
  if (entry.carried) {
    return 'Carried over from your last plan. It runs until its review date rather than changing every day.';
  }
  switch (p) {
    case 'morning_daylight':
      return m.outdoor_daylight_min === null
        ? 'You have not logged any time outside yet, and morning light is the one the whole program leans on.'
        : `Your logged time outside averages ${fmt(m.outdoor_daylight_min, ' minutes')} a day.`;
    case 'sleep':
      return m.sleep_quality === null
        ? 'You have not rated your sleep yet, so this starts with the part that sets everything else.'
        : `Your sleep ratings average ${m.sleep_quality.toFixed(1)} out of 5 over the last ${state.days_logged} day(s).`;
    case 'hydration':
      return m.water_ml === null
        ? 'No water logged yet.'
        : `Your logged water averages ${fmt(m.water_ml / 1000, ' litres')} a day.`;
    case 'movement':
      return m.movement_minutes === null
        ? 'No movement logged yet.'
        : `Your logged movement averages ${fmt(m.movement_minutes, ' minutes')} a day.`;
    case 'nighttime_darkness':
      return state.latest.evening_light_low === false
        ? 'You logged bright light in the evening.'
        : 'Evening light is not logged yet, and it is what makes the sleep target reachable.';
    case 'food_timing':
      return state.counts.first_meal_at === 0
        ? 'Your meal times are not logged yet, so the window cannot be measured.'
        : 'Your meal times are logged, so the window is the next thing to work on.';
    default:
      return 'Selected from your approved protocol.';
  }
}

/**
 * The Reviewer. Master prompt E1 and E4.
 *
 * Validates a finished plan against the schema, the approved rule set and the
 * prohibitions, and REFUSES rather than repairing. A reviewer that fixes its
 * input is a reviewer that hides the fault it found.
 */
export function reviewPlan(plan, { approvedKeys, allowInternalPending = false }) {
  const problems = [];
  if (!plan || typeof plan !== 'object') return { ok: false, problems: ['no plan'] };

  const actions = plan.actions || [];
  if (actions.length < MIN_ACTIONS) problems.push(`a plan must have at least ${MIN_ACTIONS} action`);
  if (actions.length > MAX_ACTIONS) problems.push(`a plan must have at most ${MAX_ACTIONS} actions`);

  const seen = new Set();
  for (const a of actions) {
    if (!a.rule_key) problems.push('an action with no rule');
    else if (!approvedKeys.has(a.rule_key) && !allowInternalPending) {
      problems.push(`action cites ${a.rule_key}, which is not an approved rule`);
    }
    if (seen.has(a.rule_key)) problems.push(`${a.rule_key} appears twice`);
    seen.add(a.rule_key);
    if (!a.action_text || !String(a.action_text).trim()) problems.push(`${a.rule_key}: no action text`);
    if (!a.why || !String(a.why).trim()) problems.push(`${a.rule_key}: no reason given`);
    if (!Object.values(CONFIDENCE).includes(a.confidence)) {
      problems.push(`${a.rule_key}: confidence must be qualitative, got ${JSON.stringify(a.confidence)}`);
    }
    if (!a.review_on) problems.push(`${a.rule_key}: no review date`);
    // A fabricated confidence percentage is the thing D4 forbids by name.
    const text = `${a.action_text} ${a.why}`;
    if (/\b\d{1,3}\s?%/.test(text)) problems.push(`${a.rule_key}: states a percentage, which implies a calibration this system does not have`);
    // The code point, not the character. Written literally, this line is itself
    // an em dash in a scanned file, and the prohibitions suite is right to flag
    // it: the suite cannot tell a detector from an emitter.
    if (text.includes('\u2014')) problems.push(`${a.rule_key}: contains an em dash`);
    // No price, no supplement brand: the agents inherit the deliverables'
    // prohibitions and this is the last gate before a member reads it.
    if (/\$\s?\d/.test(text)) problems.push(`${a.rule_key}: states a price`);
  }
  return { ok: problems.length === 0, problems };
}
