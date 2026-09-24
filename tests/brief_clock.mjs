// Clock tests for the morning brief. These FAKE the time rather than waiting a
// day, which is the only way this is testable at all.
//
// What is under test is the part that is decided in code: which local date a
// member is on, given their timezone and the instant the cron fires. The bug
// this guards against is a brief assembled against the server's day, which
// sends a member in Auckland a Tuesday brief on Monday evening.

const DEFAULT_TZ = 'America/New_York';

function localDate(tz, nowISO) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(nowISO));
}

function shiftDate(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const CASES = [
  // instant (UTC),          timezone,             expected local date, why
  ['2026-09-24T03:00:00Z', 'America/New_York',   '2026-09-23', 'UTC has ticked over, New York has not'],
  ['2026-09-24T03:00:00Z', 'Pacific/Auckland',   '2026-09-24', 'Auckland is already well into the next day'],
  ['2026-09-24T13:00:00Z', 'America/Los_Angeles','2026-09-24', 'mid-morning on the west coast'],
  ['2026-09-24T06:59:00Z', 'Europe/London',      '2026-09-24', 'just after London midnight in summer time'],
  ['2026-09-24T23:30:00Z', 'America/New_York',   '2026-09-24', 'late evening, still the same local day'],
  ['2026-09-24T03:00:00Z', null,                 '2026-09-23', 'null timezone falls back to the program default, not UTC'],
];

let bad = 0;
console.log('%s %s %s %s', 'instant'.padEnd(22), 'tz'.padEnd(21), 'expect'.padEnd(11), 'got');
for (const [now, tz, want, why] of CASES) {
  const got = localDate(tz, now);
  const ok = got === want;
  if (!ok) bad++;
  console.log('%s %s %s %s  %s  %s',
    now.padEnd(22), String(tz).padEnd(21), want.padEnd(11), got,
    ok ? 'ok  ' : 'FAIL', why);
}

// yesterday must be yesterday across a month boundary and a leap day
const SHIFTS = [
  ['2026-03-01', -1, '2026-02-28'],
  ['2024-03-01', -1, '2024-02-29'],
  ['2026-01-01', -1, '2025-12-31'],
];
for (const [d, n, want] of SHIFTS) {
  const got = shiftDate(d, n);
  const ok = got === want;
  if (!ok) bad++;
  console.log('%s %s %s %s  %s  %s', ('shift ' + d).padEnd(22), String(n).padEnd(21),
    want.padEnd(11), got, ok ? 'ok  ' : 'FAIL', 'date arithmetic across a boundary');
}

console.log('\n%d case(s) failed', bad);
process.exit(bad ? 1 : 0);
