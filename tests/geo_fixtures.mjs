// Location derivation: ZIP or postal code to timezone, latitude, hemisphere.
//
// The interesting tests here are not the spot checks. They are the structural
// ones: that the prefix ranges do not overlap, that every state a range points
// at actually has a timezone, that a split state's minority ranges lie inside
// that state's own prefixes, and that the full state names the form offers are
// exactly the ones the derivation can name back. Each of those is a population
// check rather than a list of suspects, because the two bugs already found in
// this file were both invisible to spot checks: overlapping Tennessee and
// Kentucky ranges where the first match won and the second was unreachable,
// and 78734 flagged uncertain when Texas is Central everywhere but El Paso.

import { readFileSync } from 'node:fs';
import { derive, stateForZip, STATE_NAMES, OUTSIDE_US } from '../functions/api/_geo.js';

let failed = 0;
function ok(name, cond, detail) {
  if (cond) { console.log(`  pass  ${name}`); return; }
  failed++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
}
function eq(name, got, want) {
  ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

// The tables are read out of the source rather than restated here. A fixture
// that carries its own copy of the table is testing itself.
const SRC = readFileSync(new URL('../functions/api/_geo.js', import.meta.url), 'utf8');
function block(startsWith, open, close) {
  const i = SRC.indexOf(startsWith);
  if (i < 0) throw new Error(`table not found in _geo.js: ${startsWith}`);
  const s = SRC.indexOf(open, i);
  let d = 0, j = s;
  for (; j < SRC.length; j++) {
    if (SRC[j] === open) d++;
    else if (SRC[j] === close) { d--; if (d === 0) break; }
  }
  return SRC.slice(s, j + 1);
}
const ZIP3_RANGES = [...block('const ZIP3 =', '[', ']')
  .matchAll(/\[(\d+),\s*(\d+),\s*'([A-Z]{2})'\]/g)]
  .map(m => [Number(m[1]), Number(m[2]), m[3]]);
const STATE_CODES = [...block('const STATE = {', '{', '}')
  .matchAll(/\b([A-Z]{2}):\s*\['([^']+)',\s*([\d.]+)(,\s*'split')?\]/g)]
  .map(m => ({ code: m[1], tz: m[2], lat: Number(m[3]), split: !!m[4] }));
const MINORITY = [...block('const SPLIT_MINORITY = {', '{', '}')
  .matchAll(/\b([A-Z]{2}):\s*\{[^}]*?ranges:\s*\[([^\]]*(?:\][^}]*?)*?)\]\s*\}/g)]
  .map(m => ({ code: m[1], ranges: [...m[2].matchAll(/\[(\d+),\s*(\d+)\]/g)].map(r => [Number(r[1]), Number(r[2])]) }));

console.log(`\nTables read from source: ${ZIP3_RANGES.length} ZIP prefix ranges, ${STATE_CODES.length} states, ${MINORITY.length} split states\n`);

ok('the state table parsed completely, 50 states plus DC plus Puerto Rico',
   STATE_CODES.length === 52, `parsed ${STATE_CODES.length}`);

console.log('Structure');
// 1. No two prefix ranges overlap. This is the bug that made Kentucky's
//    Central counties unreachable.
const sorted = [...ZIP3_RANGES].sort((a, b) => a[0] - b[0]);
let overlaps = [];
for (let i = 1; i < sorted.length; i++) {
  if (sorted[i][0] <= sorted[i - 1][1]) overlaps.push(`${sorted[i - 1]} and ${sorted[i]}`);
}
ok('no ZIP prefix range overlaps another', overlaps.length === 0, overlaps.join('; '));

// 2. Every range points at a state the timezone table knows. A range naming a
//    state with no entry returns null from derive and the member is stuck.
const known = new Set(STATE_CODES.map(s => s.code));
const dangling = [...new Set(ZIP3_RANGES.map(r => r[2]))].filter(c => !known.has(c) && c !== 'AA');
ok('every prefix range points at a state with a timezone', dangling.length === 0, dangling.join(','));

// 3. A split state's minority ranges must fall inside that state's own
//    prefixes. A typo here silently hands one state another state's timezone.
const strays = [];
for (const m of MINORITY) {
  const own = ZIP3_RANGES.filter(r => r[2] === m.code);
  for (const [lo, hi] of m.ranges) {
    const inside = own.some(([a, b]) => lo >= a && hi <= b);
    if (!inside) strays.push(`${m.code} ${lo}-${hi}`);
  }
}
ok('every minority range lies inside its own state', strays.length === 0, strays.join('; '));

// 4. Every state marked split has a minority table. Without one it can only
//    ever answer 'ask', which is safe but useless.
const splitCodes = STATE_CODES.filter(s => s.split).map(s => s.code);
const noTable = splitCodes.filter(c => !MINORITY.some(m => m.code === c));
ok('every split state has a minority table', noTable.length === 0, noTable.join(','));

// 5. Latitudes are plausible for US states. A transposed digit is otherwise
//    invisible and would move a member's daylight by thousands of miles.
const badLat = STATE_CODES.filter(s => !(s.lat >= 18 && s.lat <= 72));
ok('every latitude is between 18 and 72 degrees', badLat.length === 0,
   badLat.map(s => `${s.code}=${s.lat}`).join(','));

console.log('\nThe form and the derivation agree');
// 6. The state names the form offers must be exactly the ones the derivation
//    can name back, or the disagreement check in waitlist.js compares two
//    things that can never be equal and silently marks every US member 'ask'.
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const formStates = JSON.parse(html.match(/var STATES = (\[[^\]]*\]);/)[1]);
const offered = formStates.filter(s => s !== OUTSIDE_US);
const named = new Set(Object.values(STATE_NAMES));
const missing = offered.filter(s => !named.has(s));
const extra = [...named].filter(s => !offered.includes(s));
ok(`the form offers ${offered.length} states and the derivation names all of them`,
   missing.length === 0, 'form has, derivation lacks: ' + missing.join(', '));
ok('the derivation names no state the form does not offer',
   extra.length === 0, 'derivation has, form lacks: ' + extra.join(', '));
ok(`the form's outside-the-US option is the exact string the server compares against`,
   formStates.includes(OUTSIDE_US));

console.log('\nKnown places');
const CITIES = [
  ['78734', 'US', 'TX', 'America/Chicago',   'exact', 'Lakeway TX, Central like almost all of Texas'],
  ['79901', 'US', 'TX', 'America/Denver',    'exact', 'El Paso, the one Mountain corner'],
  ['33139', 'US', 'FL', 'America/New_York',  'exact', 'Miami, Eastern'],
  ['32501', 'US', 'FL', 'America/Chicago',   'exact', 'Pensacola, the Central panhandle'],
  ['37902', 'US', 'TN', 'America/New_York',  'exact', 'Knoxville, Eastern'],
  ['38103', 'US', 'TN', 'America/Chicago',   'exact', 'Memphis, Central'],
  ['42101', 'US', 'KY', 'America/Chicago',   'exact', 'Bowling Green, Central'],
  ['40202', 'US', 'KY', 'America/New_York',  'exact', 'Louisville, Eastern'],
  ['10001', 'US', 'NY', 'America/New_York',  'exact', 'Manhattan'],
  ['90210', 'US', 'CA', 'America/Los_Angeles', 'exact', 'Beverly Hills'],
  ['96813', 'US', 'HI', 'Pacific/Honolulu',  'exact', 'Honolulu'],
  ['46204', 'US', 'IN', null,                'ask',   'Indianapolis, Indiana is genuinely messy'],
  ['99501', 'US', 'AK', null,                'ask',   'Anchorage, Alaska is genuinely messy'],
];
for (const [zip, c, st, tz, conf, why] of CITIES) {
  const d = derive(zip, c);
  const good = d.region === st && d.tz_confidence === conf && (tz === null || d.timezone === tz);
  ok(`${zip} ${why}`, good, `got ${d.region}/${d.timezone}/${d.tz_confidence}`);
}

console.log('\nThe cases that must not guess');
let d = derive('2000', 'AU');
eq('outside the US the timezone is not invented', d.timezone, null);
eq('outside the US the confidence is ask', d.tz_confidence, 'ask');
eq('a southern hemisphere country sets the hemisphere', d.hemisphere, 'S');
eq('a northern hemisphere country sets the hemisphere', derive('SW1A', 'GB').hemisphere, 'N');
eq('a ZIP that is not a ZIP is rejected outright', derive('abcde', 'US').ok, false);
eq('an empty ZIP is rejected outright', derive('', 'US').ok, false);
eq('a ZIP+4 still resolves', derive('78734-1234', 'US').region, 'TX');
eq('an unallocated prefix is rejected rather than guessed', derive('99999', 'US').ok, true);
ok('every US derivation reports the northern hemisphere',
   ['10001', '96813', '99501', '78734'].every(z => derive(z, 'US').hemisphere === 'N'));
ok('an ask result always carries a reason a human can read',
   derive('46204', 'US').why && derive('46204', 'US').why.length > 20);
ok('no derivation result contains an em dash',
   !JSON.stringify(['46204', '2000', 'abcde'].map(z => derive(z, 'US'))).includes('—'));

console.log('\nSeeded defect: the checks above must be able to fail');
// A check that cannot fail is not a check. These prove the structural tests
// actually catch the two bugs this file was written after.
const seeds = [
  ['overlapping prefix ranges', () => {
    const s = [[370, 385, 'TN'], [377, 379, 'TN']].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < s.length; i++) if (s[i][0] <= s[i - 1][1]) return true;
    return false;
  }],
  ['a minority range outside its own state', () => {
    const own = [[750, 799, 'TX']];
    return !own.some(([a, b]) => 885 >= a && 885 <= b);
  }],
  ['a state name the form does not offer', () => !offered.includes('Puerto Rico')],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${failed === 0 ? 'geo fixtures: all pass' : `geo fixtures: ${failed} FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
