// Cloudflare Pages Function. POST /api/weekly-review
//
// D7: a concise report of what changed, what stayed stable, actions completed,
// barriers reported, data limitations, and next week's priorities. Rendered in
// the portal and available to the Monday brief.
//
// TWO THINGS THIS MUST NOT DO, both of which are easy to do by accident:
//
//   It must not claim causation. Everything it has is one person's numbers over
//   one week, and the natural sentence about that is causal. The sentences are
//   assembled from templates that cannot say "because", and reviewWeekly()
//   refuses any review whose text claims causation, including a model's.
//
//   It must not invent a recommendation. Next week's priorities are the actions
//   the Planner already chose from approved rules. A review that suggests
//   something new is generating a protocol change outside the canon.
//
// IDEMPOTENT per participant per week, by a unique index rather than by care, so
// two firings of the Monday job produce one review.

import {
  json, db, ask, startRun, finishRun, hasServiceSecret, verifyStaff, MODEL_PER_CLIENT,
} from './_agent.js';
import { GenerationPaused, flagOn, FLAGS } from './_flags.js';
import { compareWeeks, associations, prioritiesFrom, reviewWeekly, causalClaims } from './_review.js';
import { IDENTITY, GUARDRAILS, stripDashes } from './_voice.js';

const AGENT = 'weekly-review';
export const DEFAULT_TZ = 'America/Chicago';

function localDate(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function shift(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// The Monday on or before a date. Weeks are anchored to a weekday rather than to
// "seven days ago" so the same week is always the same week, whichever day the
// job happens to run or re-run on.
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();               // 0 Sunday, 1 Monday
  const back = dow === 0 ? 6 : dow - 1;
  return shift(dateStr, -back);
}

export async function onRequestPost({ request, env }) {
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }
  let body = {};
  try { body = await request.json(); } catch { /* the cron sends nothing */ }
  const only = body.client_id ? String(body.client_id) : null;
  const dryRun = body.dry_run === true;

  const sb = db(env);
  const aiOn = await flagOn(env, FLAGS.AI_GENERATION_ENABLED);
  const out = { written: 0, skipped_existing: 0, no_data: 0, refused: 0, failed: 0, members: [] };

  const members = await sb.select('memberships', {
    where: only ? { client_id: only, completed_on: null } : { status: 'active', completed_on: null },
    columns: 'id,client_id,is_internal,profiles!memberships_client_id_fkey(timezone)',
  });

  for (const m of (members || [])) {
    const tz = (m.profiles && m.profiles.timezone) || DEFAULT_TZ;
    const today = localDate(tz);
    // The week being reviewed is the one that just ENDED, so on Monday it is the
    // seven days before today.
    const weekStart = shift(mondayOf(today), -7);
    const weekEnd = shift(weekStart, 6);
    const prevStart = shift(weekStart, -7);
    const row = { client_id: m.client_id, week_start: weekStart };

    try {
      const access = await sb.rpc('has_program_access', { target_client: m.client_id });
      if ((Array.isArray(access) ? access[0] : access) !== true) {
        out.members.push({ ...row, skipped: 'no program access' }); continue;
      }

      // Cheap check before any work, including before the model.
      const already = await sb.one('weekly_reviews', {
        where: { client_id: m.client_id, week_start: weekStart }, columns: 'id',
      });
      if (already) {
        out.skipped_existing++;
        out.members.push({ ...row, skipped: 'a review already exists for this week', review_id: already.id });
        continue;
      }

      const logs = await sb.select('daily_logs', {
        where: { client_id: m.client_id }, columns: '*', order: 'log_date.desc', limit: 30,
      });
      const inRange = (a, b) => (logs || []).filter((l) => l.log_date >= a && l.log_date <= b);
      const thisWeek = inRange(weekStart, weekEnd);
      const lastWeek = inRange(prevStart, shift(prevStart, 6));

      // Actions and barriers from the week's plans.
      const plans = await sb.select('daily_plans', {
        where: { client_id: m.client_id }, columns: 'id,plan_date',
        order: 'plan_date.desc', limit: 21,
      });
      const weekPlans = (plans || []).filter((p) => p.plan_date >= weekStart && p.plan_date <= weekEnd);
      let acts = [];
      for (const p of weekPlans) {
        const a = await sb.select('plan_actions', {
          where: { plan_id: p.id }, columns: 'rule_key,status,barrier,action_text,review_on',
        });
        acts = acts.concat(a || []);
      }
      const done = acts.filter((a) => a.status === 'complete').length;
      const answered = acts.filter((a) => a.status !== 'pending').length;
      const barriers = acts.filter((a) => a.barrier).map((a) => a.barrier);

      const { changed, stable, limitations } = compareWeeks(thisWeek, lastWeek);
      const assoc = associations(changed);

      if (!thisWeek.length) {
        limitations.unshift(
          'Nothing was logged at all this week, so this review is about what is missing rather than what changed.');
      }
      if (answered === 0 && acts.length) {
        limitations.push(
          `None of the ${acts.length} action${acts.length === 1 ? '' : 's'} this week were answered, ` +
          `so there is nothing to say about follow through.`);
      }

      // Next week's priorities: what the Planner already chose. Never new advice.
      const latestPlan = (plans || [])[0];
      const nextActs = latestPlan
        ? await sb.select('plan_actions', {
            where: { plan_id: latestPlan.id }, columns: 'rule_key,action_text,review_on', order: 'sort_order.asc' })
        : [];
      const priorities = prioritiesFrom(nextActs);

      // The Explainer, optional as everywhere else.
      let narrative = null, aiPaused = !aiOn;
      if (aiOn && !dryRun) {
        const runId = await startRun(env, AGENT, { clientId: m.client_id, model: MODEL_PER_CLIENT });
        try {
          const r = await ask(env, {
            system: IDENTITY + '\n' + GUARDRAILS + '\n' +
              'You are writing TWO sentences at most to open a weekly review. ' +
              'You must NOT say that anything caused, improved, drove, led to or ' +
              'resulted in anything else. One week of one person is not evidence of ' +
              'cause. Say what moved and what did not. No numbers you were not given, ' +
              'no percentage, no advice, no new suggestion.',
            messages: [{ role: 'user', content:
              'Changed: ' + (changed.map((c) => c.sentence).join(' ') || 'nothing measurable') +
              '\nSteady: ' + (stable.map((s) => s.sentence).join(' ') || 'nothing measurable') +
              '\nActions completed: ' + done + ' of ' + acts.length +
              '\nWrite the opening.' }],
            maxTokens: 220,
          });
          const text = stripDashes(String(r.text || '').trim());
          // The model's output goes through the same rule as ours. If it claims
          // causation it is DISCARDED, not edited: editing a causal sentence into
          // an associational one is a judgement nobody reviewed.
          if (causalClaims(text).length) {
            console.warn('[weekly-review] model claimed causation, discarded:', causalClaims(text).join(', '));
            await finishRun(env, runId, 'ok', { tokens_in: r.tokensIn, tokens_out: r.tokensOut, error: 'causal language discarded' });
            aiPaused = true;
          } else {
            narrative = text || null;
            await finishRun(env, runId, 'ok', { tokens_in: r.tokensIn, tokens_out: r.tokensOut });
          }
          await sb.insert('ai_calls', {
            client_id: m.client_id, component: 'explainer', agent: AGENT,
            model: r.model || MODEL_PER_CLIENT, prompt_version: 'weekly-review-1',
            tokens_in: r.tokensIn, tokens_out: r.tokensOut,
          });
        } catch (e) {
          aiPaused = true;
          await finishRun(env, runId, e instanceof GenerationPaused || e.paused ? 'skipped' : 'error',
            { error: String(e).slice(0, 300) });
        }
      }

      const review = {
        client_id: m.client_id, membership_id: m.id, week_start: weekStart,
        changed, stable, limitations, associations: assoc,
        actions_done: done, actions_total: acts.length,
        barriers, priorities, narrative,
      };
      const verdict = reviewWeekly(review);
      if (!verdict.ok) {
        out.refused++;
        out.members.push({ ...row, refused: verdict.problems });
        continue;
      }

      if (dryRun) {
        out.members.push({ ...row, dry_run: true, week_end: weekEnd, ...review, client_id: m.client_id });
        continue;
      }

      try {
        await sb.insert('weekly_reviews', {
          client_id: m.client_id, membership_id: m.id, week_start: weekStart,
          changed, stable,
          actions_done: done, actions_total: acts.length,
          barriers, limitations,
          priorities: { next: priorities, associations: assoc },
          narrative,
        });
      } catch (e) {
        if (/duplicate key|23505/.test(String(e))) {
          out.skipped_existing++;
          out.members.push({ ...row, skipped: 'a review already exists for this week' });
          continue;
        }
        throw e;
      }

      await sb.insert('audit_log', {
        actor_id: null, action: 'weekly_review.generated', table_name: 'weekly_reviews',
        subject_id: m.client_id,
        detail: { week_start: weekStart, week_end: weekEnd, changed: changed.length,
                  stable: stable.length, limitations: limitations.length,
                  actions_done: done, actions_total: acts.length, ai_paused: aiPaused },
      });

      out.written++;
      out.members.push({ ...row, week_end: weekEnd, changed: changed.length, stable: stable.length,
                         limitations: limitations.length, actions_done: done,
                         actions_total: acts.length, ai_paused: aiPaused });
    } catch (e) {
      out.failed++;
      out.members.push({ ...row, error: String(e).slice(0, 240) });
    }
  }
  out.ai_generation_enabled = aiOn;
  return json(out);
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
