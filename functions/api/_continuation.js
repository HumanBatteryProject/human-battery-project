// Continuing membership, as arithmetic and policy. Master prompt D9.
//
// Kept separate from _payments.js because the two are different KINDS of money
// and confusing them is the failure D9 spends most of its words on. The program
// is a fixed total that ends at day 90. Continuation renews until somebody stops
// it. A subscription that bills a fixed total keeps charging after the program is
// over; a fixed total that bills a subscription stops collecting a fee somebody
// still owes. So they do not share a code path and they do not share a file.

export const CONTINUATION_KINDS = ['continuation_monthly', 'continuation_annual'];

// The shape of each option. Prices are NOT here: they live in program_settings
// and are read at request time, because a price in two places is a price that
// disagrees with itself.
export const CONTINUATION_PLANS = {
  continuation_monthly: {
    key: 'continuation_monthly',
    label: 'Monthly',
    setting: 'continuation_monthly_cents',
    interval: 'month',
    interval_count: 1,
    every: 'month',
  },
  continuation_annual: {
    key: 'continuation_annual',
    label: 'Annual',
    setting: 'continuation_annual_cents',
    interval: 'year',
    interval_count: 1,
    every: 'year',
  },
};

export function isContinuationKind(kind) {
  return CONTINUATION_KINDS.includes(String(kind));
}

/**
 * Add one billing interval to a date, in plain date arithmetic.
 *
 * The end-of-month case is why this is a function and not a one-liner. Adding a
 * month to 31 January with setUTCMonth gives 3 March, because February has no
 * 31st and the Date object rolls forward. A member who subscribed on the 31st
 * would see their renewal date drift a few days later every month. Clamping to
 * the last day of the target month is what every calendar means by "a month
 * later".
 */
export function addInterval(fromDate, interval, count = 1) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate || ''))) {
    throw new Error(`fromDate must be YYYY-MM-DD, got ${JSON.stringify(fromDate)}`);
  }
  const [y, m, d] = fromDate.split('-').map(Number);
  let year = y, month = m, day = d;
  if (interval === 'month') month += count;
  else if (interval === 'year') year += count;
  else throw new Error(`interval must be month or year, got ${JSON.stringify(interval)}`);

  year += Math.floor((month - 1) / 12);
  month = ((month - 1) % 12 + 12) % 12 + 1;

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) day = lastDay;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * When a continuation actually starts, and when it first renews.
 *
 * D9: a participant may purchase continuation before day 90, and access and
 * billing dates must be explicit. So buying early does NOT start it early and
 * does NOT bill early. It starts the day after the program ends.
 *
 * @param {string} today YYYY-MM-DD
 * @param {string|null} programEndsOn YYYY-MM-DD, the day 90 date, or null if there is no program
 */
export function continuationDates(kind, today, programEndsOn) {
  const plan = CONTINUATION_PLANS[kind];
  if (!plan) throw new Error(`unknown continuation kind: ${kind}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) {
    throw new Error(`today must be YYYY-MM-DD, got ${JSON.stringify(today)}`);
  }

  const dayAfterProgram = programEndsOn ? addDays(programEndsOn, 1) : null;
  const startsOn = dayAfterProgram && dayAfterProgram > today ? dayAfterProgram : today;
  const bought_early = startsOn > today;

  return {
    kind,
    starts_on: startsOn,
    first_charge_on: startsOn,
    renews_on: addInterval(startsOn, plan.interval, plan.interval_count),
    every: plan.every,
    bought_early,
    // Said out loud because D9 requires it said out loud. A member buying in
    // week ten needs to know they are not paying twice in week ten.
    statement: bought_early
      ? `Your membership starts ${startsOn}, the day after your program ends. You will not be charged until then.`
      : `Your membership starts today, ${startsOn}.`,
  };
}

export function addDays(fromDate, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate || ''))) {
    throw new Error(`fromDate must be YYYY-MM-DD, got ${JSON.stringify(fromDate)}`);
  }
  const d = new Date(fromDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * What cancelling does.
 *
 * D9: a cancelled membership keeps access until the paid period ends, and
 * cancellation is NOT data deletion. Both of those are here so no route decides
 * them for itself.
 */
export function cancellation(entitlement, today) {
  const paidThrough = entitlement && (entitlement.renews_on || entitlement.effective_to);
  if (!paidThrough) {
    return { access_until: today, statement: 'Your membership ends today.', keeps_data: true };
  }
  // The period they have already paid for runs to the day BEFORE the next
  // renewal, because the renewal date is the start of the period they are not
  // paying for.
  const until = addDays(paidThrough, -1);
  const access_until = until < today ? today : until;
  return {
    access_until,
    charges_stop: true,
    statement:
      `Your membership is cancelled. You keep everything until ${access_until}, ` +
      `which is the end of the period you have already paid for. You will not be ` +
      `charged again. Nothing is deleted: your records stay yours, you can export ` +
      `them at any time, and you can ask us to delete them separately.`,
    keeps_data: true,
  };
}

/**
 * Whether a purchase is allowed to proceed at all.
 *
 * D9 asks for an explicit policy preventing accidental overlap or double
 * billing when plans change. The database refuses a second chargeable
 * continuation outright; this is the same rule stated early, so a member gets a
 * sentence instead of a constraint violation.
 */
export function purchaseDecision({ kind, existing, consentGranted }) {
  if (!isContinuationKind(kind)) {
    return { allowed: false, reason: 'unknown membership option' };
  }
  if (!consentGranted) {
    return { allowed: false, reason: 'subscription consent has not been given' };
  }
  const live = (existing || []).filter(
    (e) => isContinuationKind(e.kind) && (e.status === 'active' || e.status === 'suspended'));

  if (live.length) {
    const same = live.find((e) => e.kind === kind);
    if (same) {
      return { allowed: false, reason: 'already a member on this plan', existing_id: same.id };
    }
    // A different plan IS allowed, as a switch rather than a second purchase.
    return {
      allowed: true, as: 'plan change', replaces: live[0].id,
      // The old one must be closed in the same operation. Leaving it open is
      // precisely the double billing the policy exists to prevent.
      must_close: live[0].id,
      reason: null,
    };
  }
  return { allowed: true, as: 'new membership', reason: null };
}
