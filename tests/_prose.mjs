// Reading prose out of source files, for fixtures that check what a comment or a
// string actually says.
//
// WHY THIS IS SHARED. Four fixtures had grown their own flattener, and each one
// learned a different lesson the hard way, so each was wrong in a way the others
// were not:
//
//   the consent body is HARD WRAPPED, so "there is no\nemergency response"
//     read as a missing statement
//   a SQL comment is built from CONCATENATED LITERALS, so
//     'rendered as a ' 'number' read as "rendered as a ' 'number"
//   a long comment CONTINUES with its marker, so "the second one can\n-- answer"
//     read as "the second one can -- answer"
//
// All three are the same bug: a phrase that spans a break is still the phrase. A
// fixture that cannot see that fails on correct text, and a check that cries
// wolf gets switched off, which is worse than not having it.

/**
 * Normalise source text so a phrase can be matched regardless of how it was
 * wrapped, quoted or commented.
 */
export function prose(text) {
  return String(text)
    // A comment marker at the start of a continuation line is not part of the
    // sentence. Done before whitespace collapsing, while the line starts are
    // still visible.
    .replace(/\n\s*(\/\/|--|\*|#)\s?/g, '\n')
    // Adjacent string literals: 'a ' 'b' is the one string "a b".
    .replace(/'\s*'/g, '')
    .replace(/"\s*"/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read a file and normalise it in one step. */
export function proseOf(url) {
  // Imported lazily so this module stays usable in a browser-less context.
  return prose(require('node:fs').readFileSync(url, 'utf8'));
}
