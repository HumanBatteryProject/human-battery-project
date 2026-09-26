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
  json, db, ask, startRun, finishRun, hasServiceSecret, verifyStaff,
  MODEL_PER_CLIENT,
} from './_agent.js';
import { IDENTITY, MODEL_SUMMARY, GUARDRAILS, TIER_VOICE, stripDashes } from './_voice.js';
import { nextCycle, applyMultiplier } from './_intensity.js';

const AGENT = 'completion';
// DECISION LEFT TO THE OWNER. What counts as improved, for the tier decision.
export const IMPROVED_MIN_POINTS = 5;        // composite points, day 0 to day 90

export async function onRequestPost({ request, env }) {
  const sb = db(env);
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }
  let body = {}; try { body = await request.json(); } catch (e) {}
  const clientId = body.client_id;
  if (!clientId) return json({ error: 'client_id required' }, 400);

  const m = await sb.one('memberships',
    { where: { client_id: clientId, completed_on: null }, order: 'cycle.desc' });
  if (!m) return json({ error: 'no open membership' }, 404);

  const endDate = body.force_end_date ||
    (m.day_zero ? new Date(new Date(m.day_zero).getTime() + 90 * 86400000).toISOString().slice(0, 10) : null);
  if (!endDate) return json({ error: 'no day zero and no forced end date' }, 400);

  // ---- the summary, from STORED values only ----
  const dims = await sb.select('dimension_scores', {
    where: { client_id: clientId },
    columns: 'dimension,score,draw_point,markers_present,markers_expected,computed_at',
    order: 'computed_at.asc' });
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

  const logs = await sb.select('daily_logs',
    { where: { client_id: clientId }, columns: 'adherence_pct' });
  const adherence = (logs || []).length
    ? Math.round((logs.reduce((a, b) => a + Number(b.adherence_pct || 0), 0) / logs.length)) : null;

  const improved = composite != null && composite >= IMPROVED_MIN_POINTS;
  const nxt = nextCycle({ tier: m.tier, improved, currentMultiplier: Number(m.intensity_multiplier || 1) });

  // ---- narrative, from stored numbers, never invented ----
  // dry_run exists so the post-deploy smoke test can prove this endpoint is
  // reachable, authorizing, and finding its data, WITHOUT the side effect. This
  // one is not idempotent: each call writes a completion
  // summary, marks the membership completed, and chains the next cycle. So a smoke test that
  // called it for real on every deploy would corrupt the test member a little
  // more each time, and a smoke test nobody dares run is not a smoke test.
  const dryRun = body.dry_run === true;
  if (dryRun) {
    return json({ ok: true, dry_run: true, client_id: clientId, end_date: endDate,
                  membership_id: m.id, would_write: 'completion_summaries, memberships, next cycle' });
  }

  const runId = await startRun(env, AGENT, { clientId, model: MODEL_PER_CLIENT });
  let narrative = '';
  try {
    const r = await ask(env, {
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
    narrative = r.text;
    await finishRun(env, runId, 'ok',
      { tokens_in: r.tokensIn, tokens_out: r.tokensOut });
  } catch (e) { await finishRun(env, runId, 'error', { error: String(e).slice(0, 300) }); }

  let summary, sErr = null;
  try { summary = (await sb.insert('completion_summaries', {
    membership_id: m.id, client_id: clientId, completed_on: endDate,
    dimensions, adherence_pct: adherence, days_logged: (logs || []).length,
    narrative: stripDashes(String(narrative || '').trim()) || null,
    next_tier: nxt.next_tier, next_multiplier: nxt.next_multiplier,
  }, { returning: true }))[0]; } catch (e) { sErr = { message: String(e) }; }
  if (sErr || !summary) return json({ error: (sErr && sErr.message) || 'no summary' }, 500);

  // ---- close the completed cycle. The ONLY write to it, and it is terminal ----
  await sb.update('memberships', { id: m.id },
    { completed_on: endDate, status: 'completed', completion_summary_id: summary.id });

  // ---- chain: a NEW row, linked, never an edit of the old one ----
  const applied = [];
  const approved = await sb.select('proposals',
    { where: { client_id: clientId, status: 'applied' }, columns: 'param,to_value' });
  const bounds = await sb.select('protocol_parameters', { where: { tier: nxt.next_tier } });
  for (const p of (approved || [])) {
    const b = (bounds || []).find(x => x.param === p.param);
    if (!b) continue;                                   // not a parameter of the next tier
    const scaled = applyMultiplier(p.param, p.to_value, nxt.next_multiplier);
    const v = Math.min(Number(b.max_value), Math.max(Number(b.min_value), scaled.value));
    applied.push({ param: p.param, carried: Number(p.to_value), next: v, capped: scaled.capped });
  }

  // The next cycle's start date: the next 1st or 15th after this one ended, with
  // no lead time, because a continuing participant already has a protocol and
  // their day 90 draw is the next cycle's day 0 draw. A cycle with no day_zero
  // has no program day and the brief cannot place it, which is exactly what
  // happened the first time chaining succeeded.
  let nextStart = null;
  try {
    const r = await sb.rpc('next_start_date_after', { p_after: endDate });
    nextStart = typeof r === 'string' ? r : (Array.isArray(r) ? r[0] : (r && r.next_start_date_after)) || null;
  } catch (e) {
    console.warn('[complete] next start date lookup failed:', String(e).slice(0, 140));
  }

  let next, nErr = null;
  try { next = (await sb.insert('memberships', {
    client_id: clientId, tier: nxt.next_tier, cycle: Number(m.cycle || 1) + 1,
    day_zero: nextStart,
    intensity_multiplier: nxt.next_multiplier, previous_membership_id: m.id,
    // There is no cohort. Removed in 061: memberships was unique on
    // (client_id, cohort_id) with cohort_id NOT NULL, which meant cycle 2 for the
    // same person was a duplicate and chaining could not work at all. The
    // invariant is now unique (client_id, cycle).
    //
    // 'pending' is not a membership_status. The enum is invited, enrolled,
    // active, completed, withdrawn, so every attempt to chain a next cycle
    // failed with 22P02 and cycle chaining has never once worked. Found by the
    // first run of the post-deploy smoke test.
    //
    // 'enrolled' rather than 'active' is deliberate and is the safe value:
    // the next cycle exists and is linked, but it is not running. Master
    // prompt D9 forbids silent conversion from the initial protocol, and
    // program_settings.day_90_default is 'lapse', so a cycle that started
    // itself would contradict both. Activating it is the continuation
    // purchase, built on Day 10.
    status: 'enrolled', arm: m.arm, is_internal: m.is_internal,
  }, { returning: true }))[0]; } catch (e) { nErr = { message: String(e) }; }
  if (nErr || !next) return json({ error: (nErr && nErr.message) || 'no next cycle', summary_id: summary.id }, 500);

  return json({
    completed: { membership_id: m.id, on: endDate, immutable: true },
    summary_id: summary.id,
    composite_change: composite, improved, adherence_pct: adherence,
    dimensions,
    next: { membership_id: next.id, tier: nxt.next_tier, cycle: next.cycle, day_zero: nextStart,
            multiplier: nxt.next_multiplier, reason: nxt.reason,
            carried_parameters: applied },
  });
}
