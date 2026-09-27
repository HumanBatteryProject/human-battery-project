/**
 * The Heat and cold pillar's fixed rules.
 *
 * The owner's pillar ruling states five rules that do not vary by tier, by
 * multiplier or by adaptation. Four of them are timing or ceiling rules that a
 * plan can violate silently, so they are enforced here rather than only stated
 * in a document:
 *
 *   1. Cold is never within 6 hours after strength training.
 *   2. Sauna finishes 1 to 2 hours before bed.
 *   3. No single plunge over 5 minutes, and no water colder than 7 C, at every
 *      tier, including after the pro 20 percent per cycle increase.
 *   4. No alcohol before or during sauna.
 *   5. Mineral water after.
 *
 * Every function here is pure and takes what it needs, so the fixtures can
 * drive it without a database. A gate that needs a live database is a gate that
 * gets skipped.
 */

// The hard ceilings. Not per tier, and not adjustable: the ruling puts them
// above the tier bands and above the pro cycle increase, which is the whole
// reason they are constants in code as well as bounds in protocol_parameters.
export const HARD_CEILING_MINUTES = 5;
export const HARD_FLOOR_CELSIUS = 7;

// The gap the ruling requires between strength training and cold.
export const COLD_AFTER_STRENGTH_HOURS = 6;

// The window in which a sauna must finish before bed.
export const SAUNA_BEFORE_BED_HOURS = [1, 2];

/** Minutes between two timestamps, or null when either is absent or unparseable. */
export function hoursBetween(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / 3600000;
}

/**
 * Cap a cold dose against the hard ceiling and floor.
 *
 * Returns what the participant may actually be told, and says whether it was
 * capped and why. Never throws: a plan that cannot be capped is a plan that
 * gets dropped, and dropping the cold action silently is worse than lowering it.
 */
export function capCold({ minutes, celsius }) {
  const notes = [];
  let min = minutes;
  let c = celsius;

  if (min !== null && min !== undefined && Number.isFinite(Number(min))) {
    min = Number(min);
    if (min > HARD_CEILING_MINUTES) {
      notes.push(`capped from ${min} to ${HARD_CEILING_MINUTES} minutes: no single plunge over ${HARD_CEILING_MINUTES} minutes at any tier`);
      min = HARD_CEILING_MINUTES;
    }
  } else {
    min = null;
  }

  if (c !== null && c !== undefined && Number.isFinite(Number(c))) {
    c = Number(c);
    if (c < HARD_FLOOR_CELSIUS) {
      notes.push(`raised from ${c} to ${HARD_FLOOR_CELSIUS} C: no water colder than ${HARD_FLOOR_CELSIUS} C at any tier`);
      c = HARD_FLOOR_CELSIUS;
    }
  } else {
    c = null;
  }

  return { minutes: min, celsius: c, capped: notes.length > 0, notes };
}

/**
 * Apply a cycle multiplier to a cold dose, then cap.
 *
 * The pro 20 percent per cycle increase is the named case the ruling calls out,
 * because a multiplier applied to a dose already at the tier ceiling is exactly
 * how a 5 minute rule becomes a 6 minute plunge.
 */
export function coldWithMultiplier({ minutes, celsius, multiplier = 1 }) {
  const m = Number.isFinite(Number(multiplier)) ? Number(multiplier) : 1;
  const raw = minutes === null || minutes === undefined ? null : Number(minutes) * m;
  return capCold({ minutes: raw, celsius });
}

/**
 * May a cold action be placed at this time, given when strength training was?
 *
 * `coldAt` and `strengthAt` are timestamps. Absent training is not a violation:
 * a missing log is missing, never a proof that no lifting happened, so this
 * returns ok with the reason stated rather than blocking on absence.
 */
export function coldTimingOk({ coldAt, strengthAt }) {
  const gap = hoursBetween(strengthAt, coldAt);
  if (gap === null) {
    return { ok: true, unknown: true,
      reason: 'No strength training logged near this cold session, so the six hour rule cannot be checked. Told to the participant, never assumed clear.' };
  }
  if (gap < 0) {
    return { ok: true, unknown: false,
      reason: `Cold is ${Math.abs(gap).toFixed(1)} hour(s) BEFORE the lift. The rule is about cold after strength training, so this is allowed.` };
  }
  if (gap < COLD_AFTER_STRENGTH_HOURS) {
    return { ok: false, unknown: false,
      reason: `Cold is ${gap.toFixed(1)} hour(s) after strength training, inside the ${COLD_AFTER_STRENGTH_HOURS} hour rule.` };
  }
  return { ok: true, unknown: false,
    reason: `Cold is ${gap.toFixed(1)} hour(s) after strength training, outside the ${COLD_AFTER_STRENGTH_HOURS} hour rule.` };
}

/**
 * Does a sauna finish 1 to 2 hours before bed?
 *
 * Both ends matter. Finishing too late is the sleep problem the rule exists to
 * prevent; finishing far too early is not a safety failure, so it is reported
 * as outside the window rather than as a violation.
 */
export function saunaTimingOk({ saunaEndAt, bedtimeAt }) {
  const gap = hoursBetween(saunaEndAt, bedtimeAt);
  const [lo, hi] = SAUNA_BEFORE_BED_HOURS;
  if (gap === null) {
    return { ok: true, unknown: true,
      reason: 'No bedtime logged for this day, so the pre-bed window cannot be checked.' };
  }
  if (gap < lo) {
    return { ok: false, unknown: false,
      reason: `The sauna finishes ${gap.toFixed(1)} hour(s) before bed. It has to finish ${lo} to ${hi} hours before.` };
  }
  if (gap > hi) {
    return { ok: true, unknown: false, early: true,
      reason: `The sauna finishes ${gap.toFixed(1)} hour(s) before bed, earlier than the ${lo} to ${hi} hour window. Not unsafe, and not the target.` };
  }
  return { ok: true, unknown: false,
    reason: `The sauna finishes ${gap.toFixed(1)} hour(s) before bed, inside the ${lo} to ${hi} hour window.` };
}

// The two rules that are prohibitions rather than measurements. They cannot be
// computed from a log, so they travel with every heat and cold action as text.
export const SAUNA_CONDITIONS = [
  'No alcohol before or during the sauna.',
  'Mineral water after.',
];

export const COLD_CONDITIONS = [
  'Never put your head under, and never hold your breath.',
  'Never plunge alone in open water.',
];

// Screening keys that reduce the heat dose rather than removing it. The ruling
// names one: a man trying to conceive.
export const REDUCED_HEAT_DOSE_FLAGS = ['trying_to_conceive_male'];

/** The fraction of the tier heat dose a flagged participant is given. */
export const REDUCED_HEAT_DOSE_FRACTION = 0.5;

export function heatDoseFor({ minutes, flags = [] }) {
  const hit = REDUCED_HEAT_DOSE_FLAGS.filter((f) => flags.includes(f));
  if (!hit.length || minutes === null || minutes === undefined) {
    return { minutes: minutes === null || minutes === undefined ? null : Number(minutes), reduced: false, because: null };
  }
  return {
    minutes: Math.floor(Number(minutes) * REDUCED_HEAT_DOSE_FRACTION),
    reduced: true,
    because: `Reduced heat dose: ${hit.join(', ')}.`,
  };
}

// ---------------------------------------------------------------------------
// What the coach is allowed to say about heat and cold.
//
// The coach answers from retrieved passages and nothing else, which is the right
// design and is also why this block exists: a passage written before the owner's
// pillar ruling can still state an eight minute plunge, and the model would
// repeat it faithfully. The ceilings therefore travel as a constraint that
// outranks the passages, in the same shape as WEARABLE_RULES.
// ---------------------------------------------------------------------------

export const HEATCOLD_RULES = [
  'HEAT AND COLD. These limits outrank anything a passage says. If a passage',
  'gives a longer or colder dose than these, the passage is out of date: give',
  'these and say the document is being corrected.',
  `  1. No single cold exposure over ${HARD_CEILING_MINUTES} minutes, at any tier.`,
  `  2. No water colder than ${HARD_FLOOR_CELSIUS} C (45 F), at any tier.`,
  `  3. Cold is never within ${COLD_AFTER_STRENGTH_HOURS} hours after strength training.`,
  `  4. A sauna finishes ${SAUNA_BEFORE_BED_HOURS[0]} to ${SAUNA_BEFORE_BED_HOURS[1]} hours before bed.`,
  '  5. No alcohol before or during a sauna. Mineral water after.',
  '  6. Never plunge alone in open water. Never head under, never breath held.',
  'Heat and cold is one of the seven pillars. Name it as a pillar, not as an extra.',
  'Evidence: sauna frequency and duration are "We are confident", on observational',
  'evidence, which shows association and cannot show cause. Cold exposure is',
  '"Early evidence". Say which one you are standing on when you give a dose.',
  'If the person names any of these, do not give a dose at all and route them to',
  'their prescriber: a heart attack in the last twelve months, unstable chest pain,',
  'severe aortic stenosis, an arrhythmia, uncontrolled or very low blood pressure,',
  'pregnancy, or Raynaud\'s for cold. A man trying to conceive halves the heat dose.',
].join('\n');

// Words that mean the answer is likely to carry a heat or cold dose. Deliberately
// broad: including the rules when they were not needed costs a few tokens, and
// omitting them when they were needed is how a ceiling gets breached.
const HEATCOLD_WORDS = /\b(sauna|plunge|cold|heat|ice bath|contrast|cryo|hot tub|steam|shiver|hormesis|hormetic|thermal)\b/i;

export function mentionsHeatOrCold(question, passages = []) {
  if (HEATCOLD_WORDS.test(String(question || ''))) return true;
  return (passages || []).some((p) => HEATCOLD_WORDS.test(String((p && p.passage) || '')));
}
