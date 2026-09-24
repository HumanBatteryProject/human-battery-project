// The consumer wording for each evidence tier, and the rule about when a tier
// may be spoken at all.
//
// Brief 06 section 4 rule 2: when the coach states something as true, the
// passage it came from must carry a tier other than null or `unsupported`, and
// the reply renders the consumer wording for that tier. A passage with no tier
// can be offered as "the book discusses" and never as a claim.
//
// These strings are the contract with the reader. They are not paraphrased at
// call sites, because a tier that reads differently on two screens is a tier
// the reader cannot learn.

export const TIER_WORDING = {
  established: 'We know this',
  strong:      'We are confident',
  emerging:    'Early evidence',
  contested:   'Published, and argued about',
  hypothesis:  "Dr. Micah's idea, being tested",
};

// The only tiers that may carry a claim. `unsupported` is deliberately absent.
export const CLAIMABLE = new Set(['established', 'strong', 'emerging', 'contested', 'hypothesis']);

export function canClaim(tier) {
  return CLAIMABLE.has(String(tier || '').toLowerCase());
}

export function wordingFor(tier) {
  return TIER_WORDING[String(tier || '').toLowerCase()] || null;
}

// Verbatim, every time the Score is shown or discussed. Brief 06 section 4
// rule 5. The same string is on index.html, science.html and the portal, all
// three verified byte-identical.
export const SCORE_DISCLAIMER =
  'Your Battery Score is a proxy, assembled from what can be measured today. ' +
  'It is not a validated clinical measure.';

export const SCORE_TRIGGER = /\bbattery score\b|\bmy score\b|\bthe score\b|\bscored?\b/i;
