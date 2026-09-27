// Accessibility at phone width, measured on the live pages. Part I Day 12.
//
// WHY MEASURED AND NOT REVIEWED. Every finding here comes from the rendered page:
// computed colours against the background actually painted behind the text, layout
// rectangles for tap targets, real focus changes, the real heading sequence. Reading
// the source tells me what I intended, which is the thing already believed.
//
// A TRUE 390px VIEWPORT. Headless Chrome clamps the layout viewport to 500px, so
// --window-size=390 renders a 500px layout and crops it. scripts/cdp.mjs sets real
// device metrics, which is how the nav overflow was found: eight tabs forcing 546px
// while every screenshot at "390" looked fine.
//
// Signed in, because half the portal is behind auth and an audit of the login page
// is not an audit of the product.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.env.HBP_BASE || 'https://thehumanbatteryproject.com';
const URL_ = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_KEY;
const DB = process.env.SUPABASE_DB_URL;
const WIDTH = process.env.A11Y_WIDTH || '390';
const PSQL = '/opt/homebrew/opt/libpq/bin/psql';

if (!URL_ || !SERVICE || !DB) {
  console.error('  need SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_DB_URL');
  process.exit(2);
}

const AUDIT = readFileSync(new URL('./a11y_audit.js', import.meta.url), 'utf8');

// Controls that only exist once something is switched on. The audit loads a page
// and measures what is visible, so a control behind a toggle is never measured:
// the heat and cold minutes and time inputs on the log page are hidden until the
// practice is ticked, which means they shipped unmeasured. This reveals them
// before the audit runs, so they are covered every time rather than once by hand.
const REVEAL = {
  '/portal/log':
    "document.querySelectorAll('.hc-detail').forEach(function(d){ d.hidden = false; });",
};

const PAGES = [
  '/portal/',          // the dashboard
  '/portal/checkin',
  '/portal/log',
  '/portal/program',
  '/portal/calls',
  '/portal/labs',
  '/portal/account',
  '/portal/billing',
  '/portal/consent',
  // Public pages a member also reads, at the same width.
  '/',
  '/apply',
  // THE ADMIN SCREENS TOO. They were not in this list, and that is how a screen that
  // threw on load and rendered nothing reached production: the audit checks the console
  // as well as the layout, and it was only looking at member pages. The owner uses these
  // on a phone as much as anybody.
  '/portal/admin/',
  '/portal/admin/applications',
  '/portal/admin/members',
  '/portal/admin/canon',
  '/portal/admin/ops',
  '/portal/admin/queues',
  '/portal/admin/results',
  '/portal/admin/audit',
];

const sql = (s) => execFileSync(PSQL, [DB, '-At', '-c', s], { encoding: 'utf8' }).trim();

async function admin(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
               'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const email = sql('select email from profiles limit 1');
const link = await admin('/auth/v1/admin/generate_link', {
  method: 'POST', body: JSON.stringify({ type: 'magiclink', email }),
});
const session = await admin('/auth/v1/verify', {
  method: 'POST', body: JSON.stringify({ type: 'magiclink', token_hash: link.hashed_token }),
});

// The key supabase-js v2 stores a session under, so the page believes it is signed
// in without a real sign-in round trip.
const ref = new URL(URL_).hostname.split('.')[0];
const storage = JSON.stringify({ [`sb-${ref}-auth-token`]: JSON.stringify(session) });

let bad = 0, pagesWithProblems = 0;
const seen = new Map();

for (const page of PAGES) {
  let result;
  try {
    const raw = execFileSync('node', [
      'scripts/cdp.mjs', '--url', BASE + page,
      '--width', WIDTH, '--height', '844',
      '--localstorage', storage,
      '--eval', (REVEAL[page] ? REVEAL[page] + '\n' : '') + AUDIT,
    ], { encoding: 'utf8', timeout: 90000, maxBuffer: 20 * 1024 * 1024 });
    // cdp.mjs PRETTY-PRINTS its JSON across many lines and may print a page-errors
    // section first, so "lines that start with {" collected exactly one character.
    // Scan back to the last line that is a bare { at column 0 and parse from there.
    const lines = raw.split('\n');
    let from = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i] === '{') { from = i; break; }
    }
    result = from >= 0 ? JSON.parse(lines.slice(from).join('\n')) : null;
    // Page errors are the harness's own finding and matter as much as the audit's.
    const errs = lines.filter((l) => l.includes('error:') || l.includes('Uncaught'));
    if (errs.length) {
      result = result || { url: page, problems: [], counts: {} };
      for (const e of errs.slice(0, 4)) {
        result.problems.push({ kind: 'javascript error on the page', detail: e.trim().slice(0, 200) });
      }
    }
  } catch (e) {
    console.log(`  FAIL  ${page.padEnd(20)} harness error: ${String(e.message).slice(0, 120)}`);
    bad++;
    continue;
  }
  if (!result) {
    console.log(`  FAIL  ${page.padEnd(20)} no audit result returned`);
    bad++;
    continue;
  }

  const problems = result.problems || [];

  // THE PAGE IT LANDED ON MUST BE THE PAGE IT ASKED FOR.
  //
  // Six of these pages sit behind a consent gate the internal member had not
  // cleared, because an earlier consent-withdrawal proof withdrew health_data and
  // never restored it. All six redirected to the consent screen, the audit
  // measured THAT screen, and reported a pass. The run said "accessibility ok
  // across 19 pages" while six of the nineteen were the same page. The only clue
  // was that they all reported an identical 4 controls and 10 text runs.
  //
  // An audit that cannot tell it was redirected cannot report coverage.
  const want = page.replace(/\/+$/, '');
  const got = String(result.url || '').replace(/\/+$/, '');
  if (want && got && want !== got) {
    problems.push({ kind: 'redirected, so this page was never audited',
                    detail: `asked for ${page}, measured ${result.url}` });
  }

  if (!problems.length) {
    console.log(`  pass  ${page.padEnd(20)} ${result.counts.interactive || 0} controls, ` +
                `${result.counts.textNodesChecked || 0} text runs, ` +
                `${result.counts.scrollWidth}px in ${result.counts.clientWidth}px` +
                (result.counts.testBanner ? ', test banner shown' : ''));
    continue;
  }
  pagesWithProblems++;
  console.log(`  FAIL  ${page.padEnd(20)} ${problems.length} problem(s)`);
  for (const p of problems) {
    console.log(`          [${p.kind}] ${p.detail}`);
    seen.set(p.kind, (seen.get(p.kind) || 0) + 1);
    bad++;
  }
}

if (seen.size) {
  console.log('\n  by kind:');
  for (const [kind, n] of [...seen.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${kind}`);
  }
}

console.log(`\n${bad ? `ACCESSIBILITY FAILED: ${bad} problem(s) across ${pagesWithProblems} page(s) at ${WIDTH}px`
                     : `accessibility ok at ${WIDTH}px across ${PAGES.length} pages`}`);
process.exit(bad ? 1 : 0);
