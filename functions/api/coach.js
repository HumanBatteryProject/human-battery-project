// The coach. POST /api/coach  { question }
//
// The order is the whole design and it is not negotiable:
//
//   1. CLASSIFY. Anything medical routes out before retrieval runs. This is a
//      step, not a line in the system prompt, because a prompt can be argued
//      with and a branch cannot.
//   2. RETRIEVE. Every reply is built from passages in the corpus. The coach
//      does not answer from the model's own knowledge of nutrition, light or
//      medicine, because that knowledge is not tiered, not ours, and not
//      auditable.
//   3. FLOOR. If nothing comes back above the similarity floor, the coach says
//      it does not have that in the program. It does not improvise.
//   4. TIER. A claim may only be stated from a passage whose tier is not
//      `unsupported`, and the tier's consumer wording is rendered with it.
//   5. LOG. Passage ids and tiers are written to coach_turns, so a wrong
//      answer is traceable to a passage rather than argued about.
//
// The model writes the connective prose. It is given the passages and is told
// it may not add facts to them. Everything load-bearing, the tier wording, the
// Score disclaimer, the screening rows, is assembled here in code.

import {
  json, supabase, ask, startRun, finishRun, MODEL_PER_CLIENT,
} from './_agent.js';
import { IDENTITY, MODEL_SUMMARY, GUARDRAILS, TIER_VOICE, stripDashes } from './_voice.js';
import { canClaim, wordingFor, SCORE_DISCLAIMER, SCORE_TRIGGER } from './_evidence.js';
import { classify, prescriberReply, URGENT_REPLY } from './_medical.js';

const AGENT = 'coach';

// DECISION LEFT TO THE OWNER. The similarity floor below which the coach
// declines rather than improvising. Set conservatively: too low and the coach
// answers from a loosely related passage, which reads authoritative and is the
// failure this whole design exists to prevent. Too high and it declines things
// it holds. 0.05 is the lexical-rank floor; when embeddings arrive the natural
// value is nearer 0.25 on cosine, hence two constants rather than one.
export const FLOOR_LEXICAL = 0.05;
export const FLOOR_VECTOR  = 0.25;
// DECISION LEFT TO THE OWNER. How many passages the reply may be built from.
export const RETRIEVE_K = 6;
// DECISION LEFT TO THE OWNER. Turns per client per day.
export const DAILY_LIMIT = 20;

const DECLINE =
  'I do not have that in the program. I only answer from the book and your ' +
  'program documents, and this is not in them. Two good places to take it: ' +
  'your prescriber if it is medical, or the weekly call, where it can go to ' +
  'the trend review.';

function systemPrompt(tier, passages, scoreAsked) {
  const numbered = passages.map((p, i) =>
    '[' + (i + 1) + '] tier=' + p.evidence_tier +
    (p.chapter ? ' chapter=' + p.chapter : '') +
    (p.is_authors_model ? ' (the author marks this as his own model)' : '') +
    '\n' + p.passage).join('\n\n');

  return [
    IDENTITY,
    MODEL_SUMMARY,
    GUARDRAILS,
    'READING LEVEL. ' + (TIER_VOICE[tier] || TIER_VOICE.intermediate),
    'YOU ARE ANSWERING FROM THESE PASSAGES AND NOTHING ELSE. Do not add a fact ' +
    'that is not in them. If they do not answer the question, say so plainly ' +
    'rather than filling the gap. Do not name a supplement, a brand or a price. ' +
    'Do not use an em dash. Write in the second person, plainly, in the register ' +
    'of the passages. No motivational filler, no encouragement, no exclamation.',
    scoreAsked
      ? 'THE SCORE IS BEING DISCUSSED. This sentence is appended to your reply ' +
        'verbatim by the caller. Do not paraphrase it and do not repeat it: ' +
        SCORE_DISCLAIMER
      : '',
    'PASSAGES:\n\n' + numbered,
  ].filter(Boolean).join('\n\n');
}

export async function onRequestPost({ request, env }) {
  const sb = supabase(env);

  const auth = request.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!jwt) return json({ error: 'sign in first' }, 401);
  const { data: who, error: whoErr } = await sb.auth.getUser(jwt);
  if (whoErr || !who || !who.user) return json({ error: 'sign in first' }, 401);
  const clientId = who.user.id;

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const question = String(body.question || '').trim();
  if (!question) return json({ error: 'ask something' }, 400);
  if (question.length > 1000) return json({ error: 'too long, ask it shorter' }, 400);

  // rate limit, counted from the log rather than held in memory
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from('coach_turns')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).gte('asked_at', since);
  if ((count || 0) >= DAILY_LIMIT) {
    return json({ error: 'That is today\'s limit. The weekly call has no limit.' }, 429);
  }

  const log = async (route, patch) => {
    await sb.from('coach_turns').insert({
      client_id: clientId, question, route, ...patch,
    });
  };

  // ---- 1. classify, before any retrieval ----
  const verdict = classify(question);
  if (verdict.route === 'urgent') {
    await log('urgent', { reply: URGENT_REPLY });
    return json({ reply: URGENT_REPLY, route: 'urgent', passages: [] });
  }
  if (verdict.route === 'prescriber') {
    const reply = prescriberReply(verdict.rows);
    await log('prescriber', { reply });
    return json({ reply, route: 'prescriber', passages: [] });
  }

  // ---- 2. retrieve ----
  const { data: hits, error: rErr } = await sb.rpc('search_passages', {
    q: question, k: RETRIEVE_K, qvec: null, min_rank: FLOOR_LEXICAL,
  });
  if (rErr) return json({ error: 'retrieval failed', detail: rErr.message }, 500);

  const usable = (hits || []).filter(h => (h.score || 0) >= FLOOR_LEXICAL);

  // ---- 3. floor ----
  if (!usable.length) {
    await log('declined', { reply: DECLINE, top_score: (hits && hits[0] && hits[0].score) || null });
    return json({ reply: DECLINE, route: 'declined', passages: [] });
  }

  // ---- 4. tier ----
  const claimable = usable.filter(h => canClaim(h.evidence_tier));
  const scoreAsked = SCORE_TRIGGER.test(question);

  const { data: prof } = await sb.from('memberships')
    .select('tier').eq('client_id', clientId).is('ended_at', null).maybeSingle();
  const tier = (prof && prof.tier) || 'intermediate';

  const runId = await startRun(env, AGENT, { clientId, model: MODEL_PER_CLIENT });
  let text;
  try {
    text = await ask(env, {
      system: systemPrompt(tier, usable, scoreAsked),
      messages: [{ role: 'user', content: question }],
      maxTokens: 700,
    });
  } catch (e) {
    await finishRun(env, runId, 'error', { error: String(e).slice(0, 400) });
    return json({ error: 'the coach is unavailable right now' }, 503);
  }

  text = stripDashes(String(text || '').trim());

  // the tier line is assembled here, never by the model
  const lead = claimable.length
    ? wordingFor(claimable[0].evidence_tier) + '. '
    : 'The book discusses this without settling it. ';
  let reply = lead + text;
  if (scoreAsked) reply += '\n\n' + SCORE_DISCLAIMER;

  await finishRun(env, runId, 'ok', {});
  await log('coach', {
    passage_ids: usable.map(h => h.id),
    tiers: usable.map(h => h.evidence_tier),
    top_score: usable[0].score,
    reply, model: MODEL_PER_CLIENT, run_id: runId,
  });

  return json({
    reply, route: 'coach',
    tier_rendered: claimable.length ? claimable[0].evidence_tier : null,
    passages: usable.map(h => ({
      id: h.id, chapter: h.chapter, section: h.section,
      tier: h.evidence_tier, score: h.score,
    })),
  });
}
