// Operating constants that live in the database, read with no fallback.
//
// WHY THERE IS NO DEFAULT.
// Every other loader in this codebase has a safe default and that is usually
// right. For a price it is wrong. A default means the setting can go missing,
// the fallback answers, somebody is charged the wrong amount, and the first
// person to find out is the member reading their card statement. A price that
// cannot be read is an outage, and an outage is loud. A price that is quietly
// wrong is not.
//
// The same argument applies to the day-90 default and the founding window: both
// decide whether a real person is billed.

// Every setting this module will read, with what it is for. Listed rather than
// accepted as an arbitrary string so a typo in a key name is a failure here
// instead of a silent miss at the call site.
export const KEYS = {
  PROGRAM_PRICE_CENTS: 'program_price_cents',
  FOUNDING_PRICE_CENTS: 'founding_price_cents',
  FOUNDING_WINDOW_ENDS_ON: 'founding_window_ends_on',
  CONTINUATION_MONTHLY_CENTS: 'continuation_monthly_cents',
  CONTINUATION_ANNUAL_CENTS: 'continuation_annual_cents',
  DAY_90_DEFAULT: 'day_90_default',
  CONTINUATION_DISPLAY_NAME: 'continuation_display_name',
  FIRST_WAVE_DATE: 'first_wave_date',
  MINIMUM_LEAD_DAYS: 'minimum_lead_days',
};

const MONEY = new Set([
  KEYS.PROGRAM_PRICE_CENTS, KEYS.FOUNDING_PRICE_CENTS,
  KEYS.CONTINUATION_MONTHLY_CENTS, KEYS.CONTINUATION_ANNUAL_CENTS,
]);

export class SettingMissing extends Error {}

/**
 * Read one or more settings. Throws SettingMissing if any is absent or empty,
 * and for a money setting if it is not a positive whole number of cents.
 * Returns an object keyed by the setting key.
 */
export async function settings(env, keys) {
  const want = Array.isArray(keys) ? keys : [keys];
  const unknown = want.filter(k => !Object.values(KEYS).includes(k));
  if (unknown.length) {
    throw new SettingMissing(`not a declared setting key: ${unknown.join(', ')}`);
  }
  const url = `${env.SUPABASE_URL}/rest/v1/program_settings` +
    `?key=in.(${want.map(encodeURIComponent).join(',')})&select=key,value`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new SettingMissing(`program_settings unreadable: ${res.status}`);
  }
  const rows = await res.json();
  const out = {};
  for (const k of want) {
    const row = rows.find(r => r.key === k);
    const raw = row && row.value != null ? String(row.value).trim() : '';
    if (!raw) throw new SettingMissing(`program_settings.${k} is not set`);
    if (MONEY.has(k)) {
      // A price read as NaN and passed to Stripe is the failure this guards.
      if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
        throw new SettingMissing(`program_settings.${k} is not a positive whole number of cents: "${raw}"`);
      }
      out[k] = Number(raw);
    } else {
      out[k] = raw;
    }
  }
  return out;
}

/**
 * Is this member inside the founding window? A date, not a seat count: Brief 08
 * section 1 resolved the vision document's "no artificial scarcity" against
 * Brief 07's count cap in favour of a real deadline.
 *
 * Pure so it can be tested without a database. dayZero and windowEnd are both
 * plain YYYY-MM-DD strings, compared as strings because that is exactly
 * date order for this format and avoids every timezone question a Date would
 * introduce. A member starting on the window's last day IS founding.
 */
export function inFoundingWindow(dayZero, windowEndsOn) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayZero || ''))) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(windowEndsOn || ''))) return false;
  return String(dayZero) <= String(windowEndsOn);
}
