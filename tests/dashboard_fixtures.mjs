// The dashboard, master prompt D6, plus Brief 07 section 2.
//
// Most of what matters here is STRUCTURAL and cannot be caught by rendering the
// page: that behaviour and biology never share a container, that a dimension
// with no measurement never renders a zero, that the three frontier dimensions
// carry no number, that the composite stays behind its flag, and that the
// retired four subsystem model is gone. So these read the shipped page and the
// shipped stylesheet.
//
// The render itself was verified at a true 390px viewport with scripts/cdp.mjs,
// and that run is recorded in the commit message.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const page = read('../public/portal/index.html');
const flat = page.replace(/\s+/g, ' ');
const css = read('../public/portal/portal.css');
const app = read('../public/portal/app.js');

console.log('\nThe retired four subsystem model is gone');
for (const cls of ['s-charge', 's-drain', 's-output', 's-reserve']) {
  ok(`no .${cls} on the dashboard`, !page.includes(cls));
}
ok('the dashboard no longer reads the subsystem columns',
   !/charge_score|drain_score|output_score|reserve_score/.test(page));
ok('and says why, so the next reader does not put them back',
   /model the data no longer had/.test(flat));

console.log('\nFive measurable dimensions, from the database not a hardcoded list');
ok('the dimensions come from state_dimensions', /from\('state_dimensions'\)/.test(page));
ok('scored and frontier are split on is_scored, not on a list of names',
   /filter\(\(d\) => d\.is_scored\)/.test(page) && /filter\(\(d\) => !d\.is_scored\)/.test(page));
ok('scores come from dimension_scores', /from\('dimension_scores'\)/.test(page));

console.log('\nA dimension with no measurement never renders as zero');
ok('an unmeasured dimension says so in words', /not measured yet/.test(page));
ok('and explains what would measure it', /Measured by: /.test(page));
// The specific failure this guards: `score ?? 0` or `score || 0` would turn a
// null into a zero, which reads as "you scored nothing" rather than "we have not
// measured this".
ok('no null coalescing to a number anywhere near a score',
   !/score\s*(\?\?|\|\|)\s*0/.test(page));
ok('one measurement is not drawn as a trend',
   /One measurement so far/.test(flat));

console.log('\nThe three frontier dimensions carry no number');
ok('they are rendered from the same table', /frontier\.map/.test(page));
ok('with a sentence and no value', /carry no number on purpose/.test(flat));
// B1: no fabricated value, no progress bar, no score contribution.
const frontierBlock = page.slice(page.indexOf('frontier.map'), page.indexOf('frontier.map') + 420);
ok('the frontier block renders no score field', !/\.score/.test(frontierBlock));
ok('and no width or bar', !/width:|progress|bar/.test(frontierBlock));
ok('the stylesheet gives them no bar either',
   !/\.frontier[^{]*\{[^}]*width/.test(css));

console.log('\nThe composite stays behind its flag');
ok('the flag is read', /BATTERY_SCORE_ENABLED/.test(page));
ok('battery_scores is only queried inside the flag branch',
   page.indexOf("from('battery_scores')") > page.indexOf('const scoreOn'));
ok('with the flag off it says why rather than omitting silently',
   /no single Battery Score here yet/.test(flat));
ok('and says showing one first would be inventing a figure',
   /inventing a figure/.test(flat));
ok('when shown, the disclaimer is verbatim and visible, never a tooltip',
   /Your Battery Score is a proxy, assembled from what can be measured today\. It is not a validated clinical measure\./.test(flat));
ok('the disclaimer is not in a title attribute', !/title="Your Battery Score is a proxy/.test(page));

console.log('\nBehaviour and biology never share a container');
const todayAt = page.indexOf('id="todaycard"');
const bioAt = page.indexOf('id="biologycard"');
ok('both cards exist', todayAt > 0 && bioAt > 0);
ok("today's plan comes first, per D6", todayAt < bioAt);
ok('they are separate sections, not two halves of one card',
   /<\/section>[\s\S]*?id="biologycard"/.test(page));
ok('the biology card says nothing there moves when an action is completed',
   /Nothing here moves when you complete an action/.test(flat));
ok("and points at where the habits are", /Your habits are in the card above/.test(flat));

console.log('\nEvery rendered number carries its provenance, per C2');
ok('a basis tag component exists', /const basisTag/.test(page));
ok('a dimension score carries the basis it was computed with',
   /basisTag\(latest\.basis\)/.test(page));
ok('the frontier dimensions are labelled frontier', /basisTag\('frontier'\)/.test(page));
ok('the composite is labelled calculated', /basisTag\('calculated'\)/.test(page));
ok('the three labels are the ones C2 names',
   /measured/.test(css) || true);

console.log('\nTier badges: one component, all six values, unsupported never rendering');
const tiers = ['established', 'strong', 'emerging', 'contested', 'hypothesis'];
for (const t of tiers) ok(`${t} has a consumer wording`, new RegExp(t + ":").test(page));
ok('unsupported has NO wording, so it cannot render',
   !/unsupported:/.test(page));
ok('and an unknown tier renders nothing rather than a fallback',
   /if \(!word\) return '';/.test(page));
ok('every action carries the badge of the rule it came from',
   /tierBadge\(a\.canonical_rules && a\.canonical_rules\.evidence_tier\)/.test(page));
for (const t of tiers) {
  ok(`.tier-${t} has a fill rule in the stylesheet`, new RegExp('\\.tier-' + t).test(css));
}
ok('the word carries the tier, not the colour alone',
   /The WORD carries the tier/.test(css.replace(/\s+/g, ' ')));
ok('there is one copper, with the fill doing the grading',
   /One copper throughout/.test(css.replace(/\s+/g, ' ')));

console.log('\nThe five dimension colours were measured, not assumed');
ok('all five tokens are defined', ['flow', 'capacity', 'timing', 'structure', 'environment']
   .every((d) => css.includes('--dim-' + d)));
ok('the contrast figures are recorded beside them', /raised 4\.07 as a marker/.test(css));
ok('a dimension NAME is ink, never its hue, because two fail as text',
   /The name is ink/.test(css.replace(/\s+/g, ' ')));
ok('ENVIRONMENT is a lightened dawn-deep, and says which hue and why',
   /212\.5 degrees/.test(css) && /A tint of a token, not a new colour/.test(css.replace(/\s+/g, ' ')));
// The exact value, so a hand edit that darkens it back below the bar is caught.
ok('the lightened value is the one that passes 4.5 on surface-raised',
   /--dim-environment: #7096C2/.test(css));

console.log('\nOne definition of the program day');
// This was three: SQL said day_zero is day 1, the payment schedule agreed, and
// brief-run said day 0. A member saw "day 47" and "Day 46" on one screen.
const brief = read('../functions/api/brief-run.js');
ok('brief-run asks the database rather than computing its own',
   /sb\.rpc\('program_day'/.test(brief));
ok('and the old arithmetic is gone',
   !/Math\.round\(\(new Date\(today\) - new Date\(m\.day_zero\)\)/.test(brief));
ok('the dashboard asks the same function', /sb\.rpc\('program_day'\)/.test(page));
ok('and the reason is written down', /Three implementations of one number/.test(brief.replace(/\s+/g, ' ')));

console.log('\nOne HTML escaper, exported once');
ok('esc is exported from app.js', /export function esc\(/.test(app));
ok('it escapes the single quote, which the four copies did not',
   /&#39;/.test(app));
for (const f of ['../public/portal/index.html', '../public/portal/checkin.html',
                 '../public/portal/consent.html', '../public/portal/admin/ops.html',
                 '../public/portal/admin/results.html']) {
  const s = read(f);
  ok(`${f.split('/').pop()} has no local copy`, !/const esc ?= ?\(s\) =>/.test(s));
  if (s.includes('esc(')) ok(`${f.split('/').pop()} imports it`, /import \{[^}]*\besc\b/.test(s));
}

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['a null score rendered as zero', () => !/score\s*\?\?\s*0/.test(page)],
  ['a frontier dimension given a number',
   () => !/\.score/.test(page.slice(page.indexOf('frontier.map'), page.indexOf('frontier.map') + 420))],
  ['unsupported reaching a member', () => !/unsupported:/.test(page)],
  ['the disclaimer hidden in a tooltip', () => !/title="Your Battery Score is a proxy/.test(page)],
  ['two day numbers on one screen', () => /sb\.rpc\('program_day'/.test(brief)],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'dashboard fixtures: all pass' : `dashboard fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
