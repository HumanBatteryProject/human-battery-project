// Completion fixtures: the tier decision and the hard caps.
//
// The cap test is the one that matters. A multiplier is exactly the kind of
// thing that gets applied twice by accident, and CLAUDE.md's ceilings are
// safety limits, not preferences: sauna 25 minutes, cold 10 minutes.

import { nextCycle, applyMultiplier, HARD_CAPS, RETURN_MULTIPLIER, MULTIPLIER_MAX }
  from '../functions/api/_intensity.js';

let bad = 0;
const t = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log('%s %s got=%s want=%s', ok ? 'ok  ' : 'FAIL', label.padEnd(56),
    JSON.stringify(got), JSON.stringify(want));
};

// --- tier decision ---
t('a beginner who improved moves up, intensity resets',
  nextCycle({ tier: 'beginner', improved: true }).next_tier, 'intermediate');
t('  and the multiplier is the new tier\'s standard',
  nextCycle({ tier: 'beginner', improved: true }).next_multiplier, 1.0);
t('an advanced member who improved moves to pro',
  nextCycle({ tier: 'advanced', improved: true }).next_tier, 'pro');
t('a pro who improved stays pro and gains intensity',
  nextCycle({ tier: 'pro', improved: true, currentMultiplier: 1.0 }).next_multiplier,
  RETURN_MULTIPLIER);
t('a member who did not improve repeats at standard intensity',
  nextCycle({ tier: 'advanced', improved: false }).next_tier, 'advanced');
t('  and the multiplier goes back to 1.0',
  nextCycle({ tier: 'pro', improved: false, currentMultiplier: 1.2 }).next_multiplier, 1.0);

// --- the multiplier must not compound without bound ---
t('a pro returning twice does not compound past the ceiling',
  nextCycle({ tier: 'pro', improved: true, currentMultiplier: 1.44 }).next_multiplier,
  MULTIPLIER_MAX);

// --- HARD CAPS bind regardless of multiplier ---
// RETURN_MULTIPLIER, not the literal 1.2 it currently equals. With the
// literal, moving the shipped multiplier to 1.3 left this case passing
// against a number the product no longer uses.
t('sauna scales inside the cap',
  applyMultiplier('sauna_min', 15, RETURN_MULTIPLIER),
  { value: +(15 * RETURN_MULTIPLIER).toFixed(2), capped: false });
t('sauna is CAPPED at 25 minutes however large the multiplier',
  applyMultiplier('sauna_min', 25, MULTIPLIER_MAX), { value: HARD_CAPS.sauna_min, capped: true });
t('cold is CAPPED at 10 minutes',
  applyMultiplier('cold_min', 9, MULTIPLIER_MAX), { value: HARD_CAPS.cold_min, capped: true });
t('a parameter with no cap scales freely',
  applyMultiplier('water_l', 3, RETURN_MULTIPLIER),
  { value: +(3 * RETURN_MULTIPLIER).toFixed(2), capped: false });

console.log('\n%d case(s) failed', bad);
process.exit(bad ? 1 : 0);
