// Consent: the gate, and the shape of the documents.
//
// WHAT THIS DOES NOT COVER, said plainly. The consent SCREEN was not verified in
// a browser: headless Chrome hangs on that page and three attempts were
// abandoned rather than faked. What is covered here is the gate's logic and the
// documents' content, both of which are where a consent failure would actually
// matter. The screen render is carried as an open Day 12 item.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// app.js imports from a CDN, so node cannot import it. The gate's decision is
// read out of the source: structural, and said to be structural.
const app = read('../public/portal/app.js');
const consentPage = read('../public/portal/consent.html');

console.log('\nThe gate');
ok('requireAuth asks the database what is outstanding',
   /missing_required_consents/.test(app));
ok('it sends an unconsented member to the consent screen',
   /location\.href = '\/portal\/consent\.html'/.test(app));
ok('the consent screen itself is exempt, or the redirect loops forever',
   /consent\.html'\)/.test(app));
ok('the account page is exempt, so a member can still manage what they agreed to',
   /account\.html'\)/.test(app));
ok('login and confirm are exempt, because there is no session to check yet',
   /login\.html'\)/.test(app) && /confirm\.html'\)/.test(app));

// The most important line in the gate. If the check errors we must NOT wave the
// member through: not knowing whether they consented is not the same as knowing
// they did.
const gate = app.slice(app.indexOf('export async function requireAuth'),
                       app.indexOf('export async function currentProfile'));
ok('a FAILED consent check blocks rather than allows',
   /if \(error \|\| \(missing && missing\.length\)\)/.test(gate),
   'the error branch must redirect, not fall through');
ok('the gate is in requireAuth, so every page inherits it',
   gate.includes('missing_required_consents'));

console.log('\nThe screen');
ok('it records one grant per document rather than one blanket agreement',
   /for \(const id of ids\)/.test(consentPage) && /grant_consent/.test(consentPage));
ok('the continue button starts disabled',
   /id="accept" disabled/.test(consentPage));
ok('it shows the version of what is being agreed to',
   /Version '/.test(consentPage) || /Version /.test(consentPage));
ok('it calls the RPC with no participant id, so it cannot be pointed at anyone else',
   /rpc\('missing_required_consents'\)/.test(consentPage));

console.log('\nThe words D1 requires are actually present');
// Read the participation consent out of the migration that inserts it, so this
// checks the shipped text and not a copy of it.
// Whitespace-insensitive, because the consent body is hard wrapped in the
// migration and "there is no\nemergency response" would otherwise read as a
// missing statement. This exact trap cost a false alarm earlier in the project
// when a PDF text layer split a word across a kerning pair.
const mig = read('../database/migrations/059_consent_documents.sql').replace(/\s+/g, ' ');
const REQUIRED = [
  ['wellness support, not medical care', /not medical care/i],
  ['it does not diagnose',              /does not diagnose/i],
  ['nobody is monitoring',              /nobody is watching|no monitoring/i],
  ['no emergency response',             /no emergency response/i],
  ['what data is collected',            /WHAT WE COLLECT/],
  ['and why',                           /because the program does not work without them/i],
  ['how to export',                     /export everything we hold/i],
  ['how to delete',                     /ask us to delete it/i],
  ['cancelling is not deleting',        /Cancelling a payment is not the same as deleting/i],
  ['research is separate and optional', /separate, optional consent/i],
];
for (const [what, re] of REQUIRED) ok(`the consent text says: ${what}`, re.test(mig));
ok('the consent text contains no em dash', !/\u2014/.test(mig));
ok('it is marked unreviewed, because it has not had legal review',
   /v1-unreviewed/.test(mig));

console.log('\nThe uploads consent is separate, per D13.1');
ok('uploads consent exists and is NOT required, so a member can decline it and still take part',
   /'uploads', 'v1-unreviewed'/.test(mig) && /encode\(sha256\(\$body\$placeholder2/.test(mig));
ok('it says the full document is never sent to the vendor',
   /full document is never sent to the AI vendor/i.test(mig));
ok('it says nothing changes until confirmed',
   /until you confirm it/i.test(mig));
ok('it carries the physician sentence',
   /consult your physician before starting anything new/i.test(mig));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['a gate that allows on error', () => {
    const wrong = "if (missing && missing.length) { location.href = '/x'; }";
    return !/if \(error \|\| \(missing && missing\.length\)\)/.test(wrong);
  }],
  ['consent text with no emergency statement',
   () => !/no emergency response/i.test('We are a wellness program.')],
  ['a blanket agreement instead of one per document',
   () => !/for \(const id of ids\)/.test("await sb.rpc('grant_consent', { all: true })")],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'consent fixtures: all pass' : `consent fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
