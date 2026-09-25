// The five bounds. A change auto-applies only when ALL of them hold.
//
// This is the whole safety property of brief 06A section A3, so it is its own
// module, it is pure, and it is tested directly. Nothing here reads the
// network or the clock: it takes the facts and returns a verdict, which is
// what makes "blocked by rule 3" a thing a fixture can assert on.
//
// The bounds live in protocol_parameters, not here. A bound held in the
// agent's code is one the agent's next revision can widen without anyone
// noticing; a bound in the database is one a person has to change on purpose.

// DECISION LEFT TO THE OWNER.
// Brief 08 section 8 decision 1, recommended and adopted: V1 launches at
// review_all, so every proposal queues for a human for the first 30 days of
// real members. The step limits below have never been seen against real data,
// and a limit that has only been tested against fixtures is a guess. Switch to
// 'bounded' once they have. This is the one line that changes.
export const AUTONOMY_MODE = 'review_all';   // 'bounded' | 'review_all'

// DECISION LEFT TO THE OWNER. Rule 5: below this fraction of days logged in
// the window, the dimension is not a signal and nothing is applied from it.
// A missing week is not a signal.
export const CONFIDENCE_FLOOR = 0.7;         // 70 percent of days logged
export const CONFIDENCE_WINDOW_DAYS = 14;

// Rule 2. "We are confident" is `strong`. Anything weaker may be CITED in the
// explanation but cannot by itself trigger a change.
export const TRIGGERING_TIERS = new Set(['established', 'strong']);
export const CITABLE_TIERS = new Set(['established', 'strong', 'emerging', 'contested', 'hypothesis']);

export const RULES = {
  1: 'parameter is defined for this tier and the target is inside its published range',
  2: 'justifying evidence is "We are confident" or above',
  3: 'no screening flag on the intervention being changed',
  4: 'change is within the weekly step limit for this parameter',
  5: 'data coverage for the dimension is above the confidence floor',
};

/**
 * @param {object} c
 *   param, from_value, to_value, tier
 *   bound        row from protocol_parameters for (param, tier), or null
 *   tiers        evidence_tier[] of the justifying passages
 *   flags        interventions the member has a screening flag on
 *   days_logged  days with a log in the confidence window
 *   window_days  the window
 * @returns {{apply: boolean, blocked_by: string|null, permitted_by: string|null, weak: boolean}}
 */
export function evaluate(c, mode = AUTONOMY_MODE) {
  const weak = !c.tiers || !c.tiers.some(t => CITABLE_TIERS.has(t) && t !== 'hypothesis' && t !== 'contested');

  // The mode is a parameter with the shipped constant as its default, not a
  // read of the constant. When it was the latter, flipping AUTONOMY_MODE to
  // review_all made all five bounded rules unreachable and eleven fixtures
  // failed at once: the mode gate short-circuits before any rule runs, so the
  // rules could only ever be tested while the product was in the other mode.
  // The rules have to stay testable in the mode the product is NOT in, because
  // review_all is temporary and the rules are what it will switch back to.
  if (mode === 'review_all') {
    return { apply: false, blocked_by: 'AUTONOMY_MODE is review_all', permitted_by: null, weak };
  }

  // 1. the parameter must exist for this tier, and the target must be in range
  if (!c.bound) {
    return { apply: false, blocked_by: 'rule 1: ' + RULES[1], permitted_by: null, weak };
  }
  const to = Number(c.to_value);
  if (!(to >= Number(c.bound.min_value) && to <= Number(c.bound.max_value))) {
    return { apply: false, blocked_by: 'rule 1: ' + RULES[1], permitted_by: null, weak };
  }

  // 2. the justification must be able to trigger, not merely be citable
  const triggering = (c.tiers || []).some(t => TRIGGERING_TIERS.has(t));
  if (!triggering) {
    return { apply: false, blocked_by: 'rule 2: ' + RULES[2], permitted_by: null, weak };
  }

  // 3. a flagged intervention is never auto-changed
  if ((c.flags || []).includes(c.bound.intervention)) {
    return { apply: false, blocked_by: 'rule 3: ' + RULES[3], permitted_by: null, weak };
  }

  // 4. the step
  const from = Number(c.from_value);
  if (isFinite(from) && Math.abs(to - from) > Number(c.bound.weekly_step) + 1e-9) {
    return { apply: false, blocked_by: 'rule 4: ' + RULES[4], permitted_by: null, weak };
  }

  // 5. coverage. A missing week is not a signal.
  const win = c.window_days || CONFIDENCE_WINDOW_DAYS;
  const cov = win ? (Number(c.days_logged || 0) / win) : 0;
  if (cov < CONFIDENCE_FLOOR) {
    return { apply: false, blocked_by: 'rule 5: ' + RULES[5], permitted_by: null, weak };
  }

  return {
    apply: true, blocked_by: null, weak,
    permitted_by: 'all five bounds held: ' + c.param + ' ' + from + ' to ' + to +
      ' (step limit ' + c.bound.weekly_step + ', range ' +
      c.bound.min_value + ' to ' + c.bound.max_value + ', coverage ' +
      Math.round(cov * 100) + ' percent)',
  };
}
