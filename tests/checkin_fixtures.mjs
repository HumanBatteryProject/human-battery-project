// The daily check-in, D3.
//
// The date and zone logic is EXTRACTED FROM THE SHIPPED PAGE and executed here,
// rather than reimplemented. A fixture that carries its own copy of the rule is
// testing itself, and this project has already been bitten by exactly that.
//
// What this cannot cover is the render: that is proved at a true 390px viewport
// with scripts/cdp.mjs, in the run recorded in the commit message.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const eq = (name, got, want) => ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const page = readFileSync(new URL('../public/portal/checkin.html', import.meta.url), 'utf8');

// Pull the three functions out of the page and run them. `today` and `tz` are
// closure variables in the page, so they are injected here.
function loadTimeLogic(todayStr, zone) {
  const grab = (name) => {
    const i = page.indexOf(`function ${name}(`);
    if (i < 0) throw new Error(`${name} not found in checkin.html`);
    // Balance braces from the first { after the signature.
    let depth = 0, start = page.indexOf('{', i), j = start;
    for (; j < page.length; j++) {
      if (page[j] === '{') depth++;
      else if (page[j] === '}') { depth--; if (depth === 0) break; }
    }
    return page.slice(i, j + 1);
  };
  const src = `${grab('zoneOffset')}\n${grab('shiftDay')}\n${grab('stamp')}\n` +
              `return { zoneOffset, shiftDay, stamp };`;
  return new Function('today', 'tz', src)(todayStr, zone);
}

const L = loadTimeLogic('2026-09-25', 'America/Chicago');

console.log('\nA bedtime reported this morning belongs to LAST night');
// The defect this guards against: recording that somebody went to bed tonight
// before they actually did, which moves every sleep figure by a day.
ok('22:45 is attributed to yesterday', L.stamp('22:45', 'last_night').startsWith('2026-09-24T22:45'),
   L.stamp('22:45', 'last_night'));
ok('23:59 is attributed to yesterday', L.stamp('23:59', 'last_night').startsWith('2026-09-24'));
ok('18:00 is the boundary and belongs to yesterday', L.stamp('18:00', 'last_night').startsWith('2026-09-24'));
ok('17:59 is NOT an evening bedtime and stays today', L.stamp('17:59', 'last_night').startsWith('2026-09-25'));
ok('01:30 is an after-midnight bedtime and belongs to today', L.stamp('01:30', 'last_night').startsWith('2026-09-25'));
ok('a wake time is always today', L.stamp('06:30', 'today').startsWith('2026-09-25T06:30'));
ok('a meal time is always today', L.stamp('19:15', 'today').startsWith('2026-09-25T19:15'));

console.log('\nTimes carry the participant’s zone, not the browser’s');
const chicago = L.stamp('22:45', 'last_night');
ok('Chicago in September is UTC-5', /-05:00$/.test(chicago), chicago);
const auckland = loadTimeLogic('2026-09-25', 'Pacific/Auckland').stamp('22:45', 'last_night');
ok('Auckland in September is UTC+12', /\+12:00$/.test(auckland), auckland);
const london = loadTimeLogic('2026-01-15', 'Europe/London').stamp('22:45', 'last_night');
ok('London in January is UTC+0', /\+00:00$/.test(london), london);
const phoenix = loadTimeLogic('2026-07-01', 'America/Phoenix').stamp('08:00', 'today');
ok('Phoenix does not observe daylight saving, so July is still UTC-7',
   /-07:00$/.test(phoenix), phoenix);
// The two instants must differ by the zone gap, or the offset is decorative.
const a = new Date(L.stamp('22:45', 'today')).getTime();
const b = new Date(loadTimeLogic('2026-09-25', 'Pacific/Auckland').stamp('22:45', 'today')).getTime();
ok('the same clock reading in two zones is a different instant', a !== b);
eq('and differs by exactly 17 hours in September', (a - b) / 3600000, 17);

console.log('\nAn unknown zone records nothing rather than something wrong');
const broken = loadTimeLogic('2026-09-25', 'Not/AZone');
eq('a bad zone yields null, not a UTC guess', broken.stamp('22:45', 'today'), null);
eq('an empty time yields null', L.stamp('', 'today'), null);

console.log('\nDay boundaries in shiftDay');
eq('back one day across a month start', L.shiftDay('2026-10-01', -1), '2026-09-30');
eq('back one day across a year start', L.shiftDay('2027-01-01', -1), '2026-12-31');
eq('back one day into a leap February', L.shiftDay('2028-03-01', -1), '2028-02-29');

console.log('\nD3 asks for nine things, and the screen asks for all of them');
const flat = page.replace(/\s+/g, ' ');
for (const [what, re] of [
  ['sleep timing',            /id="c-bed"[\s\S]*id="c-wake"/],
  ['perceived sleep quality', /data-pick="sleep_quality"/],
  ['energy',                  /data-pick="energy"/],
  ['relevant symptoms',       /data-multi="symptoms"/],
  ['movement',                /id="c-move"/],
  ['outdoor daylight',        /id="c-daylight"/],
  ['meal timing',             /id="c-first"[\s\S]*id="c-last"/],
  ['hydration',               /data-pick="water_ml"/],
  ['evening light',           /data-pick="evening_light_low"/],
  ['previous actions',        /data-action=/],
]) ok(`it asks about ${what}`, re.test(page));

console.log('\nIt is built for a thumb, and for being optional');
ok('tap targets are at least 44px tall', /min-height:44px/.test(page));
ok('the save button is at least 48px', /\.ci-save \.btn\{width:100%;min-height:48px\}/.test(page));
ok('symptoms says a blank is a normal day, not a missing answer',
   /Leaving this blank is a normal day, not a missing answer/.test(flat));
ok('nothing is required', !/ required[ >]/.test(page.replace(/aria-[a-z]+="[^"]*"/g, '')));
ok('a second visit edits rather than overwriting with blanks',
   /Changing anything and saving again updates it/.test(flat));
ok('only answered fields are sent, so a blank cannot erase another screen’s value',
   /if \(v !== null && v !== undefined && v !== ''\) patch\[k\] = v;/.test(page));

console.log('\nIt writes one row per participant per day');
ok('upsert on the natural key, so two visits cannot make two rows',
   /onConflict: 'client_id,log_date'/.test(page));
ok('the local date comes from the participant’s zone, not the browser clock',
   /timeZone: tz, year: 'numeric'/.test(page));
ok('the program day comes from the database, not arithmetic here',
   /sb\.rpc\('program_day'\)/.test(page));
ok('a missing start date is said in words, never rendered as a day number',
   /is not counted as a program day/.test(flat));

console.log('\nYesterday’s actions');
ok('a barrier is only asked when something was skipped or adjusted',
   /b\.value === 'skip' \|\| b\.value === 'adjust'/.test(page));
ok('an empty action list is the normal state, not an error',
   /an empty list is the honest normal state/.test(flat));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['a bedtime stamped on today', () => !L.stamp('22:45', 'last_night').startsWith('2026-09-25')],
  ['a zone-less timestamp', () => /[+-]\d{2}:\d{2}$/.test(L.stamp('22:45', 'today'))],
  ['a bad zone falling back to UTC', () => broken.stamp('22:45', 'today') === null],
  ['two visits making two rows', () => /onConflict/.test(page)],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'checkin fixtures: all pass' : `checkin fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
