// The morning brief. POST /api/brief-run
//
// THE BRIEF IS ASSEMBLED, NOT GENERATED. Everything factual in it comes from
// the database: yesterday's logged inputs, today's timing targets from the
// member's own protocol, one retrieved passage for the weakest dimension, and
// one action. The model writes the connective sentences between those and
// nothing else, because a model that is allowed to invent a number will
// eventually invent one that looks exactly as convincing as a real one.
//
// Called by workers/brief.js on a cron trigger, server to server, carrying
// WEBHOOK_SECRET. Or by a staff member for one member, to test.

import {
  json, db, ask, startRun, finishRun, hasServiceSecret, verifyStaff,
  MODEL_PER_CLIENT,
} from './_agent.js';
import { IDENTITY, MODEL_SUMMARY, GUARDRAILS, TIER_VOICE, stripDashes } from './_voice.js';

const AGENT = 'morning-brief';

// SET BY THE OWNER, Brief 07 section 0. The program default when
// profiles.timezone is null. Deliberately NOT UTC: UTC is a plausible-looking
// wrong answer that silently shifts a member's day. America/Chicago because
// the first cohort is in Texas, so a null reads as "same day as the cohort"
// rather than "some day".
export const DEFAULT_TZ = 'America/Chicago';
// DECISION LEFT TO THE OWNER. How many members one invocation will process.
export const BATCH_LIMIT = 200;
// DECISION LEFT TO THE OWNER. The reading grade a brief must not exceed.
export const MAX_GRADE = 6;

// The five scored dimensions, in model order.
const DIMENSIONS = ['flow', 'capacity', 'timing', 'structure', 'environment'];

// What the brief asks for when a member has logged nothing. One input, the one
// that matters most, not a zero-filled report. Ordered by how much the rest of
// the protocol depends on it.
const FIRST_ASK = [
  ['morning_light_min', 'how many minutes you got outside in the morning'],
  ['waketime',          'what time you woke up'],
  ['first_meal_at',     'what time you ate first'],
  ['last_meal_at',      'what time you ate last'],
  ['water_ml',          'how much water you drank'],
];

function localDate(tz) {
  // The member's day, never the server's.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function shiftDate(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weakestDimension(log) {
  // Without scores we reason from what was logged, which is what the member
  // can actually change today. Environment and timing are the two the daily
  // log measures directly, so they are the two that can be weak here.
  if (!log) return 'environment';
  if ((log.morning_light_min || 0) < 10) return 'environment';
  if (!log.waketime || !log.bedtime) return 'timing';
  if (!log.last_meal_at) return 'timing';
  if ((log.water_ml || 0) < 2000) return 'flow';
  return 'environment';
}

// A3: a change the trend agent applied since the last brief is stated plainly
// in the next one. The member is told what changed and why BEFORE they are
// asked to do anything, and they can decline it from the portal. An applied
// change a member only discovers by noticing their protocol is different is
// not bounded autonomy, it is a surprise.
async function appliedSinceLastBrief(sb, clientId) {
  const since = new Date(Date.now() - 8 * 86400000).toISOString();
  return sb.select('proposals', {
    where: { client_id: clientId, status: 'applied', declined_at: null, reverted_at: null },
    columns: 'id,param,from_value,to_value,rationale,evidence_tier,weak_justification',
    raw: 'applied_at=gte.' + since, order: 'applied_at.desc', limit: 3,
  });
}

const PARAM_WORDS = {
  morning_light_min: 'minutes outside in the morning',
  eating_window_hours: 'hours in your eating window',
  wake_time_shift_min: 'minutes on your wake time',
  sauna_min: 'minutes in the sauna',
  cold_min: 'minutes in the cold',
  water_l: 'liters of water',
  sodium_g: 'grams of salt',
};

export function changeSentence(p) {
  const what = PARAM_WORDS[p.param] || p.param;
  const dir = Number(p.to_value) > Number(p.from_value) ? 'up' : 'down';
  return 'Your target moved ' + dir + ' from ' + p.from_value + ' to ' +
    p.to_value + ' ' + what + '. ' + (p.rationale || '') +
    ' You can decline this in the portal under Program.';
}

export async function buildBrief(sb, env, member, today) {
  const yesterday = shiftDate(today, -1);
  const log = await sb.one('daily_logs', {
    where: { client_id: member.client_id, log_date: yesterday },
    columns: 'log_date,morning_light_min,waketime,bedtime,first_meal_at,last_meal_at,water_ml,daily_five_score,adherence_pct' });

  const dim = weakestDimension(log);

  // one passage, for the weakest dimension
  const hits = await sb.rpc('search_passages', {
    q: dim + ' ' + (dim === 'environment' ? 'morning light exposure timing'
        : dim === 'timing' ? 'sleep and wake regularity meal timing'
        : 'fuel handling glucose insulin'),
    k: 1, qvec: null, min_rank: 0.01,
  });
  const passage = (hits && hits[0]) || null;

  const hasData = !!log;
  const missing = hasData ? null : FIRST_ASK[0];

  const facts = hasData ? [
    'Yesterday you logged: ' +
      [log.morning_light_min != null ? log.morning_light_min + ' minutes of morning light' : null,
       log.water_ml != null ? (log.water_ml / 1000).toFixed(1) + ' liters of water' : null,
       log.daily_five_score != null ? log.daily_five_score + ' of the daily five' : null,
      ].filter(Boolean).join(', ') + '.',
  ] : ['Nothing was logged yesterday.'];

  const system = [
    IDENTITY, MODEL_SUMMARY, GUARDRAILS,
    'READING LEVEL. ' + (TIER_VOICE[member.tier] || TIER_VOICE.intermediate),
    'You are writing one morning brief. Two or three sentences, no more. ' +
    'You are given the facts and one passage. Write the connective sentences ' +
    'ONLY. Do not invent a number, a time, a date or a target. Do not name a ' +
    'supplement, a brand or a price. No em dash. No encouragement, no ' +
    'exclamation, no "great job". Second person, plain.',
    hasData
      ? 'FACTS:\n' + facts.join('\n') + '\n\nTODAY THE WEAK POINT IS: ' + dim +
        (passage ? '\n\nONE PASSAGE, for context only:\n' + passage.passage.slice(0, 900) : '')
      : 'THIS MEMBER LOGGED NOTHING YESTERDAY. Do not write a report of zeros. ' +
        'Write two sentences that ask for ONE thing today: ' + missing[1] + '.',
  ].join('\n\n');

  const runId = await startRun(env, AGENT, { clientId: member.client_id, model: MODEL_PER_CLIENT });
  let text;
  try {
    const r = await ask(env, {
      system,
      messages: [{ role: 'user', content: hasData
        ? 'Write today\'s brief.' : 'Write today\'s brief asking for the one input.' }],
      maxTokens: 260,
    });
    text = r.text;
    await finishRun(env, runId, 'ok',
      { tokens_in: r.tokensIn, tokens_out: r.tokensOut });
  } catch (e) {
    await finishRun(env, runId, 'error', { error: String(e).slice(0, 400) });
    throw e;
  }
  // the change statement is APPENDED in code, never written by the model, so
  // it cannot be paraphrased into something vaguer than what happened
  const changes = await appliedSinceLastBrief(sb, member.client_id);
  const tail = changes.map(changeSentence).join(' ');

  return {
    content: stripDashes(String(text || '').trim()) + (tail ? '\n\n' + tail : ''),
    changes_stated: changes.length,
    dimension: dim,
    passage_id: passage ? passage.id : null,
    had_data: hasData,
  };
}

export async function onRequestPost({ request, env }) {
  const sb = db(env);
  const isService = hasServiceSecret(request, env);
  if (!isService) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }
  const only = body.client_id || null;

  const where = { status: 'active' };
  if (only) where.client_id = only;
  let members;
  try {
    members = await sb.select('memberships', {
      where, columns: 'id,client_id,tier,day_zero,status,panel_id',
      raw: 'onboarded_at=not.is.null', limit: BATCH_LIMIT });
  } catch (e) { return json({ error: String(e).slice(0, 300) }, 500); }
  // the timezone lives on profiles and is fetched per member rather than
  // joined, because the REST helper does not do embedded selects
  for (const m of members) {
    const pr = await sb.one('profiles', { where: { id: m.client_id }, columns: 'timezone' });
    m.profiles = pr || {};
  }

  const out = { written: 0, skipped_existing: 0, failed: 0, no_data: 0, members: [] };
  for (const m of (members || [])) {
    const tz = (m.profiles && m.profiles.timezone) || DEFAULT_TZ;
    const today = localDate(tz);
    try {
      const b = await buildBrief(sb, env, m, today);
      const day = m.day_zero
        ? Math.max(0, Math.round((new Date(today) - new Date(m.day_zero)) / 86400000)) : null;
      let insErr = null;
      try {
        await sb.insert('morning_briefs', {
          client_id: m.client_id, membership_id: m.id, brief_date: today,
          program_day: day, tier: m.tier, content: b.content, source: 'worker',
        });
      } catch (e) { insErr = { message: String(e) }; }
      if (insErr) {
        // the unique index is the idempotence guarantee, so a collision here
        // is the worker being correct rather than an error to retry
        if (String(insErr.message || '').match(/duplicate|unique/i)) {
          out.skipped_existing++;
        } else { out.failed++; }
      } else {
        out.written++;
        if (!b.had_data) out.no_data++;
      }
      out.members.push({ client_id: m.client_id, tz, date: today, dimension: b.dimension, had_data: b.had_data });
    } catch (e) {
      out.failed++;
      out.members.push({ client_id: m.client_id, tz, date: today, error: String(e).slice(0, 200) });
    }
  }
  return json(out);
}
