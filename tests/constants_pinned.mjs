// Every shipped scalar constant, pinned to the value the owner approved.
//
// WHY THIS EXISTS SEPARATELY FROM THE BEHAVIOURAL FIXTURES.
// A fixture that imports a constant tests the BEHAVIOUR at whatever the
// constant currently is. That is correct and it is not enough: if somebody
// moves FLOOR_LEXICAL from 0.05 to 0.5, every importing fixture still passes,
// because the behaviour is still consistent with the new number. Nothing says
// the number changed.
//
// So this file does the opposite thing. It asserts the VALUES, once, against
// the table in the §9 report that the owner signed off. Moving one is then a
// deliberate act with a failing test attached, which is what a decision that
// belongs to somebody else should feel like.
//
// A constant appearing here is a claim that its value was approved. Adding a
// constant means adding a line here.

import { DEFAULT_TZ, BATCH_LIMIT, MAX_GRADE } from '../functions/api/brief-run.js';
import { FLOOR_LEXICAL, FLOOR_VECTOR, RETRIEVE_K, DAILY_LIMIT } from '../functions/api/coach.js';
import { COVERAGE_FLOOR } from '../functions/api/analyze.js';
import { IMPROVED_MIN_POINTS } from '../functions/api/complete.js';
import { WEEKLY_RECOVERY_WEEKS, ACCESS_DAYS_PER_WEEKLY_PAYMENT } from '../functions/api/_billing.js';
import { PROGRAM_TOTAL_CENTS } from '../functions/api/_payments.js';
import { AUTONOMY_MODE, CONFIDENCE_FLOOR, CONFIDENCE_WINDOW_DAYS,
         TRIGGERING_TIERS, CITABLE_TIERS } from '../functions/api/_autonomy.js';
import { RETURN_MULTIPLIER, MULTIPLIER_MAX, HARD_CAPS, HARD_FLOORS } from '../functions/api/_intensity.js';
import { HARD_CEILING_MINUTES, HARD_FLOOR_CELSIUS, COLD_AFTER_STRENGTH_HOURS } from '../functions/api/_heatcold.js';
import { CLAIMABLE, TIER_WORDING, SCORE_DISCLAIMER } from '../functions/api/_evidence.js';

let bad = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  const ok = a === b;
  if (!ok) bad++;
  console.log('%s %s %s', ok ? 'ok  ' : 'FAIL', name.padEnd(30), ok ? a : a + '   approved: ' + b);
};
const set = (s) => [...s].sort();

// --- the brief ---
eq('DEFAULT_TZ', DEFAULT_TZ, 'America/Chicago');
eq('BATCH_LIMIT', BATCH_LIMIT, 200);
eq('MAX_GRADE', MAX_GRADE, 6);

// --- the coach ---
eq('FLOOR_LEXICAL', FLOOR_LEXICAL, 0.05);
eq('FLOOR_VECTOR', FLOOR_VECTOR, 0.25);
eq('RETRIEVE_K', RETRIEVE_K, 6);
eq('DAILY_LIMIT', DAILY_LIMIT, 20);

// --- analysis ---
eq('COVERAGE_FLOOR', COVERAGE_FLOOR, 0.6);

// --- completion ---
eq('IMPROVED_MIN_POINTS', IMPROVED_MIN_POINTS, 5);
eq('RETURN_MULTIPLIER', RETURN_MULTIPLIER, 1.2);
eq('MULTIPLIER_MAX', MULTIPLIER_MAX, 1.5);
// Changed by the owner's pillar ruling of 2026-09-27, which is the approval.
// Cold was pinned at 10 minutes and the ruling's hard ceiling is 5, at every
// tier and after the Pro 20 percent per cycle increase. Sauna was pinned at 25
// and the ruling's pro dose is 20 or more minutes in 2 to 3 rounds, so 30 is the
// per-round ceiling. This check is what caught both, which is what it is for.
eq('HARD_CAPS.sauna_min', HARD_CAPS.sauna_min, 30);
eq('HARD_CAPS.cold_min', HARD_CAPS.cold_min, 5);
// The two bounds the ruling added. cold_temp_c has a FLOOR rather than a cap,
// because for a temperature a smaller number is a larger dose.
eq('HARD_FLOORS.cold_temp_c', HARD_FLOORS.cold_temp_c, 7);
eq('HARD_CEILING_MINUTES', HARD_CEILING_MINUTES, 5);
eq('HARD_FLOOR_CELSIUS', HARD_FLOOR_CELSIUS, 7);
eq('COLD_AFTER_STRENGTH_HOURS', COLD_AFTER_STRENGTH_HOURS, 6);
eq('HARD_CAPS.fasts/week', HARD_CAPS.extended_fasts_per_week, 1);

// --- bounded autonomy ---
eq('AUTONOMY_MODE', AUTONOMY_MODE, 'review_all');   // Brief 08 section 8 decision 1
eq('WEEKLY_RECOVERY_WEEKS', WEEKLY_RECOVERY_WEEKS, 4);   // confirmed 26 Sep 2026
eq('ACCESS_DAYS_PER_WEEKLY_PAYMENT', ACCESS_DAYS_PER_WEEKLY_PAYMENT, 7);
eq('PROGRAM_TOTAL_CENTS', PROGRAM_TOTAL_CENTS, 100000);  // $1,000, confirmed
eq('CONFIDENCE_FLOOR', CONFIDENCE_FLOOR, 0.7);
eq('CONFIDENCE_WINDOW_DAYS', CONFIDENCE_WINDOW_DAYS, 14);

// The tier sets are the safety property of bounded autonomy. Widening
// TRIGGERING_TIERS is the single change most likely to be made casually and
// least likely to be noticed, so it is pinned by membership, not by size.
eq('TRIGGERING_TIERS', set(TRIGGERING_TIERS), ['established', 'strong']);
eq('CITABLE_TIERS', set(CITABLE_TIERS),
   ['contested', 'emerging', 'established', 'hypothesis', 'strong']);

// unsupported must never be claimable. 178 of 370 passages carry it.
eq('CLAIMABLE', set(CLAIMABLE),
   ['contested', 'emerging', 'established', 'hypothesis', 'strong']);
eq('unsupported not claimable', CLAIMABLE.has('unsupported'), false);

// --- consumer wording, which is a contract with the reader ---
eq('TIER_WORDING.established', TIER_WORDING.established, 'We know this');
eq('TIER_WORDING.strong', TIER_WORDING.strong, 'We are confident');
eq('TIER_WORDING.emerging', TIER_WORDING.emerging, 'Early evidence');
eq('TIER_WORDING.contested', TIER_WORDING.contested, 'Published, and argued about');
eq('TIER_WORDING.hypothesis', TIER_WORDING.hypothesis, "Dr. Micah's idea, being tested");

eq('SCORE_DISCLAIMER', SCORE_DISCLAIMER,
   'Your Battery Score is a proxy, assembled from what can be measured today. ' +
   'It is not a validated clinical measure.');

console.log('\n%d constant(s) have moved from their approved value', bad);
process.exit(bad ? 1 : 0);
