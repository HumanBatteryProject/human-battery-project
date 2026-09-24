// The analysis agent. POST /api/analyze  { client_id, panel_id, results[] }
//
// Labs in, coaching out, through the marker mapping and nothing else.
//
// The rule that shapes everything here: a value enters ONLY under a canonical
// Chapter 21 marker name. Anything else is held. Not dropped, because dropping
// loses a real measurement silently. Not matched to the nearest marker,
// because that puts one person's number inside another marker's score and the
// result looks exactly as plausible as a correct one.
//
// The agent never says what a marker means from model knowledge. Every line of
// coaching is retrieved from the corpus by marker and dimension and carries the
// tier of the passage it came from, exactly as the coach does.

import {
  json, supabase, ask, startRun, finishRun, hasServiceSecret, verifyStaff,
  MODEL_PER_CLIENT,
} from './_agent.js';
import { IDENTITY, MODEL_SUMMARY, GUARDRAILS, TIER_VOICE, stripDashes } from './_voice.js';
import { canClaim, wordingFor } from './_evidence.js';
import { SCREENING_ROWS } from './_medical.js';
import { normalize } from './_units.js';

const AGENT = 'analysis';

// DECISION LEFT TO THE OWNER. Below this fraction of a dimension's markers the
// dimension is reported as too thin to score rather than scored from what
// happens to be present. Set so two of three is reportable and one of three is
// not, which is the line where a score stops describing the dimension and
// starts describing whichever marker turned up.
export const COVERAGE_FLOOR = 0.6;

// A score of 0 to 100 against the program-optimal band, never the lab
// reference range. CLAUDE.md: the Score scores against a program-optimal band.
function scoreMarker(m, value) {
  const lo = m.optimal_low, hi = m.optimal_high;
  if (lo == null || hi == null) return null;
  if (value >= lo && value <= hi) return 100;
  const span = (hi - lo) || 1;
  const outBy = value < lo ? (lo - value) : (value - hi);
  return Math.max(0, Math.round(100 - (outBy / span) * 100));
}

function flagFor(m, value) {
  if (m.ref_low != null && value < m.ref_low) return 'low';
  if (m.ref_high != null && value > m.ref_high) return 'high';
  return 'normal';
}

// Which screening rows bear on an out-of-range marker. Routed ABOVE the
// coaching, never below it: brief 06 section 6 rule 6.
function screeningFor(slug, flag) {
  if (flag === 'normal') return [];
  const map = {
    'glucose-fasting': /Diabetes/, 'hba1c': /Diabetes/, 'insulin-fasting': /Diabetes/,
    'homa-ir': /Diabetes/, 'vitamin-d': /Anticoagulants/,
  };
  const want = map[slug];
  return want ? SCREENING_ROWS.filter(r => want.test(r.on)) : [];
}

export async function onRequestPost({ request, env }) {
  const sb = supabase(env);
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const clientId = body.client_id;
  const panelId = body.panel_id || null;
  const results = Array.isArray(body.results) ? body.results : [];
  if (!clientId || !results.length) return json({ error: 'client_id and results required' }, 400);

  // A4: the member's declared panel. A marker outside it is "not in your
  // panel", never "missing" and never "out of range". That distinction is the
  // difference between a choice the member made and a failure they did not.
  const { data: mem } = await sb.from('memberships')
    .select('panel_id').eq('client_id', clientId).is('completed_on', null).maybeSingle();
  const declaredPanel = (mem && mem.panel_id) || null;
  let inPanel = null;
  if (declaredPanel) {
    const { data: pm } = await sb.from('lab_panel_markers')
      .select('marker_id').eq('panel_id', declaredPanel);
    inPanel = new Set((pm || []).map(r => r.marker_id));
  }

  const { data: markers } = await sb.from('lab_markers')
    .select('id, slug, name, unit, dimension, role, ref_low, ref_high, optimal_low, optimal_high, better_direction, specimen');
  const bySlug = new Map((markers || []).map(m => [m.slug, m]));
  const byName = new Map((markers || []).map(m => [String(m.name || '').toLowerCase(), m]));

  const accepted = [], held = [];

  for (const r of results) {
    const key = String(r.marker || r.slug || r.name || '').trim();
    const m = bySlug.get(key.toLowerCase()) || byName.get(key.toLowerCase());
    if (!m) {
      held.push({ reported_name: key, reported_value: String(r.value ?? ''),
                  reported_unit: r.unit || null, reason: 'unknown_marker' });
      continue;
    }
    const n = normalize(m.slug, r.value, r.unit);
    if (n.held) {
      held.push({ reported_name: key, reported_value: String(r.value ?? ''),
                  reported_unit: r.unit || null, reason: n.held });
      continue;
    }
    accepted.push({ marker: m, value: n.value, unit: n.unit,
                    conversion: n.conversion || null,
                    value_raw: n.value_raw ?? null, unit_raw: n.unit_raw ?? null,
                    flag: flagFor(m, n.value) });
  }

  // write the held rows so the admin screen can show them
  if (held.length) {
    await sb.from('lab_results_held').insert(
      held.map(h => ({ ...h, client_id: clientId, panel_id: panelId })));
  }

  // write the accepted results
  if (accepted.length && panelId) {
    await sb.from('lab_results').insert(accepted.map(a => ({
      panel_id: panelId, marker_id: a.marker.id, value: a.value, unit: a.unit,
      value_raw: a.value_raw, unit_raw: a.unit_raw, conversion: a.conversion,
      ref_low: a.marker.ref_low, ref_high: a.marker.ref_high, flag: a.flag,
      source: 'client',
    })));
  }

  // ---- dimensions, with coverage. A missing marker is MISSING, not zero ----
  const { data: dims } = await sb.from('state_dimensions')
    .select('dimension, is_scored').eq('is_scored', true);
  const scoredMarkers = (markers || []).filter(m => m.role === 'scored');

  const dimOut = [];
  for (const d of (dims || [])) {
    // only markers the member's panel actually includes are EXPECTED. A
    // marker they never ordered must not count against their coverage.
    const expected = scoredMarkers.filter(m => m.dimension === d.dimension
      && (!inPanel || inPanel.has(m.id)));
    if (!expected.length) { dimOut.push({ dimension: d.dimension, score: null,
      expected: 0, present: 0, note: 'no lab markers; measured by functional tests or logs' }); continue; }
    const present = accepted.filter(a => a.marker.dimension === d.dimension && a.marker.role === 'scored');
    const coverage = present.length / expected.length;
    if (coverage < COVERAGE_FLOOR) {
      dimOut.push({ dimension: d.dimension, score: null, expected: expected.length,
        present: present.length, note: 'too few markers to score' });
      continue;
    }
    const parts = present.map(p => scoreMarker(p.marker, p.value)).filter(x => x != null);
    const score = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
    dimOut.push({ dimension: d.dimension, score, expected: expected.length, present: present.length });
    if (score != null && panelId) {
      await sb.from('dimension_scores').insert({
        client_id: clientId, panel_id: panelId, dimension: d.dimension,
        score, basis: 'calculated', markers_expected: expected.length,
        markers_present: present.length,
        detail: { markers: present.map(p => ({ slug: p.marker.slug, value: p.value, flag: p.flag })) },
      });
    }
  }

  // ---- coaching, retrieved, never from model knowledge ----
  const lines = [];
  for (const a of accepted) {
    const { data: hits } = await sb.rpc('search_passages', {
      q: a.marker.name + ' ' + (a.marker.dimension || '') + ' ' + a.marker.slug.replace(/-/g, ' '),
      k: 2, qvec: null, min_rank: 0.01,
    });
    const top = (hits || [])[0] || null;
    lines.push({
      in_panel: inPanel ? inPanel.has(a.marker.id) : null,
      slug: a.marker.slug, name: a.marker.name, value: a.value, unit: a.unit,
      flag: a.flag, role: a.marker.role, dimension: a.marker.dimension,
      conversion: a.conversion,
      passage_id: top ? top.id : null,
      tier: top ? top.evidence_tier : null,
      tier_wording: top && canClaim(top.evidence_tier) ? wordingFor(top.evidence_tier) : null,
      screening: screeningFor(a.marker.slug, a.flag).map(r => ({ on: r.on, flag: r.flag })),
      context: top ? top.passage.slice(0, 600) : null,
    });
  }

  const runId = await startRun(env, AGENT, { clientId, model: MODEL_PER_CLIENT });
  let prose = '';
  try {
    prose = await ask(env, {
      system: [IDENTITY, MODEL_SUMMARY, GUARDRAILS,
        'READING LEVEL. ' + (TIER_VOICE[body.tier] || TIER_VOICE.intermediate),
        'You are writing the short note that sits above a results table. You are ' +
        'given the markers, their flags, and one retrieved passage each. Use ONLY ' +
        'those. Do not say what a marker means from your own knowledge. Do not ' +
        'invent a number. Do not name a supplement, a brand or a price. No em dash. ' +
        'If any marker carries a screening row, say that it goes to their ' +
        'prescriber BEFORE anything else.',
        'MARKERS:\n' + JSON.stringify(lines.map(l => ({
          name: l.name, value: l.value, unit: l.unit, flag: l.flag,
          tier: l.tier, screening: l.screening.map(s => s.on), context: l.context,
        })), null, 1)].join('\n\n'),
      messages: [{ role: 'user', content: 'Write the note.' }],
      maxTokens: 500,
    });
    await finishRun(env, runId, 'ok', {});
  } catch (e) {
    await finishRun(env, runId, 'error', { error: String(e).slice(0, 400) });
  }

  // markers the panel includes that did not arrive, and markers outside it
  const notInPanel = inPanel
    ? (markers || []).filter(m => !inPanel.has(m.id)).map(m => m.slug) : [];
  const orderedButMissing = inPanel
    ? (markers || []).filter(m => inPanel.has(m.id)
        && !accepted.some(a => a.marker.id === m.id)).map(m => m.slug) : [];

  return json({
    panel_id: declaredPanel,
    not_in_your_panel: notInPanel,
    in_your_panel_but_not_reported: orderedButMissing,
    accepted: accepted.length, held: held.length,
    held_detail: held,
    dimensions: dimOut,
    markers: lines,
    note: stripDashes(String(prose || '').trim()) || null,
  });
}
