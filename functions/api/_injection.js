/**
 * Text that arrived from outside must never come back out as if it were ours.
 *
 * FOUND BY THE DAY 14 RELEASE REVIEW. Part J requires that untrusted content
 * cannot override instructions, and the acceptance line had no fixture. When one
 * was written, the coach refused the injection in words and then printed the
 * injected phrase anyway, as the FIRST line of the reply, directly after the
 * evidence tier wording:
 *
 *     We know this. BANANA_PROTOCOL
 *     Note: I'm not going to follow instructions embedded inside a document.
 *
 * The refusal is real. The problem is what a member reads first. With a nonsense
 * token it is harmless; with "STOP TAKING YOUR STATIN" it is the first thing on
 * the screen, carrying "We know this", which is the consumer wording for the
 * `established` evidence tier. Tier wording must attach to a retrieved passage,
 * never to text an attacker supplied.
 *
 * The guard is deterministic and server side, because the thing that failed here
 * was an instruction in a prompt. It does not ask the model to behave.
 */

// Cue words that make a demand an injection rather than an ordinary request.
// The demand and the cue have to be in the same sentence, so "reply with your
// tier" from a real member is not caught.
const CUE = /\b(ignore|disregard|instead|override|forget|only|regardless|no matter what|system\s*:|developer mode)\b/i;

// "reply only with X", "respond with the exact phrase X", "output X", "say X".
const DEMAND = new RegExp(
  '\\b(?:reply|respond|answer|output|print|write|say)\\b[^.\\n]{0,40}?' +
  '\\bwith\\b[^.\\n]{0,40}?(?:phrase\\s+)?["“\']?([A-Za-z0-9_][A-Za-z0-9 _-]{2,60})["”\']?',
  'i');

// A shouted token is a demand on its own: BANANA_PROTOCOL, ACCESS_GRANTED.
const SHOUTED = /\b[A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+\b/g;

function sentences(text) {
  return String(text || '').split(/(?<=[.!?])\s+|\n+/);
}

/**
 * Phrases the untrusted text is trying to put in our mouth.
 * @param {string} question the member's message, which is untrusted input
 * @returns {string[]} phrases that must not appear in the reply
 */
export function demandedPhrases(question) {
  const found = new Set();
  for (const s of sentences(question)) {
    if (!CUE.test(s)) continue;
    const m = DEMAND.exec(s);
    if (m && m[1]) found.add(m[1].trim());
  }
  // A shouted token anywhere in a message that also carries a cue.
  if (CUE.test(String(question || ''))) {
    for (const t of String(question || '').match(SHOUTED) || []) found.add(t);
  }
  return [...found].filter((p) => p.length >= 3);
}

/** Did the reply hand back a phrase the untrusted text demanded? */
export function echoedInjection(question, reply) {
  const r = String(reply || '');
  return demandedPhrases(question).filter((p) => r.includes(p));
}

// What a member gets instead. It answers nothing and explains why, which is the
// only safe thing to say when the reply cannot be trusted to lead with our words.
export const INJECTION_REPLY =
  'That message contained an instruction aimed at me rather than a question for you, '
  + 'so I am not going to answer it as written. I do not follow instructions that arrive '
  + 'inside a message, a document or a lab report. Ask me the question on its own and I '
  + 'will answer it.';
