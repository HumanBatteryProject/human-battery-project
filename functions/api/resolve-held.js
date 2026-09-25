// Cloudflare Pages Function. POST /api/resolve-held
//
// A held lab result is one the analysis agent refused to score: it named a
// marker nothing recognizes, or it arrived with no unit, or with a unit that
// cannot be converted, or with a value that is not a number. Holding is the
// correct behaviour. What was missing is the other half: a way to say what the
// row actually was, so it stops being held.
//
// WHY THIS IS A FUNCTION AND NOT A POSTGRES RPC.
// Resolving a held row means converting its value to the marker's canonical
// unit, and that conversion table lives in _units.js. A SQL version would be a
// second copy of it, and a second copy silently diverges: a factor corrected in
// one place and not the other produces a number that looks exactly like a real
// result. One table, one code path, used by ingest and by this.
//
// The three actions the admin screen offers map onto one operation, because a
// held row needs BOTH a marker and a unit before it can become a result. The
// reason says which one is missing. Discard is the separate case: it records
// that a human looked and decided this was not a result at all.

import { verifyStaff, db } from './_agent.js';
import { normalize } from './_units.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });

export async function onRequestPost({ request, env }) {
  const staff = await verifyStaff(request, env);
  if (!staff) return json({ error: 'Staff only' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const heldId = String(body.held_id || '').trim();
  const action = String(body.action || '').trim();
  if (!heldId) return json({ error: 'Which held row' }, 400);
  if (!['map', 'discard'].includes(action)) return json({ error: 'Unknown action' }, 400);

  const d = db(env);
  const held = await d.one('lab_results_held', {
    where: { id: heldId },
    columns: 'id,client_id,panel_id,reported_name,reported_value,reported_unit,reason,resolved_at',
  });
  if (!held) return json({ error: 'No such held row' }, 404);
  // Resolving twice would write a second result from the same reported value.
  // The unique index only covers open rows, so this check is the one that
  // stops it.
  if (held.resolved_at) return json({ error: 'That one is already resolved' }, 409);

  if (action === 'discard') {
    await d.update('lab_results_held', { id: heldId }, {
      resolved_at: new Date().toISOString(),
      resolved_to: null,
      resolution: 'discarded',
      resolved_by: staff.id,
      resolution_note: String(body.note || '').trim().slice(0, 300) || null,
    });
    return json({ ok: true, action: 'discard' });
  }

  // map: the row becomes a real result under a canonical marker.
  const markerId = String(body.marker_id || '').trim();
  if (!markerId) return json({ error: 'Pick a marker' }, 400);
  const marker = await d.one('lab_markers', {
    where: { id: markerId }, columns: 'id,slug,name,unit,role',
  });
  if (!marker) return json({ error: 'No such marker' }, 404);
  if (!held.panel_id) {
    return json({ error: 'This held row has no panel, so it cannot become a result' }, 409);
  }

  // The unit the admin typed wins over the one that was reported, because the
  // reason the row was held may be that the reported one was wrong or absent.
  const unit = String(body.unit || held.reported_unit || '').trim();
  const n = normalize(marker.slug, held.reported_value, unit);
  if (n.held) {
    // Still not resolvable. Say which of the three it is, in the words the
    // person reading the screen needs, rather than returning the code.
    const why = {
      missing_unit: 'That still has no unit. Type the unit from the report.',
      unconvertible_unit: `There is no conversion from ${unit} to ${marker.unit} for ${marker.name}. Check the unit on the report.`,
      implausible_value: `"${held.reported_value}" is not a number this can convert.`,
    }[n.held] || 'That cannot be converted.';
    return json({ error: why, still_held: n.held }, 400);
  }

  await d.insert('lab_results', {
    panel_id: held.panel_id,
    marker_id: marker.id,
    value: n.value,
    unit: n.unit,
    conversion: n.conversion || null,
    value_raw: n.value_raw ?? null,
    unit_raw: n.unit_raw ?? null,
    // A value a human rescued from a held row is not a lab feed and not
    // something the client typed. It is staff entry, and it says so.
    source: 'staff_entered',
    entered_by: staff.id,
  }, { upsert: 'panel_id,marker_id' });

  await d.update('lab_results_held', { id: heldId }, {
    resolved_at: new Date().toISOString(),
    resolved_to: marker.id,
    resolution: 'mapped',
    resolved_by: staff.id,
    resolution_note: n.conversion || null,
  });

  return json({
    ok: true, action: 'map', marker: marker.name,
    value: n.value, unit: n.unit, conversion: n.conversion || null,
  });
}
