// The completion agent. POST /api/complete { client_id, force_end_date? }
//
// At day 90: a summary written from stored scores and logs, then the next
// cycle created and linked. The completed cycle is NEVER mutated. If day 90
// can be edited by anything that happens afterwards, the day 0 to day 90
// comparison stops being a comparison, which is the only thing the program
// actually sells.
//
// force_end_date exists because no real member reaches day 90 for three months
// and Stripe is parked. It moves the clock, not the rules.

import {
  json, supabase, ask, startRun, finishRun, hasServiceSecret, verifyStaff,
  MODEL_PER_CLIENT,
} from './_agent.js';
import { IDENTITY, MODEL_SUMMARY, GUARDRAILS, TIER_VOICE, stripDashes } from './_voice.js';
import { nextCycle, applyMultiplier } from './_intensity.js';

const AGENT = 'completion';
// DECISION LEFT TO THE OWNER. What counts as improved, for the tier decision.
export const IMPROVED_MIN_POINTS = 5;        // composite points, day 0 to day 90

export async function onRequestPost({ request, env }) {
  const sb = supabase(env);
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }
  let body = {}; try { body = await request.json(); } catch (e) {}
  const clientId = body.client_id;
  if (!clientId) return json({ error: 'client_id required' }, 400);

  const { data: m } = await sb.from('memberships')
    .select('*').eq('client_id', clientId).is('completed_on', null)
    .order('cycle', { ascending: false }).limit(1).maybeSingle();
  if (!m) return json({ error: 'no open membership' }, 404);

  const endDate = body.force_end_date ||
    (m.day_zero ? new Date(new Date(m.day_zero).getTime() + 90 * 86400000).toISOString().slice(0, 10) : null);
  if (!endDate) return json({ error: 'no day zero and no forced end date' }, 400);

  // ---- the summary, from STORED values only ----
  const { data: dims } = await sb.from('dimension_scores')
    .select('dimension, score, draw_point, markers_present, markers_expected, computed_at')
    .eq('client_id', clientId).order('computed_at');
  const first = {}, last = {};
  for (const d of (dims || [])) {
    if (!first[d.dimension]) first[d.dimension] = d;
    last[d.dimension] = d;
  }
  const dimensions = {};
  for (const k of Object.keys(last)) {
    dimensions[k] = {
      day0: first[k] ? Number(first[k].score) : null,
      day90: Number(last[k].score),
      change: first[k] ? Number(last[k].score) - Number(first[k].score) : null,
      markers_present: last[k].markers_present, markers_expected: last[k].markers_expected,
    };
  }
  const changes = Object.values(dimensions).map(d => d.change).filter(x => x != null);
  const composite = changes.length ? Math.round(changes.reduce((a, b) => a + b, 0) / changes.length) : null;

  const { data: logs } = await sb.from('daily_logs')
    .select('adherence_pct').eq('client_id', clientId);
  const adherence = (logs || []).length
    ? Math.round((logs.reduce((a, b) => a + Number(b.adherence_pct || 0), 0) / logs.length)) : null;

  const improved = composite != null && composite >= IMPROVED_MIN_POINTS;
  const nxt = nextCycle({ tier: m.tier, improved, currentMultiplier: Number(m.intensity_multiplier || 1) });

  // ---- narrative, from stored numbers, never invented ----
  const runId = await startRun(env, AGENT, { clientId, model: MODEL_PER_CLIENT });
  let narrative = '';
  try {
    narrative = await ask(env, {
      system: [IDENTITY, MODEL_SUMMARY, GUARDRAILS,
        'READING LEVEL. ' + (TIER_VOICE[m.tier] || TIER_VOICE.intermediate),
        'You are writing a short day 90 summary. You are given the dimension ' +
        'scores at day 0 and day 90 and the adherence. Use ONLY those numbers. ' +
        'Do not invent one. Do not promise an outcome. No supplement, brand or ' +
        'price. No em dash. If a dimension shows fewer markers than expected, ' +
        'say the score rests on fewer markers rather than treating it as equal.',
        JSON.stringify({ dimensions, adherence_pct: adherence,
                         days_logged: (logs || []).length })].join('\n\n'),
      messages: [{ role: 'user', content: 'Write the summary.' }],
      maxTokens: 500,
    });
    await finishRun(env, runId, 'ok', {});
  } catch (e) { await finishRun(env, runId, 'error', { error: String(e).slice(0, 300) }); }

  const { data: summary, error: sErr } = await sb.from('completion_summaries').insert({
    membership_id: m.id, client_id: clientId, completed_on: endDate,
    dimensions, adherence_pct: adherence, days_logged: (logs || []).length,
    narrative: stripDashes(String(narrative || '').trim()) || null,
    next_tier: nxt.next_tier, next_multiplier: nxt.next_multiplier,
  }).select().maybeSingle();
  if (sErr) return json({ error: sErr.message }, 500);

  // ---- close the completed cycle. The ONLY write to it, and it is terminal ----
  await sb.from('memberships').update({
    completed_on: endDate, status: 'completed', completion_summary_id: summary.id,
  }).eq('id', m.id);

  // ---- chain: a NEW row, linked, never an edit of the old one ----
  const applied = [];
  const { data: approved } = await sb.from('proposals')
    .select('param, to_value').eq('client_id', clientId).eq('status', 'applied');
  const { data: bounds } = await sb.from('protocol_parameters')
    .select('*').eq('tier', nxt.next_tier);
  for (const p of (approved || [])) {
    const b = (bounds || []).find(x => x.param === p.param);
    if (!b) continue;                                   // not a parameter of the next tier
    const scaled = applyMultiplier(p.param, p.to_value, nxt.next_multiplier);
    const v = Math.min(Number(b.max_value), Math.max(Number(b.min_value), scaled.value));
    applied.push({ param: p.param, carried: Number(p.to_value), next: v, capped: scaled.capped });
  }

  const { data: next, error: nErr } = await sb.from('memberships').insert({
    client_id: clientId, tier: nxt.next_tier, cycle: Number(m.cycle || 1) + 1,
    intensity_multiplier: nxt.next_multiplier, previous_membership_id: m.id,
    status: 'pending', arm: m.arm,
  }).select().maybeSingle();
  if (nErr) return json({ error: nErr.message, summary_id: summary.id }, 500);

  return json({
    completed: { membership_id: m.id, on: endDate, immutable: true },
    summary_id: summary.id,
    composite_change: composite, improved, adherence_pct: adherence,
    dimensions,
    next: { membership_id: next.id, tier: nxt.next_tier, cycle: next.cycle,
            multiplier: nxt.next_multiplier, reason: nxt.reason,
            carried_parameters: applied },
  });
}
