// The foundational-model claim-shape audit, in JavaScript, for text that is
// written at runtime and never reaches a file.
//
// WHY THIS EXISTS AS A SECOND COPY, WHICH IS NORMALLY THE WRONG ANSWER.
//
// scripts/check_prohibitions.py is the audit, and it runs over the repository
// in the commit gate. The research agent writes a summary paragraph into
// research_findings and, once accepted, into knowledge_passages, where the
// coach retrieves it and speaks in its voice. That paragraph is never a file,
// so the Python audit will never see it, and by the time anyone could read it
// the coach has already said it.
//
// So the audit has to run at write time, in the runtime, which is JavaScript.
//
// THE DRIFT THIS CREATES IS REAL AND IS CHECKED. Two copies of a rule drift,
// and the one that drifts is always the one nobody is reading.
// scripts/check_claimshape_parity.py compares the pattern names here against
// the TEXT patterns there and fails the gate if Python gains one this file
// lacks. The four colour patterns in the Python audit are deliberately out of
// scope: a prose summary has no stylesheet. That exclusion is a named list in
// the parity check rather than a silent difference.
//
// EVERY PATTERN CARRIES A CANARY, and auditCanaries() proves each one can
// still fire. A check that has never refused anything is not evidence that
// nothing needed refusing, which is the same reason scripts/check_logo.py and
// .claude/hooks/protected-paths.py both have a seed.

// A sentence that DENIES a forbidden claim is the model stated correctly, not
// broken. "Light does not deliver energy into you" matches on light plus
// energy and is the claim we want on the page. This is not a keyword exception
// and it stays narrow: an explicit negation or a refusal verb, in the same
// sentence.
const NEGATION = new RegExp(
  '\\b(not|never|no|cannot|does not|do not|is not|are not|without|' +
  'forbidden|prohibited|refus\\w*|declin\\w*|withdrew|withdrawn|' +
  'superseded|not accepted|no evidence|unevidenced|error|mistake|wrong|' +
  'myth|disqualif\\w*|would commit|must not|may not|rather than)\\b', 'i');

// A subject and a predicate 200 characters apart are two unrelated labels, not
// a claim. Same constant as the Python audit.
const PROXIMITY = 120;

export const PATTERNS = [
  {
    name: 'antioxidant-as-mitochondrial-energy',
    clause: 'rule 6: no claim that antioxidant content, ORAC value or redox ' +
            'potential is an energy input to mitochondria',
    subject: '\\b(antioxidant\\w*|ORAC|polyphenol\\w*|flavonoid\\w*|redox potential|' +
             'electrochemical|reducing capacity)\\b',
    predicate: '\\b(energy input|fuel\\w*|power\\w*|charge\\w*|energi[sz]\\w*|' +
               'feed\\w*|deliver\\w*|donat\\w*)\\b.{0,40}\\b(mitochondri\\w*|cell\\w*|ATP|body)\\b' +
               '|\\b(mitochondri\\w*|ATP)\\b.{0,40}\\b(energy|fuel|power)\\b',
    canary: 'The antioxidants in the berries deliver energy to your mitochondria.',
  },
  {
    name: 'summer-food-carries-more-energy',
    clause: 'rule 6: no presentation of seasonal eating as summer food carrying more energy',
    subject: '\\b(summer|seasonal|in.season|out.of.season)\\b.{0,40}\\b(food|fruit|produce|berr\\w*|veg\\w*)\\b' +
             '|\\b(food|fruit|produce|berr\\w*)\\b.{0,30}\\b(summer|season\\w*)\\b',
    predicate: '\\b(more energy|higher energy|more antioxidant\\w*|richer|' +
               'carries? (more|a message|information)|energy electron\\w*|' +
               'higher.energy electron\\w*)\\b',
    canary: 'Summer fruit carries more energy than winter fruit.',
  },
  {
    name: 'structured-or-energized-water',
    clause: 'rule 6: no claim that a particular water is structured, energized or informational',
    phrase: '\\b(structured|energi[sz]ed|informational|hexagonal|ionized)\\s+water\\b' +
            '|\\bwater\\s+(is|are|was|becomes|gets)\\s+' +
            '(structured|energi[sz]ed|informational|ordered into)\\b' +
            '|\\bwater\\s+(remembers|stores? information|holds? information|has memory)\\b' +
            '|\\bexclusion.zone water\\b|\\bfourth phase of water\\b|\\bEZ water\\b',
    unless: '\\bthe term\\b|Pollack|<i>|comes from\\b|\\bnot accepted\\b' +
            '|Beyond Solid, Liquid and Vapor',
    canary: 'Drinking structured water changes your cells.',
  },
  {
    name: 'sunlight-charges-the-body',
    clause: 'rule 8: still forbidden, that sunlight charges the body the way a charger fills a phone',
    subject: '\\b(sun|sunlight|light|photon\\w*)\\b',
    predicate: '\\b(charge[sd]?|charging|recharge\\w*|fill\\w*)\\b.{0,30}' +
               '\\b(you|your body|the body|your batter\\w*|cells?)\\b',
    canary: 'Morning sunlight charges your body the way a charger fills a phone.',
  },
  {
    name: 'coverage-or-n-of-eight',
    clause: 'rule 8d: no surface presents a participant\u2019s score as incomplete on their account',
    subject: '\\b(the model|composite|batter\\w* score|your score|dimensions?)\\b',
    predicate: '\\b\\d+\\s*(of|/)\\s*(8|eight)\\b|\\bcoverage of the model\\b' +
               '|\\bpercent of the model\\b|\\bcovers?\\b[^.]{0,30}\\b(of|/)\\s*(8|eight)\\b' +
               '|\\bincomplete\\b',
    canary: 'Your score covers 5 of 8 dimensions.',
  },
  {
    name: 'vitamin-d-as-light-exposure-proxy',
    clause: 'rule 8: vitamin D is not a proxy for light exposure',
    subject: '\\b(vitamin ?d|25.oh|serum d)\\b',
    predicate: '\\b(proxy|measure\\w*|tells? us|indicat\\w*|stands? in)\\b.{0,40}\\b(light|sun\\w*|exposure)\\b',
    unless: '\\bon the panel\\b|\\breferable\\b|\\bsupplement\\w*\\b',
    canary: 'We use vitamin D as a proxy for your light exposure.',
  },
  {
    name: 'd3-outside-the-vitamin-d-sentence',
    clause: 'rule 8e: no supplement recommendation, and D3 outside the skin-synthesis sentence is one',
    subject: '\\bD3\\b',
    predicate: '.',
    unless: 'sun is not available, D3 may be needed|previtamin D3|cholecalciferol' +
            '|D3 is made in the skin|skin makes|[\\-"/]d3\\b|\\bd3["\\-/]',
    canary: 'Take D3 at 5,000 IU with breakfast.',
  },
  {
    name: 'supplement-brand-or-price-where-an-agent-can-say-it',
    clause: 'rule 3c: a deliverable names a specification, not a brand',
    phrase: 'Dragon Herbs|Pure Encapsulations|Life Extension|BioPure|Gaia Herbs|' +
            'Quicksilver|Thorne|Nutrex|Sun Chlorella|Vital Proteins|Cowboy Colostrum|' +
            'BLUblox|BlockBlueLight|Bon Charge|Ra Optics|TrueDark|Ocushield|' +
            'Crazy Water|Saratoga|Icelandic Glacial|Ice Barrel|SaunaSpace|' +
            'Any Lab Test Now|Labcorp|Ulta Lab',
    canary: 'Take Dragon Herbs Super Adaptogen, 3 capsules each morning.',
  },
  {
    name: 'price-in-text-an-agent-retrieves',
    clause: 'rule 3d: no price, ever, in anything an agent can retrieve and say',
    phrase: '\\$\\s?\\d',
    literal: true,
    canary: 'The kit is $109.95 and you order it yourself.',
  },
  {
    name: 'em-dash-in-user-facing-text',
    clause: 'rule 12: no em dashes in anything a client reads',
    phrase: '\u2014',
    literal: true,
    canary: 'The battery is trillions of cells \u2014 not one.',
  },
  {
    name: 'measuring-cellular-charge-or-redox',
    clause: 'rule 8d: charge, redox and leak have no instrument and are never measured',
    subject: '\\b(we|this|your|the (test|panel|score))\\b',
    predicate: '\\b(measur\\w+|read\\w+|report\\w+|show\\w+)\\b.{0,40}\\b(your|participant.s|the client.s)?\\s*' +
               '(cellular charge|membrane potential|redox state|mitochondrial redox)\\b',
    canary: 'We measure your mitochondrial redox state from the panel.',
  },
];

// Prose only here: a summary is never a file, so there are no tags, no SQL
// comments and no inline styles to lift out. Split on sentence ends and blank
// lines, and ignore fragments, exactly as the Python audit does.
export function sentences(text) {
  const out = [];
  for (const raw of String(text || '').split(/(?<=[.!?])\s+|\n\n+/)) {
    const s = raw.split(/\s+/).filter(Boolean).join(' ');
    if (s.length >= 12) out.push(s);
  }
  return out;
}

function hits(sentence, pat) {
  if (pat.unless && new RegExp(pat.unless, 'i').test(sentence)) return false;
  if (pat.phrase) {
    if (!new RegExp(pat.phrase, 'i').test(sentence)) return false;
    // A literal banned string is banned whatever surrounds it. The negation
    // guard makes sense for a claim and no sense for a price or an em dash.
    if (pat.literal) return true;
    return !NEGATION.test(sentence);
  }
  const subs = [...sentence.matchAll(new RegExp(pat.subject, 'gi'))];
  const preds = [...sentence.matchAll(new RegExp(pat.predicate, 'gi'))];
  if (!subs.length || !preds.length) return false;
  const near = subs.some((s) => preds.some((p) => Math.abs(s.index - p.index) <= PROXIMITY));
  if (!near) return false;
  return !NEGATION.test(sentence);
}

/**
 * Audit one piece of prose.
 *
 * Returns every sentence that trips a pattern, with the pattern and the clause
 * it breaks, so the caller can tell the model WHAT to rewrite rather than
 * handing it back a bare refusal.
 *
 * @returns {{ok: boolean, findings: Array<{pattern: string, clause: string, sentence: string}>}}
 */
export function auditClaimShape(text) {
  const findings = [];
  for (const s of sentences(text)) {
    for (const pat of PATTERNS) {
      if (hits(s, pat)) {
        findings.push({ pattern: pat.name, clause: pat.clause, sentence: s });
      }
    }
  }
  return { ok: findings.length === 0, findings };
}

/**
 * Every pattern, fired against its own canary.
 *
 * A pattern whose canary does NOT trip is broken, and a broken pattern is
 * worse than a missing one because it reports clean.
 */
export function auditCanaries() {
  const broken = [];
  for (const pat of PATTERNS) {
    const r = auditClaimShape(pat.canary);
    if (!r.findings.some((f) => f.pattern === pat.name)) broken.push(pat.name);
  }
  return { ok: broken.length === 0, broken, total: PATTERNS.length };
}
