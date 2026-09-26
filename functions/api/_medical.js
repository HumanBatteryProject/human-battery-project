// The medical boundary, as a classifier that runs BEFORE retrieval.
//
// Brief 06 section 4 rule 4 is explicit that this is a step and not a hope in
// the system prompt. The reason is that a system prompt is advisory: the model
// can be argued out of it by a persuasive question, and the failure is silent
// and per-conversation. A classifier in front of retrieval cannot be argued
// with, because the model never sees the question when it fires.
//
// The screening table lives in docs/HBP-Protocol-Complete.md and is the same
// eight rows shipped to every client. It is duplicated here rather than
// fetched, because this path must work when the database is unreachable, and
// a medical boundary that fails open is worse than no boundary at all.
// SCREENING_SHA is checked against the document by tests/coach_fixtures.py so
// the copy cannot drift from the source without something saying so.

export const SCREENING_ROWS = [
  { key: 'anticoagulants', on: 'Anticoagulants',
    flag: 'The oily fish target, which is a real omega-3 load from food. Physician clearance.',
    match: /\bwarfarin|coumadin|anticoagul|blood thinn|eliquis|apixaban|xarelto|rivaroxaban\b/i },
  { key: 'thyroid_medication', on: 'Thyroid medication',
    flag: 'Any eating window change: levothyroxine is taken fasting and a moved window moves the dose. Physician clearance.',
    match: /\bthyroid|levothyroxine|synthroid|armour thyroid|liothyronine\b/i },
  { key: 'blood_pressure_medication', on: 'Blood pressure medication',
    flag: 'Sauna and cold, both of which move blood pressure acutely. Physician clearance.',
    match: /\bblood pressure|antihypertens|lisinopril|amlodipine|losartan|metoprolol|beta blocker\b/i },
  { key: 'diabetes_medication', on: 'Diabetes medication',
    flag: 'Any eating window change. Physician clearance.',
    match: /\bdiabet|metformin|insulin (?:dose|injection|pump)|glipizide|ozempic|semaglutide|jardiance\b/i },
  { key: 'lithium', on: 'Lithium',
    flag: 'Sauna and heavy sweating, which concentrate the drug. Physician clearance.',
    match: /\blithium\b/i },
  { key: 'diuretics_or_sodium_restriction', on: 'Diuretics, or a sodium-restricted diet',
    flag: 'The morning glass and the salt added to every bottle. Physician clearance.',
    match: /\bdiuretic|furosemide|lasix|hydrochlorothiazide|spironolactone|low[- ]sodium|salt[- ]restrict/i },
  { key: 'heart_failure_or_fluid_restriction', on: 'Heart failure, or fluid restriction',
    flag: 'Three liters a day. Physician clearance.',
    match: /\bheart failure|chf\b|fluid restrict|congestive\b/i },
  { key: 'bipolar_diagnosis', on: 'Bipolar diagnosis',
    flag: 'Morning light exposure and the fixed wake time, both of which shift circadian phase and can destabilize mood. Physician clearance.',
    match: /\bbipolar|manic|mania\b/i },
];

// Every screening key, as a Set, so a canonical rule's contraindication list can
// be validated against what actually exists. The seed was written with invented
// keys like 'anticoagulant' and 'levothyroxine' that matched nothing in this
// table, which would have made the safety gate a no-op: it would have looked for
// flags that could never be raised and let every action through.
export const SCREENING_KEYS = new Set(SCREENING_ROWS.map(r => r.key));

export function screeningRowFor(key) {
  return SCREENING_ROWS.find(r => r.key === key) || null;
}

// Which screening keys a free text answer raises.
export function flagsFromText(text) {
  const s = String(text || '');
  return SCREENING_ROWS.filter(r => r.match.test(s)).map(r => r.key);
}

// Anything that asks the coach to practise medicine, whether or not a drug is
// named. These route regardless of the table.
const PRACTICE = new RegExp([
  '\\b(should|can|could|may|do) i (stop|start|skip|halve|double|reduce|increase|come off|quit)\\b',
  '\\bchange my (dose|medication|prescription|meds?)\\b',
  '\\b(dose|dosage|mg|milligram)s? of my\\b',
  '\\bdo i have\\b|\\bam i (diabetic|hypothyroid|insulin resistant|depressed)\\b',
  '\\bdiagnos(e|is|ed)\\b',
  '\\bis (this|that) (cancer|diabetes|thyroid|a heart attack)\\b',
  '\\bwean off\\b|\\btaper\\b',
].join('|'), 'i');

// Symptoms that are not a routing question but an emergency. The program's
// own stop-and-refer list, verbatim from the protocol.
const URGENT = /\bchest pain|fainting|faint(ed|ing)?\b|short(ness)? of breath at rest|blood pressure over 160|glucose over 200|new neurological|numbness|slurred speech|weakness on one side/i;

export function classify(question) {
  const q = String(question || '');
  if (URGENT.test(q)) {
    return { route: 'urgent', rows: [], reason: 'stop-and-refer symptom named' };
  }
  const rows = SCREENING_ROWS.filter(r => r.match.test(q));
  if (rows.length) {
    return { route: 'prescriber', rows, reason: 'screening table row matched' };
  }
  if (PRACTICE.test(q)) {
    return { route: 'prescriber', rows: [], reason: 'asks the coach to practise medicine' };
  }
  return { route: 'coach', rows: [], reason: null };
}

export function prescriberReply(rows) {
  // D1: nothing here may imply that a clinician is watching. "I can tell you why
  // the program flags it" is fine; what would not be fine is any suggestion that
  // this conversation reaches a person, or that somebody will follow it up.
  const head = 'That one is for your prescriber, not for me. I can tell you why the program flags it, ' +
    'but nobody here is reading this as you type it and nobody here will follow it up.';
  if (!rows.length) {
    return head + '\n\nBring it to them before you change anything. If it is urgent, call them today.';
  }
  const quoted = rows.map(r => 'On ' + r.on + ': ' + r.flag).join('\n');
  return head + '\n\n' + quoted +
    '\n\nThat row is in your protocol document under the screening section. Take it with you.';
}

export const URGENT_REPLY =
  'Stop and seek medical care now. What you have described is on the list the program ' +
  'treats as urgent: chest pain, fainting, shortness of breath at rest, blood pressure ' +
  'over 160 over 100, glucose over 200, or any new neurological symptom. ' +
  'This is not something to bring to the weekly call. Call your physician or emergency services today. ' +
  // The sentence that has to be here. Telling somebody to seek care, without
  // this, reads as though writing it here counts as raising it with someone. It
  // does not. Nothing here alerts anybody.
  'Writing it here does not alert anyone. This software is not monitored and cannot send help.';
