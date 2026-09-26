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
import {
  symptomsAndFunction, fitnessMeasures, laboratoryResults,
  habitsAndConsistency, remainingUncertainties, maintenancePriorities,
} from './_completion.js';

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

  // Everything D8 asks to compare. Six comparisons, not two.
  //
  // The logs query used to select adherence_pct alone, which is why four of the
  // six comparisons could not be made: the data was never fetched.
  const logs = await sb.select('daily_logs', {
    where: { client_id: clientId },
    columns: 'log_date,program_day,adherence_pct,daily_five_score,energy,symptoms',
    order: 'log_date.asc',
  });
  const adherence = (logs || []).length
    ? Math.round((logs.reduce((a, b) => a + Number(b.adherence_pct || 0), 0) / logs.length)) : null;

  // Labs: three plain queries rather than one nested embed. The panel carries the
  // client and the draw point, the result carries the value, the marker carries
  // the direction, and an ambiguous PostgREST embed across three tables is how
  // this breaks silently at deploy time rather than loudly here.
  const panels = await sb.select('lab_panels', {
    where: { client_id: clientId }, columns: 'id,draw_point,drawn_on' });
  const panelIds = (panels || []).map((r) => r.id);
  let labResults = [];
  if (panelIds.length) {
    labResults = await sb.select('lab_results', {
      columns: 'panel_id,marker_id,value,unit',
      raw: `panel_id=in.(${panelIds.join(',')})`,
    });
  }
  const markerDefs = await sb.select('lab_markers', {
    columns: 'id,slug,name,unit,better_direction,role' });

  // Latest panel per draw point, so a repeat draw does not produce two baselines.
  const panelAt = {};
  for (const pnl of (panels || [])) {
    const cur = panelAt[pnl.draw_point];
    if (!cur || String(pnl.drawn_on || '') > String(cur.drawn_on || '')) panelAt[pnl.draw_point] = pnl;
  }
  const valueAt = (point, markerId) => {
    const pnl = panelAt[point];
    if (!pnl) return null;
    const hit = labResults.find((r) => r.panel_id === pnl.id && r.marker_id === markerId);
    return hit ? hit.value : null;
  };
  const markerRows = (markerDefs || []).map((md) => ({
    slug: md.slug, name: md.name, unit: md.unit, role: md.role,
    better_direction: md.better_direction,
    day0: valueAt('day_0', md.id),
    day90: valueAt('day_90', md.id),
  }));

  const tests = await sb.select('functional_tests', {
    where: { client_id: clientId },
    columns: 'draw_point,tested_on,method,vo2max,mets,hr_recovery_60s,lactate_rest_mmol,fixed_load_watts',
  });

  // The frontier dimensions are uncertain by construction, not by omission, and
  // the table already carries the sentence that says why.
  const frontier = await sb.select('state_dimensions', {
    where: { is_scored: false }, columns: 'dimension,body' });

  const heldCount = await sb.count('lab_results_held', { client_id: clientId }, 'resolved_at=is.null');

  const symptoms = symptomsAndFunction(logs);
  const fitness = fitnessMeasures(tests);
  const labs = laboratoryResults(markerRows);
  const habits = habitsAndConsistency(logs, 90);
  const uncertainties = remainingUncertainties({
    dimensions, labs, fitness, habits, frontier, held: heldCount });
  const priorities = maintenancePriorities({ dimensions, labs, habits });

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
                  membership_id: m.id,
                  comparisons: {
                    symptoms_function: symptoms.available, fitness: fitness.available,
                    laboratory: labs.available, habits: habits.available,
                    uncertainties: uncertainties.count, priorities: priorities.available,
                  },
                  would_write: 'completion_summaries, memberships, continuation offer, next cycle' });
  }

  const runId = await startRun(env, AGENT, { clientId, model: MODEL_PER_CLIENT });
  let narrative = '';
  try {
    const r = await ask(env, {
      system: [IDENTITY, MODEL_SUMMARY, GUARDRAILS,
        'READING LEVEL. ' + (TIER_VOICE[m.tier] || TIER_VOICE.intermediate),
        'You are writing a short day 90 summary. You are given six comparisons. ' +
        'Use ONLY the numbers in them. Do not invent one. Do not promise an ' +
        'outcome. No supplement, brand or price. No em dash. If a dimension shows ' +
        'fewer markers than expected, say the score rests on fewer markers rather ' +
        'than treating it as equal.',
        // Every section can say available: false. That is a fact to report, not a
        // gap to fill, and it is the most likely thing to get written over: a
        // missing baseline invites a sentence about progress that nothing
        // measured. Say what is missing instead.
        'WHERE A COMPARISON SAYS available false, SAY SO PLAINLY and move on. Do ' +
        'not describe a change you were not given. Do not average an absent value ' +
        'to zero. A marker listed under unjudged changed but has no established ' +
        'better direction, so report the change and do not call it good or bad.',
        // The priorities are computed from the stored numbers by rule. The model
        // may phrase them and must not add to them, or the summary starts
        // prescribing.
        'THE MAINTENANCE PRIORITIES ARE GIVEN TO YOU. Restate them in your own ' +
        'plain words. Do not add a priority that is not in the list, and do not ' +
        'drop one that is.',
        JSON.stringify({
          dimensions, adherence_pct: adherence, days_logged: (logs || []).length,
          symptoms_and_function: symptoms, fitness_measures: fitness,
          laboratory_results: labs, habits_and_consistency: habits,
          remaining_uncertainties: uncertainties, maintenance_priorities: priorities,
        })].join('\n\n'),
      messages: [{ role: 'user', content: 'Write the summary.' }],
      // Raised from 500 when the prompt grew to carry all six comparisons. At 500
      // the thinking block consumed the entire budget and no text was written at
      // all. The budget has to cover the thinking as well as the summary.
      maxTokens: 2000,
    });
    narrative = r.text;
    await finishRun(env, runId, 'ok',
      { tokens_in: r.tokensIn, tokens_out: r.tokensOut });
  } catch (e) { await finishRun(env, runId, 'error', { error: String(e).slice(0, 300) }); }

  let summary, sErr = null;
  try { summary = (await sb.insert('completion_summaries', {
    membership_id: m.id, client_id: clientId, completed_on: endDate,
    dimensions, adherence_pct: adherence, days_logged: (logs || []).length,
    // markers_moved has existed as a column since the table was created and
    // nothing had ever written to it. The laboratory comparison is what it was
    // for.
    markers_moved: labs,
    symptoms_function: symptoms, fitness, habits,
    uncertainties, maintenance_priorities: priorities,
    narrative: stripDashes(String(narrative || '').trim()) || null,
    next_tier: nxt.next_tier, next_multiplier: nxt.next_multiplier,
  }, { returning: true }))[0]; } catch (e) { sErr = { message: String(e) }; }
  if (sErr || !summary) return json({ error: (sErr && sErr.message) || 'no summary' }, 500);

  // ---- close the completed cycle. The ONLY write to it, and it is terminal ----
  await sb.update('memberships', { id: m.id },
    { completed_on: endDate, status: 'completed', completion_summary_id: summary.id });

  // ---- the continuation offer ----
  //
  // completion_invitations existed as a table with no writer and no reader, so
  // the offer at the end of the program was a column layout rather than a
  // feature. D8 ends with carrying the participant's history into membership, and
  // this row is what the billing screen reads to know there is something to
  // accept.
  //
  // It is an OFFER and nothing more. It creates no entitlement and charges
  // nothing. D9 forbids silent conversion from the initial protocol, and
  // program_settings.day_90_default is 'lapse', so an offer that enrolled anybody
  // by existing would contradict both. Accepting it is a purchase, and the
  // purchase is the only thing that writes an entitlement.
  let offer = null, oErr = null;
  try {
    offer = (await sb.insert('completion_invitations', {
      client_id: clientId,
      from_membership_id: m.id,
      offered_tier: nxt.next_tier,
      offered_multiplier: nxt.next_multiplier,
      improved,
      score_delta: composite,
      // The markers that actually moved the right way, by name. Empty is a real
      // answer and is stored as empty rather than as nothing.
      markers_improved: (labs && labs.improved) || [],
      sent_at: new Date().toISOString(),
    }, { returning: true, upsert: 'from_membership_id' }))[0] || null;
  } catch (e) { oErr = String(e).slice(0, 200); }
  if (!offer) console.error('[complete] continuation offer not written:', oErr);

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
    comparisons: {
      symptoms_and_function: symptoms, fitness_measures: fitness,
      laboratory_results: labs, habits_and_consistency: habits,
      remaining_uncertainties: uncertainties, maintenance_priorities: priorities,
    },
    offer: offer
      ? { id: offer.id, tier: offer.offered_tier, multiplier: offer.offered_multiplier,
          improved: offer.improved, markers_improved: offer.markers_improved,
          creates_entitlement: false, charges_nothing: true }
      : { error: oErr || 'not written' },
    next: { membership_id: next.id, tier: nxt.next_tier, cycle: next.cycle, day_zero: nextStart,
            multiplier: nxt.next_multiplier, reason: nxt.reason,
            carried_parameters: applied },
  });
}
