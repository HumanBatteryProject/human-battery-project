// The weekly review. Master prompt D7.
//
// "Use 'associated with' for observational patterns. Never claim an action
// caused a change."
//
// That is the whole difficulty of this file. Everything the review has to say is
// a correlation over one person over one week, which is the weakest evidence
// there is, and the natural way to write a sentence about it is causal. "Your
// sleep improved because you got outside" is one word away from "your sleep
// improved and you also got outside", and only the second one is true.
//
// So causal language is not a style rule here, it is checked. The sentences are
// assembled from templates that cannot say "because", and a check refuses any
// review whose text claims causation, including text a model wrote.

// Words that assert one thing produced another. Checked against the WHOLE review
// text before it can be stored.
const CAUSAL = [
  /\bbecause of (?:your|the|this|that)\b/i,
  /\bcaused?\s+(?:by|your|the|a|an|it|this|that)\b/i,
  /\bcausing\b/i, /\bcauses\b/i,
  /\bdue to (?:your|the|this|that)\b/i,
  /\bresulted? (?:in|from)\b/i, /\bresulting in\b/i,
  /\bled to\b/i, /\bleads to\b/i,
  /\bthanks to\b/i,
  /\bimproved your\b/i, /\braised your\b/i, /\blowered your\b/i,
  /\bmade your\b/i, /\bdrove\b/i,
  /\bso your .* (?:went up|went down|improved|fell|rose)\b/i,
  /\bwhich (?:is why|explains)\b/i,
  /\beffect of\b/i, /\bimpact of\b/i,
];

// The permitted way to say the same observation.
export const ASSOCIATION_PHRASES = [
  'alongside', 'at the same time as', 'in the same week as', 'associated with',
];

/**
 * Does this text claim one thing caused another?
 * @returns {string[]} the offending phrases, empty when the text is clean
 */
export function causalClaims(text) {
  const s = String(text || '');
  const hits = [];
  for (const re of CAUSAL) {
    const m = s.match(re);
    if (m) hits.push(m[0]);
  }
  return hits;
}

/**
 * What changed and what held steady, from two weeks of logs.
 *
 * Reports a DIRECTION and the two averages, never a percentage change: a
 * percentage over seven days of self reported numbers implies a precision that
 * is not there, and "up from 3.1 to 3.8" is both more honest and more useful.
 *
 * A field with too few days in either week is a LIMITATION, not a change and not
 * a stability. Saying something held steady when it was measured twice is a
 * claim about data that does not exist.
 */
export const MIN_DAYS_FOR_A_COMPARISON = 3;

// How much a mean must move to be worth calling a change rather than noise.
// Per field, in that field's own units, and deliberately generous: this is one
// person over one week.
export const MEANINGFUL = {
  sleep_quality: 0.5,          // out of 5
  energy: 0.5,                 // out of 5
  outdoor_daylight_min: 5,     // minutes
  movement_minutes: 10,        // minutes
  water_ml: 400,               // millilitres
};

// Two forms per field, because one does not fit both sentences. "How you rated
// your sleep is up, from 3.0 to 4.0" reads correctly; "No how you rated your
// sleep logged this week" does not. The second form is the bare noun that works
// after "No" and "Nothing about".
export const FIELD_WORDS = {
  sleep_quality: ['how you rated your sleep', 'out of 5', 'sleep ratings'],
  energy: ['your energy', 'out of 5', 'energy'],
  outdoor_daylight_min: ['time outside', 'minutes a day', 'time outside'],
  movement_minutes: ['movement', 'minutes a day', 'movement'],
  water_ml: ['water', 'millilitres a day', 'water'],
};

function meanOf(logs, field) {
  const vals = (logs || []).map((l) => l[field]).filter((v) => typeof v === 'number');
  return vals.length ? { mean: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : { mean: null, n: 0 };
}

const fmt = (v, field) => (field === 'sleep_quality' || field === 'energy'
  ? v.toFixed(1) : String(Math.round(v)));

/**
 * @param {object[]} thisWeek daily_logs for the week under review
 * @param {object[]} lastWeek daily_logs for the week before
 */
export function compareWeeks(thisWeek, lastWeek) {
  const changed = [], stable = [], limitations = [];

  for (const field of Object.keys(MEANINGFUL)) {
    const a = meanOf(lastWeek, field);
    const b = meanOf(thisWeek, field);
    const [label, unit, noun] = FIELD_WORDS[field];

    if (b.n === 0) {
      limitations.push(`No ${noun} logged this week, so there is nothing to compare.`);
      continue;
    }
    if (b.n < MIN_DAYS_FOR_A_COMPARISON || a.n < MIN_DAYS_FOR_A_COMPARISON) {
      limitations.push(
        `There ${b.n === 1 ? 'is' : 'are'} only ${b.n} day${b.n === 1 ? '' : 's'} of ` +
        `${noun} this week${a.n ? ` and ${a.n} last week` : ' and none last week'}. ` +
        `That is too few to call it a change or to say it held steady.`);
      continue;
    }
    const delta = b.mean - a.mean;
    if (Math.abs(delta) >= MEANINGFUL[field]) {
      changed.push({
        field,
        direction: delta > 0 ? 'up' : 'down',
        from: fmt(a.mean, field), to: fmt(b.mean, field),
        // No "because". The sentence states two numbers and a direction.
        sentence: `${cap(label)} is ${delta > 0 ? 'up' : 'down'}, ` +
                  `from ${fmt(a.mean, field)} to ${fmt(b.mean, field)} ${unit}.`,
      });
    } else {
      stable.push({
        field,
        at: fmt(b.mean, field),
        sentence: `${cap(label)} held about steady, around ${fmt(b.mean, field)} ${unit}.`,
      });
    }
  }
  return { changed, stable, limitations };
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/**
 * Where two things moved together, said as an association and nothing more.
 * Only emitted when BOTH fields have enough days, and the wording cannot be
 * turned into a cause by reading it quickly.
 */
export function associations(changed) {
  if (changed.length < 2) return [];
  const out = [];
  for (let i = 0; i < changed.length; i++) {
    for (let j = i + 1; j < changed.length; j++) {
      const a = changed[i], b = changed[j];
      const [la] = FIELD_WORDS[a.field], [lb] = FIELD_WORDS[b.field];
      out.push(
        `${cap(la)} went ${a.direction} in the same week as ${lb} went ${b.direction}. ` +
        `That is one week of your own numbers moving together, which is not evidence ` +
        `that either moved the other.`);
    }
  }
  return out.slice(0, 2);   // two at most; a list of pairings reads as a finding
}

/**
 * Next week's priorities: the actions already chosen, not new advice.
 * The review must not invent a recommendation, because a recommendation is a
 * plan action and those come only from approved rules.
 */
export function prioritiesFrom(planActions) {
  return (planActions || []).map((a) => ({
    rule_key: a.rule_key,
    text: a.action_text,
    review_on: a.review_on,
  }));
}

/**
 * The Reviewer for a weekly review. Refuses rather than repairing.
 */
export function reviewWeekly(review) {
  const problems = [];
  const text = [
    review.narrative || '',
    ...(review.changed || []).map((c) => c.sentence || ''),
    ...(review.stable || []).map((s) => s.sentence || ''),
    ...(review.limitations || []),
    ...(review.associations || []),
  ].join(' ');

  const causal = causalClaims(text);
  if (causal.length) problems.push('claims causation: ' + causal.join(', '));
  // The code point, not the character: written literally this line is itself an
  // em dash in a scanned file, and the suite cannot tell a detector from an
  // emitter. Same trap as the plan Reviewer.
  if (text.includes('\u2014')) problems.push('contains an em dash');
  if (/\b\d{1,3}\s?%/.test(text)) problems.push('states a percentage');
  if (/\$\s?\d/.test(text)) problems.push('states a price');
  if (!review.week_start) problems.push('no week start');
  // A review with nothing in it at all is not a review.
  if (!(review.changed || []).length && !(review.stable || []).length
      && !(review.limitations || []).length) {
    problems.push('nothing to report, not even a limitation');
  }
  return { ok: problems.length === 0, problems };
}
