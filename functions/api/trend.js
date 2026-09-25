// The trend agent. POST /api/trend
//
// Weekly. Compares this week's dimensions and logged inputs to the prior four,
// writes a proposal, and under bounded autonomy APPLIES it when all five
// bounds hold. Anything outside the bounds goes to the review queue instead of
// being applied. This replaces the approve-everything queue in brief 06
// section 7, per brief 06A A3.
//
// The reason autonomy is safe here is not the model's judgement. It is that
// the model does not get a vote on the bounds: evaluate() is pure, the bounds
// live in protocol_parameters, and the agent's only job is to propose a
// parameter and a target. Whether that target is allowed is arithmetic.

import {
  json, db, ask, startRun, finishRun, hasServiceSecret, verifyStaff,
  MODEL_ACROSS_CLIENTS,
} from './_agent.js';
import { IDENTITY, MODEL_SUMMARY, GUARDRAILS, stripDashes } from './_voice.js';
import { evaluate, AUTONOMY_MODE, CONFIDENCE_WINDOW_DAYS } from './_autonomy.js';
import { SCREENING_ROWS } from './_medical.js';

const AGENT = 'trend';

// Which interventions a member is flagged on, from their own intake answers.
async function screeningFlags(sb, clientId) {
  const data = await sb.select('intake_responses',
    { where: { client_id: clientId }, columns: 'answer' });
  const blob = JSON.stringify(data || []).toLowerCase();
  const flags = new Set();
  for (const r of SCREENING_ROWS) {
    if (r.match.test(blob)) {
      if (/sauna|cold/i.test(r.flag)) { flags.add('sauna'); flags.add('cold'); }
      if (/eating window/i.test(r.flag)) flags.add('eating window');
      if (/salt|morning glass/i.test(r.flag)) { flags.add('sodium'); flags.add('water'); }
      if (/three liters/i.test(r.flag)) flags.add('water');
      if (/light|wake time/i.test(r.flag)) { flags.add('morning light'); flags.add('sleep schedule'); }
    }
  }
  return [...flags];
}

export async function onRequestPost({ request, env }) {
  const sb = db(env);
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }
  let body = {}; try { body = await request.json(); } catch (e) {}
  const only = body.client_id || null;

  const where = { status: 'active' };
  if (only) where.client_id = only;
  const members = await sb.select('memberships',
    { where, columns: 'id,client_id,tier', raw: 'onboarded_at=not.is.null' });

  const out = { mode: AUTONOMY_MODE, applied: 0, queued: 0, members: [] };

  for (const m of (members || [])) {
    const since = new Date(Date.now() - CONFIDENCE_WINDOW_DAYS * 86400000)
      .toISOString().slice(0, 10);
    const logs = await sb.select('daily_logs', {
      where: { client_id: m.client_id },
      columns: 'log_date,morning_light_min,water_ml,first_meal_at,last_meal_at',
      raw: 'log_date=gte.' + since });
    const daysLogged = (logs || []).length;

    // the agent proposes a parameter and a target; it does not decide whether
    // the target is allowed
    const bounds = await sb.select('protocol_parameters', { where: { tier: m.tier } });

    // the weakest observable input decides which parameter is proposed
    const avgLight = daysLogged
      ? (logs.reduce((a, b) => a + (b.morning_light_min || 0), 0) / daysLogged) : 0;
    const bound = (bounds || []).find(b => b.param === 'morning_light_min');
    if (!bound) { out.members.push({ client_id: m.client_id, skipped: 'no bounds for tier' }); continue; }

    const from = Math.round(avgLight);
    const to = Math.min(Number(bound.max_value), from + Number(bound.weekly_step));
    if (to === from) { out.members.push({ client_id: m.client_id, skipped: 'already at target' }); continue; }

    // the justification must come from the corpus, with its tier
    const hits = await sb.rpc('search_passages', {
      q: 'morning light exposure sets the circadian clock timing', k: 3, qvec: null, min_rank: 0.01,
    });
    const passages = hits || [];
    const tiers = passages.map(p => p.evidence_tier);
    const counter = passages.find(p => p.evidence_tier === 'contested') || null;

    const flags = await screeningFlags(sb, m.client_id);
    const verdict = evaluate({
      param: 'morning_light_min', from_value: from, to_value: to, tier: m.tier,
      bound, tiers, flags, days_logged: daysLogged, window_days: CONFIDENCE_WINDOW_DAYS,
    });

    const runId = await startRun(env, AGENT, { clientId: m.client_id, model: MODEL_ACROSS_CLIENTS });
    let rationale = '';
    try {
      const r = await ask(env, {
        system: [IDENTITY, MODEL_SUMMARY, GUARDRAILS,
          'You are writing ONE plain sentence telling a member what changed and ' +
          'why. You are given the parameter, the old and new value, and the ' +
          'passages that justify it. Use only those. No number you were not ' +
          'given. No supplement, brand or price. No em dash. Second person.',
          JSON.stringify({ param: 'morning light minutes', from, to,
            passages: passages.map(p => p.passage.slice(0, 400)) })].join('\n\n'),
        messages: [{ role: 'user', content: 'Write the sentence.' }],
        maxTokens: 160,
      });
      rationale = r.text;
      await finishRun(env, runId, 'ok',
        { tokens_in: r.tokensIn, tokens_out: r.tokensOut });
    } catch (e) { await finishRun(env, runId, 'error', { error: String(e).slice(0, 300) }); }

    const row = {
      client_id: m.client_id, membership_id: m.id, param: 'morning_light_min',
      from_value: from, to_value: to,
      rationale: stripDashes(String(rationale || '').trim()) || 'Morning light is below target for this tier.',
      passage_ids: passages.map(p => p.id),
      evidence_tier: tiers[0] || null,
      counter_evidence: counter ? counter.id : null,
      weak_justification: verdict.weak,
      status: verdict.apply ? 'applied' : 'queued',
      permitted_by: verdict.permitted_by, blocked_by: verdict.blocked_by,
      applied_at: verdict.apply ? new Date().toISOString() : null,
    };
    await sb.insert('proposals', row);
    if (verdict.apply) out.applied++; else out.queued++;
    out.members.push({ client_id: m.client_id, param: row.param, from, to,
      status: row.status, permitted_by: row.permitted_by, blocked_by: row.blocked_by,
      weak: row.weak_justification, days_logged: daysLogged });
  }
  return json(out);
}
