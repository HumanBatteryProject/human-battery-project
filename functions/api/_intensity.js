// The intensity multiplier, and the ceilings it can never scale past.
//
// A returning member who improved comes back at the next tier, or at Pro with
// more intensity. The multiplier is applied to the NEXT cycle's parameters
// only, and the hard caps bind regardless, one extended fast a week among them.
//
// The caps are enforced HERE rather than trusted to the caller, because a
// multiplier is exactly the kind of thing that gets applied twice by accident.
//
// THE OWNER'S PILLAR RULING CHANGED TWO OF THESE. The caps used to read "sauna
// 25 minutes, cold 10 minutes and never below 38F". The ruling puts a hard
// ceiling on cold at every tier, explicitly including this 20 percent per cycle
// increase: no single plunge over 5 minutes, and no water colder than 7 C.
// 10 minutes was double the ceiling, and 38F is 3.3 C, well past the floor.
//
// Temperatures are now never scaled at all. Multiplying a cold water
// temperature by 1.2 makes it WARMER, which is a smaller dose, so the
// multiplier ran backwards on exactly the parameter with a safety floor. The
// tier band sets the temperature; the multiplier moves duration.

// DECISION LEFT TO THE OWNER. The step a returning Pro comes back at.
export const RETURN_MULTIPLIER = 1.2;        // 20 percent, per CLAUDE.md
export const MULTIPLIER_MAX = 1.5;           // never compounds past this

export const HARD_CAPS = {
  // Per round. The ruling's pro dose is 20 or more minutes in 2 to 3 rounds.
  sauna_min: 30,
  // The ruling's hard ceiling, at every tier, including after this multiplier.
  cold_min: 5,
  extended_fasts_per_week: 1,
};

// Lower bounds that no multiplier and no proposal may cross. Only temperatures
// need one, because for them a smaller number is a larger dose.
export const HARD_FLOORS = {
  cold_temp_c: 7,
};

// Parameters the multiplier must leave alone. Scaling a temperature by an
// intensity factor is either meaningless or backwards.
export const NEVER_SCALED = new Set(['cold_temp_c', 'sauna_temp_c']);

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
  const raw = Number(value);

  // Temperatures pass through untouched, then meet their floor. Returning the
  // value unscaled is the point, not an omission, so it is recorded as such.
  if (NEVER_SCALED.has(param)) {
    const floor = HARD_FLOORS[param];
    if (floor != null && raw < floor) {
      return { value: floor, capped: true, not_scaled: true };
    }
    return { value: +raw.toFixed(2), capped: false, not_scaled: true };
  }

  const scaled = raw * Number(multiplier || 1);
  const floor = HARD_FLOORS[param];
  if (floor != null && scaled < floor) return { value: floor, capped: true };
  const cap = HARD_CAPS[param];
  if (cap == null) return { value: +scaled.toFixed(2), capped: false };
  return cap < scaled
    ? { value: cap, capped: true }
    : { value: +scaled.toFixed(2), capped: false };
}
