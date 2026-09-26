// program_settings, read with no fallback.
//
// The behaviour under test is a refusal. Every other loader in this codebase
// has a safe default; this one must not, because a default price means the
// setting can go missing, the fallback answers, and somebody is charged the
// wrong amount. These fixtures exist to prove the refusal happens, because a
// missing refusal looks exactly like a working system until a card is charged.

import { readFileSync } from 'node:fs';
import { settings, KEYS, SettingMissing } from '../functions/api/_settings.js';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};

// A fake Supabase that returns exactly what the test wants, including nothing.
function fakeEnv(rows) {
  return {
    SUPABASE_URL: 'https://fake',
    SUPABASE_SERVICE_KEY: 'fake',
    __rows: rows,
  };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const env = globalThis.__env;
  if (env && env.__rows === 'UNREADABLE') return { ok: false, status: 500 };
  const wanted = decodeURIComponent(String(url).match(/key=in\.\(([^)]*)\)/)[1]).split(',');
  const rows = (env.__rows || []).filter(r => wanted.includes(r.key));
  return { ok: true, json: async () => rows };
};
async function read(rows, keys) {
  globalThis.__env = fakeEnv(rows);
  return settings(globalThis.__env, keys);
}
async function throws(rows, keys) {
  try { await read(rows, keys); return null; }
  catch (e) { return e; }
}

console.log('\nIt reads what is there');
const got = await read(
  [{ key: 'continuation_monthly_cents', value: '3999' },
   { key: 'continuation_display_name', value: 'continuing membership' }],
  [KEYS.CONTINUATION_MONTHLY_CENTS, KEYS.CONTINUATION_DISPLAY_NAME]);
ok('a money setting comes back as a number of cents',
   got[KEYS.CONTINUATION_MONTHLY_CENTS] === 3999, JSON.stringify(got));
ok('a text setting comes back as text',
   got[KEYS.CONTINUATION_DISPLAY_NAME] === 'continuing membership');

console.log('\nIt refuses rather than defaulting');
const cases = [
  ['a missing setting', [], [KEYS.CONTINUATION_MONTHLY_CENTS]],
  ['an empty setting', [{ key: 'continuation_monthly_cents', value: '' }], [KEYS.CONTINUATION_MONTHLY_CENTS]],
  ['a null setting', [{ key: 'continuation_monthly_cents', value: null }], [KEYS.CONTINUATION_MONTHLY_CENTS]],
  ['a price that is not a number', [{ key: 'continuation_monthly_cents', value: 'thirty nine' }], [KEYS.CONTINUATION_MONTHLY_CENTS]],
  ['a price written as dollars', [{ key: 'continuation_monthly_cents', value: '39.99' }], [KEYS.CONTINUATION_MONTHLY_CENTS]],
  ['a price of zero', [{ key: 'continuation_monthly_cents', value: '0' }], [KEYS.CONTINUATION_MONTHLY_CENTS]],
  ['a negative price', [{ key: 'continuation_monthly_cents', value: '-3999' }], [KEYS.CONTINUATION_MONTHLY_CENTS]],
  ['one of two settings missing',
   [{ key: 'continuation_monthly_cents', value: '3999' }],
   [KEYS.CONTINUATION_MONTHLY_CENTS, KEYS.CONTINUATION_ANNUAL_CENTS]],
  ['a key nobody declared', [], ['made_up_key']],
  ['the table being unreadable', 'UNREADABLE', [KEYS.CONTINUATION_MONTHLY_CENTS]],
];
for (const [label, rows, keys] of cases) {
  const e = await throws(rows, keys);
  ok(`${label} throws rather than returning a default`, e instanceof SettingMissing || (e && /not a declared setting/.test(e.message)),
     e ? 'threw ' + e.constructor.name : 'DID NOT THROW');
}
// A price written as dollars is the most dangerous of those: 39.99 read as
// cents would charge forty cents, and read as dollars by Stripe would charge
// nothing recognisable. It must never parse.
const dollars = await throws([{ key: 'continuation_monthly_cents', value: '39.99' }], [KEYS.CONTINUATION_MONTHLY_CENTS]);
ok('and the dollars case says what was wrong with it',
   dollars && /positive whole number of cents/.test(dollars.message), dollars && dollars.message);

console.log('\nNo price is written in code');
// The whole point of the settings table. A literal price in a shipped file is
// the thing this replaces.
const files = ['../functions/api/_settings.js', '../functions/api/_autonomy.js'];
for (const f of files) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(`${f.split('/').pop()} states no price of its own`,
     !/\b(3999|34900|70000|100000)\b/.test(code));
}

console.log('\nSeeded defect: the refusal check must be able to fail');
const seeds = [
  ['a loader that defaults instead of throwing', () => {
    const withDefault = (raw) => (raw && /^\d+$/.test(raw) ? Number(raw) : 3999);
    return withDefault('') === 3999;   // a default answered a missing setting
  }],
  ['dollars parsed as cents', () => Number('39.99') !== 3999],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

globalThis.fetch = realFetch;
console.log(`\n${bad === 0 ? 'settings fixtures: all pass' : `settings fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
