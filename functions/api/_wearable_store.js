// Writing a wearable reading, and the rules that go with it.
//
// One place, because every path that writes a reading has to obey the same four rules and
// four copies of them is three chances to differ:
//
//   1. IDEMPOTENT on member, provider and day. A replayed webhook or a re-run sync updates
//      the row rather than adding a second one, which the unique index enforces and this
//      relies on rather than duplicating.
//   2. HELD rows are written too, with their reason, because a held reading is evidence
//      about the mapping and throwing it away loses the only clue.
//   3. SANDBOX data only ever reaches an is_internal membership, and says so in the row.
//   4. Every value is MEASURED, and a vendor score is stored beside it and never in it.

import { normalizeDay, vendorScore } from './_wearables.js';
import { SANDBOX } from './_wearable_providers.js';

/** Is this member an internal test account? Asked, never assumed. */
export async function isInternal(sb, clientId) {
  const rows = await sb.select('memberships', {
    where: { client_id: clientId }, columns: 'is_internal',
  });
  return (rows || []).some((r) => r.is_internal === true);
}

/**
 * Write one day. Returns what it did, so a caller can report counts honestly.
 *
 * @returns {{written:number, held:number, refused:number, why:string[]}}
 */
export async function storeDay(sb, { clientId, provider, day, payload, mode, internal }) {
  const out = { written: 0, held: 0, refused: 0, why: [] };

  // Rule 3. A real participant must never receive a sandbox reading, and the check is on
  // the membership rather than on a flag somebody could forget to set.
  const fromSandbox = mode === SANDBOX || (payload && payload._source === SANDBOX);
  if (fromSandbox && !internal) {
    out.refused++;
    out.why.push('sandbox data is only ever written to an internal test account, and this membership is not one');
    return out;
  }

  const { row, held } = normalizeDay(provider, day, payload);
  const vs = vendorScore(provider, payload);

  // Provenance travels with the row. A reading's own record says where it came from, so
  // nothing downstream has to guess and the Devices page can label it.
  const raw = {
    ...row.raw,
    _provenance: {
      source: fromSandbox ? 'sandbox' : 'provider',
      provider,
      fetched_at: new Date().toISOString(),
    },
  };

  const base = {
    client_id: clientId, provider, day,
    basis: 'measured',
    raw,
    updated_at: new Date().toISOString(),
  };

  const measured = Object.fromEntries(
    Object.entries(row).filter(([k]) => !['provider', 'day', 'basis', 'raw'].includes(k)));

  if (Object.keys(measured).length) {
    await sb.insert('wearable_daily', {
      ...base, ...measured,
      // Rule 4. Stored beside the measurements, never one of them, and never an input to
      // the Human Battery Score.
      ...(vs ? { vendor_score_name: vs.vendor_score_name, vendor_score_value: vs.vendor_score_value } : {}),
      is_held: false,
    }, { upsert: 'client_id,provider,day,is_held' });
    out.written++;
  }

  // Rule 2. Held readings are kept, because they are the evidence that a field name or a
  // unit is wrong and discarding them discards the only clue.
  //
  // ONE held row per day, listing every field, rather than one row per field. That is what
  // the unique index allows now that is_held is part of the key, and it reads as one fact
  // rather than three: on this day, from this provider, these fields could not be used and
  // here is why each one.
  if (held.length) {
    await sb.insert('wearable_daily', {
      ...base,
      is_held: true,
      held_reason: held.map((h) => `${h.field}: ${h.reason}`).join(' | ').slice(0, 2000),
    }, { upsert: 'client_id,provider,day,is_held' });
    out.held += held.length;
    for (const h of held) out.why.push(`${h.field} held: ${h.reason}`);
  }

  return out;
}
