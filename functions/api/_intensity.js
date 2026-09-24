// The intensity multiplier, and the ceilings it can never scale past.
//
// A returning member who improved comes back at the next tier, or at Pro with
// more intensity. The multiplier is applied to the NEXT cycle's parameters
// only, and CLAUDE.md's hard caps bind regardless: sauna 25 minutes, cold 10
// minutes and never below 38F, one extended fast a week.
//
// The caps are enforced HERE rather than trusted to the caller, because a
// multiplier is exactly the kind of thing that gets applied twice by accident.

// DECISION LEFT TO THE OWNER. The step a returning Pro comes back at.
export const RETURN_MULTIPLIER = 1.2;        // 20 percent, per CLAUDE.md
export const MULTIPLIER_MAX = 1.5;           // never compounds past this

export const HARD_CAPS = {
  sauna_min: 25,
  cold_min: 10,
  extended_fasts_per_week: 1,
};

export function nextCycle({ tier, improved, currentMultiplier = 1.0 }) {
  const ORDER = ['beginner', 'intermediate', 'advanced', 'pro'];
  const i = ORDER.indexOf(tier);
  if (!improved) {
    return { next_tier: tier, next_multiplier: 1.0,
             reason: 'repeat the same tier at standard intensity' };
  }
  if (i >= 0 && i < ORDER.length - 1) {
    return { next_tier: ORDER[i + 1], next_multiplier: 1.0,
             reason: 'moved up a tier, so intensity resets to that tier\'s standard' };
  }
  // already Pro: more intensity, bounded
  const m = Math.min(MULTIPLIER_MAX, +(currentMultiplier * RETURN_MULTIPLIER).toFixed(2));
  return { next_tier: 'pro', next_multiplier: m,
           reason: 'already at Pro, so intensity rises instead of the tier' };
}

export function applyMultiplier(param, value, multiplier) {
  const scaled = Number(value) * Number(multiplier || 1);
  const cap = HARD_CAPS[param];
  if (cap == null) return { value: +scaled.toFixed(2), capped: false };
  return cap < scaled
    ? { value: cap, capped: true }
    : { value: +scaled.toFixed(2), capped: false };
}
