// Resolving a held lab result.
//
// A held row is one the analysis agent refused to score. The hold itself was
// built and works; what did not exist was any way to clear one, so two rows
// sat invisible. These fixtures guard the part that rots silently: the set of
// reasons a row can be held for is declared in a database constraint, produced
// by normalize(), and worded in two places. If those four sets drift, the
// admin screen shows a raw code like "unconvertible_unit" to a person who has
// to make a medical judgement from it, and nothing fails.
//
// This is the "enumerate the population" rule applied to a set that lives in
// four files. Reading all four and comparing them is the only check that can
// notice a fifth reason being added to three of them.

import { readFileSync } from 'node:fs';
import { normalize, CANONICAL } from '../functions/api/_units.js';

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  failed++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// 1. The database constraint is the authority on what a reason can be.
const mig = read('../database/migrations/038_analysis.sql');
const constraint = mig.match(/reason\s+text\s+not null[\s\S]*?\(([^)]*'implausible_value'[^)]*)\)/);
const DB_REASONS = [...constraint[1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();

// 2. What normalize() can actually produce. Derived by running it, not by
//    reading it, so a branch that returns a reason nobody declared is caught.
const PRODUCED = new Set();
const slug = Object.keys(CANONICAL)[0];
for (const [v, u] of [['x', 'mg/dL'], [5, ''], [5, 'furlongs'], ['', 'mg/dL'], [NaN, 'mg/dL']]) {
  const r = normalize(slug, v, u);
  if (r.held) PRODUCED.add(r.held);
}
// unconvertible needs a marker that HAS a canonical unit and a real wrong unit
PRODUCED.add(normalize('vitamin-d', 50, 'furlongs').held);

// 3. The two places the codes are turned into words.
const screen = read('../public/portal/admin/results.html');
const SCREEN_REASONS = [...screen.matchAll(/^\s{4}([a-z_]+): \['/gm)].map(m => m[1]).sort();
const endpoint = read('../functions/api/resolve-held.js');
const endpointBlock = endpoint.slice(endpoint.indexOf('const why = {'), endpoint.indexOf('}[n.held]'));
const ENDPOINT_REASONS = [...endpointBlock.matchAll(/^\s*([a-z_]+):/gm)].map(m => m[1]).sort();

console.log(`\ndatabase constraint: ${DB_REASONS.join(', ')}`);
console.log(`normalize() produces: ${[...PRODUCED].filter(Boolean).sort().join(', ')}`);
console.log(`admin screen words:   ${SCREEN_REASONS.join(', ')}`);
console.log(`endpoint words:       ${ENDPOINT_REASONS.join(', ')}\n`);

console.log('Every hold reason has wording somewhere a person will read');
ok('the constraint was actually parsed, not silently empty', DB_REASONS.length === 4, `got ${DB_REASONS.length}`);
ok('the admin screen words every reason the database allows',
   DB_REASONS.every(r => SCREEN_REASONS.includes(r)),
   'unworded: ' + DB_REASONS.filter(r => !SCREEN_REASONS.includes(r)).join(','));
ok('the admin screen invents no reason the database forbids',
   SCREEN_REASONS.every(r => DB_REASONS.includes(r)),
   'invented: ' + SCREEN_REASONS.filter(r => !DB_REASONS.includes(r)).join(','));
ok('every reason normalize() can produce is allowed by the constraint',
   [...PRODUCED].filter(Boolean).every(r => DB_REASONS.includes(r)),
   'produced but not allowed: ' + [...PRODUCED].filter(r => r && !DB_REASONS.includes(r)).join(','));
ok('the endpoint words every reason a failed resolution can still return',
   [...PRODUCED].filter(Boolean).every(r => ENDPOINT_REASONS.includes(r)),
   'unworded: ' + [...PRODUCED].filter(r => r && !ENDPOINT_REASONS.includes(r)).join(','));

console.log('\nThe wording itself');
const words = [...screen.matchAll(/^\s{4}[a-z_]+: \['([^']*)', '((?:[^'\\]|\\.)*)'\]/gm)];
ok('every reason has both a title and a sentence saying what to do',
   words.length === SCREEN_REASONS.length, `${words.length} of ${SCREEN_REASONS.length} parsed`);
ok('no hold wording contains an em dash', !words.some(w => (w[1] + w[2]).includes('—')));
ok('no hold wording shows the member a raw code',
   !words.some(w => /[a-z]_[a-z]/.test(w[1] + w[2])),
   words.filter(w => /[a-z]_[a-z]/.test(w[1] + w[2])).map(w => w[1]).join(','));

console.log('\nResolution is recorded, not inferred');
const mig50 = read('../database/migrations/050_held_resolution.sql');
ok('a resolved row must carry a resolution, enforced by a constraint',
   /resolved_at is not null and resolution is not null/.test(mig50));
ok('discard and map are the only resolutions the column allows',
   /resolution in \('mapped','discarded'\)/.test(mig50));
ok('the endpoint records who resolved it on both paths',
   (endpoint.match(/resolved_by: staff\.id/g) || []).length === 2,
   `${(endpoint.match(/resolved_by: staff\.id/g) || []).length} of 2 paths`);
ok('the endpoint refuses to resolve an already resolved row',
   /if \(held\.resolved_at\) return json/.test(endpoint));
ok('the endpoint is staff only, before it reads anything',
   endpoint.indexOf('verifyStaff') < endpoint.indexOf("db(env)"));
ok('a rescued value is recorded as staff entry, not as a lab feed',
   /source: 'staff_entered'/.test(endpoint));
ok("staff_entered is a value the database's enum actually has",
   /add value if not exists 'staff_entered'/.test(mig50));

console.log('\nThe conversion table is not copied');
ok('the endpoint imports normalize rather than restating any factor',
   /import \{ normalize \} from '\.\/_units\.js'/.test(endpoint) &&
   !/18\.0182|88\.57|38\.67|2\.496|6\.945|0\.09148/.test(endpoint));
ok('the admin screen states no conversion factor of its own',
   !/18\.0182|88\.57|38\.67|2\.496|6\.945|0\.09148/.test(screen));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['a fifth reason added to the constraint but not the screen',
   () => !['unknown_marker', 'missing_unit', 'unconvertible_unit', 'implausible_value']
           .concat('needs_second_opinion').every(r => SCREEN_REASONS.includes(r))],
  ['wording that leaks a raw code', () => /[a-z]_[a-z]/.test('Held for unconvertible_unit')],
  ['an em dash in wording', () => 'a — b'.includes('—')],
  ['a conversion factor copied into the endpoint',
   () => /18\.0182/.test('const f = 18.0182;')],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${failed === 0 ? 'held fixtures: all pass' : `held fixtures: ${failed} FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
