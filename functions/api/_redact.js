// What may be written to a log. Part G: "redacted logs."
//
// Cloudflare's logs are readable by anybody with dashboard access and can be
// shipped to a third party, so they are not a private notebook. A log line is the
// easiest place in a codebase to leak an identity, because writing one feels like
// debugging rather than like handling data.
//
// THE RULE. A log may carry an id, a count, a status, a reason and a duration. It
// may not carry an email address, a name, a postal code, a measured value, a
// symptom, anything a participant typed, or any part of a secret.
//
// IDS ARE FINE AND ADDRESSES ARE NOT, which is worth being explicit about because
// both identify somebody. A uuid identifies a row to somebody who already has
// database access. An email identifies a person to anybody, forever, and is the
// same string they use everywhere else.

/**
 * A stable short tag for an address, so two log lines about the same person can
 * still be tied together without the address being present.
 *
 * Deliberately NOT reversible and deliberately not a masked form like
 * m***h@a***.com: masking leaves the domain, the first letter and the length,
 * which for a small program is usually enough to name the person.
 */
export async function tag(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return 'none';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** An email, as it may appear in a log. */
export async function emailTag(email) {
  return `person:${await tag(email)}`;
}

// A postal code narrows a person to a few streets. The region it derives to is
// what the code was actually being used for, so log that instead.
export function placeTag(region) {
  return region ? `region:${region}` : 'region:unknown';
}

/**
 * Last-resort scrub for a string that is about to be logged and might contain
 * anything, such as a provider error body.
 *
 * It removes addresses and long digit runs. It is NOT a substitute for not
 * logging the thing in the first place, and it cannot find a symptom or a
 * measured value, because those look like ordinary words and numbers.
 */
export function scrub(text, max = 300) {
  return String(text == null ? '' : text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[address]')
    .replace(/\b\d{9,}\b/g, '[number]')
    .replace(/\b(sk|pk|whsec|sb|eyJ)[A-Za-z0-9_\-.]{8,}/g, '[secret]')
    .slice(0, max);
}
