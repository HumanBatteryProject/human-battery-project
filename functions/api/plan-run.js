// Cloudflare Pages Function. POST /api/plan-run
//
// The orchestrated workflow, master prompt E1, run for one participant or all.
// The six components are named in code and run in this order:
//
//   Observer     observe(), in _plan.js: raw logs to the few facts that matter
//   Interpreter  the state summary observe() returns
//   Planner      selectActions(), deterministic
//   Safety gate  safetyBlock(), part of selection, not a later filter
//   Explainer    ask(), the ONLY model call, and it may be skipped entirely
//   Reviewer     reviewPlan(), which refuses rather than repairing
//
// THE EXPLAINER IS OPTIONAL BY DESIGN. Everything a participant needs is decided
// before it runs: the action text comes from the approved rule and the reason is
// computed from their own logs. The model adds connective prose and nothing else,
// so when AI_GENERATION_ENABLED is off the plan is still complete. That is what
// makes the fallback a fallback rather than a degraded mode.
//
// UNAPPROVED RULES. The owner approves the canon in the admin interface. Until
// then a real participant gets NO plan. The internal member is the exception, and
// it is an explicit, narrow one: is_internal must be true, and the plan records
// that it was built from pending rules so nothing can mistake it for a real one.

import {
  json, db, ask, startRun, finishRun, hasServiceSecret, verifyStaff, MODEL_PER_CLIENT,
} from './_agent.js';
import { GenerationPaused, flagOn, FLAGS } from './_flags.js';
import { observe, selectActions, reviewPlan, MAX_ACTIONS, BARRIER_COOLDOWN_DAYS } from './_plan.js';
import { flagsFromText } from './_medical.js';
import { IDENTITY, GUARDRAILS, stripDashes } from './_voice.js';

const AGENT = 'planner';
export const DEFAULT_TZ = 'America/Chicago';
export const CANON_VERSION = 'canon-1';

function localDate(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
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
  const out = { written: 0, skipped_existing: 0, no_rules: 0, refused: 0, failed: 0, members: [] };

  const members = await sb.select('memberships', {
    where: only ? { client_id: only, completed_on: null } : { status: 'active', completed_on: null },
    columns: 'id,client_id,tier,day_zero,is_internal,profiles!memberships_client_id_fkey(timezone)',
  });

  // The approved canon, once. Rules do not differ per member.
  const approved = await sb.select('canonical_rules', {
    where: { review_status: 'approved', retired_at: null }, columns: '*',
  });
  const pending = await sb.select('canonical_rules', {
    where: { review_status: 'pending', retired_at: null }, columns: '*',
  });
  const approvedKeys = new Set((approved || []).map((r) => r.rule_key));

  const aiOn = await flagOn(env, FLAGS.AI_GENERATION_ENABLED);

  for (const m of (members || [])) {
    const tz = (m.profiles && m.profiles.timezone) || DEFAULT_TZ;
    const today = localDate(tz);
    const row = { client_id: m.client_id, date: today };

    try {
      // Server side entitlement. A suspended participant gets no plan, and the
      // gate is asked rather than inferred from any column here.
      const access = await sb.rpc('has_program_access', { target_client: m.client_id });
      const allowed = Array.isArray(access) ? access[0] : access;
      if (allowed !== true) { out.members.push({ ...row, skipped: 'no program access' }); continue; }

      // Which canon this participant may be planned from.
      let rules = approved || [];
      let usedPending = false;
      if (!rules.length && m.is_internal === true) {
        // The narrow exception, stated in the row it writes.
        rules = (pending || []).map((r) => ({ ...r, review_status: 'pending_internal' }));
        usedPending = rules.length > 0;
      }
      if (!rules.length) {
        out.no_rules++;
        out.members.push({ ...row, skipped: 'no approved rules, and this is not the internal member' });
        continue;
      }

      // Observer, then Interpreter.
      const logs = await sb.select('daily_logs', {
        where: { client_id: m.client_id }, columns: '*', order: 'log_date.desc', limit: 30,
      });
      const state = observe(logs || [], today);

      // The participant's screening flags, from their intake answers. Read from
      // the value columns, because intake_responses has no single answer column.
      const intake = await sb.select('intake_responses', {
        where: { client_id: m.client_id },
        columns: 'value_text,value_boolean,value_choices',
      });
      const flags = [...new Set((intake || []).flatMap((r) =>
        flagsFromText([r.value_text, (r.value_choices || []).join(' ')].join(' '))))];

      // Yesterday's actions, for plan stability.
      const y = new Date(today + 'T12:00:00Z'); y.setUTCDate(y.getUTCDate() - 1);
      const prevPlan = await sb.one('daily_plans', {
        where: { client_id: m.client_id, plan_date: y.toISOString().slice(0, 10) }, columns: 'id',
      });
      const previous = prevPlan
        ? await sb.select('plan_actions', { where: { plan_id: prevPlan.id }, columns: '*' })
        : [];

      // A wider window for adaptation: what they have told us over the cooldown
      // period, not only yesterday. A barrier reported three days ago still
      // means something today.
      const recentPlans = await sb.select('daily_plans', {
        where: { client_id: m.client_id },
        columns: 'id,plan_date', order: 'plan_date.desc', limit: BARRIER_COOLDOWN_DAYS + 1,
      });
      const history = [];
      for (const rp of (recentPlans || [])) {
        const acts = await sb.select('plan_actions', {
          where: { plan_id: rp.id }, columns: 'rule_key,status,barrier,review_on,id',
        });
        for (const a of (acts || [])) history.push({ ...a, plan_date: rp.plan_date });
      }

      // Adherence, from the database so the planner, the weekly review and the
      // admin screen cannot disagree about what it means.
      const adh = await sb.rpc('adherence_window', { target_client: m.client_id, days: 14 });
      const adherence = Array.isArray(adh) ? adh[0] : adh;
      const adherenceRate = adherence && adherence.rate !== null && adherence.rate !== undefined
        ? Number(adherence.rate) : null;

      // Planner and Safety gate.
      const { selected, excluded, carried, adaptations, budget } = selectActions({
        rules, state, flags, previous: previous || [], history, today, adherenceRate,
      });

      if (!selected.length) {
        out.members.push({ ...row, skipped: 'nothing eligible', excluded: excluded.length });
        continue;
      }

      // CLAIM THE DAY FIRST, then spend. Inserting the plan row before the
      // Explainer runs makes the unique index on (client_id, plan_date) the thing
      // that serialises two concurrent firings, so only the firing that wins the
      // row pays for a model call.
      //
      // A read-then-write check was not enough: two firings both read "no plan
      // yet", both called the model, one inserted and one was rejected, and the
      // rejected one had already paid. Measured, not assumed: two concurrent
      // firings produced one plan and two model calls.
      //
      // The row is claimed as rules-only. If the Explainer then succeeds it is
      // updated. A crash between the two leaves a valid rules-only plan, which is
      // the right thing to be left with.
      let planId = null;
      if (!dryRun) {
        try {
          const rows = await sb.insert('daily_plans', {
            client_id: m.client_id, membership_id: m.id, plan_date: today,
            generated_by: 'rules', ai_paused: true, canon_version: CANON_VERSION,
            adaptations, action_budget: budget,
          }, { returning: true });
          planId = rows && rows[0] && rows[0].id;
        } catch (e) {
          if (/duplicate key|23505/.test(String(e))) {
            out.skipped_existing++;
            out.members.push({ ...row, skipped: 'a plan already exists for this local date' });
            continue;
          }
          throw e;
        }
      }

      // Explainer. One constrained call for the whole plan, not one per action:
      // E4 says not to use several calls where one will do.
      let prose = null;
      let aiPaused = !aiOn;
      if (aiOn && !dryRun) {
        const runId = await startRun(env, AGENT, { clientId: m.client_id, model: MODEL_PER_CLIENT });
        try {
          const r = await ask(env, {
            system: IDENTITY + '\n' + GUARDRAILS + '\n' +
              'You are writing ONE short connecting sentence for a daily plan. You are NOT ' +
              'choosing the actions, changing them, or adding any of your own. Do not repeat ' +
              'the actions back. Do not give a number, a percentage, a price or a supplement. ' +
              'Two sentences at most, second person, plain.',
            messages: [{ role: 'user', content:
              'Today is day ' + (m.day_zero ? '' : 'unknown') + '. The actions chosen are:\n' +
              selected.map((s) => '- ' + s.rule.action_text + ' (because ' + s.why + ')').join('\n') +
              '\nWrite the connecting sentence.' }],
            maxTokens: 220,
          });
          prose = stripDashes(String(r.text || '').trim()) || null;
          await finishRun(env, runId, 'ok', { tokens_in: r.tokensIn, tokens_out: r.tokensOut });
          // Cost metering, per section 8: measured, never invented.
          await sb.insert('ai_calls', {
            client_id: m.client_id, component: 'explainer', agent: AGENT,
            model: r.model || MODEL_PER_CLIENT, prompt_version: 'plan-explainer-1',
            canon_version: CANON_VERSION, tokens_in: r.tokensIn, tokens_out: r.tokensOut,
          });
        } catch (e) {
          if (e instanceof GenerationPaused || e.paused) {
            aiPaused = true;
            await finishRun(env, runId, 'skipped', { error: 'AI generation paused' });
          } else {
            // A model failure must NOT cost the participant their plan.
            aiPaused = true;
            await finishRun(env, runId, 'error', { error: String(e).slice(0, 300) });
            console.warn('[plan-run] explainer failed, falling back to rules only:', String(e).slice(0, 160));
          }
        }
      }

      // Reviewer. Refuses rather than repairing.
      const candidate = {
        actions: selected.map((s) => ({
          rule_key: s.rule.rule_key, rule_version: s.rule.version,
          action_text: s.rule.action_text, why: s.why,
          confidence: s.confidence, review_on: s.review_on,
        })),
      };
      const verdict = reviewPlan(candidate, { approvedKeys, allowInternalPending: usedPending });
      if (!verdict.ok) {
        out.refused++;
        out.members.push({ ...row, refused: verdict.problems });
        continue;
      }

      if (dryRun) {
        out.members.push({
          ...row, dry_run: true, would_write: selected.length, carried,
          action_budget: budget, adherence_rate: adherenceRate, adaptations,
          excluded: excluded.map((e) => ({ rule: e.rule.rule_key, basis: e.basis })),
          used_pending_rules: usedPending, ai_paused: aiPaused,
          actions: candidate.actions,
        });
        continue;
      }

      // The row already exists. Record what the Explainer produced, if anything.
      if (!aiPaused) {
        await sb.update('daily_plans', { id: planId },
          { generated_by: 'rules+explainer', ai_paused: false });
      }

      for (const s of selected) {
        await sb.insert('plan_actions', {
          plan_id: planId, rule_id: s.rule.id, rule_key: s.rule.rule_key,
          rule_version: s.rule.version, sort_order: s.sort_order,
          action_text: s.rule.action_text, why: s.why,
          observations: { means: state.means, days_logged: state.days_logged },
          provenance: 'self_reported',
          missing_data: s.missing, confidence: s.confidence, review_on: s.review_on,
        });
      }
      for (const e of excluded) {
        await sb.insert('plan_exclusions', {
          plan_id: planId, rule_id: e.rule.id, reason: e.reason, basis: e.basis,
        });
      }
      // Audit history, so a plan can be explained after the fact.
      await sb.insert('audit_log', {
        actor_id: null, action: 'plan.generated', table_name: 'daily_plans',
        record_id: planId, subject_id: m.client_id,
        detail: { date: today, actions: selected.length, carried, excluded: excluded.length,
                  ai_paused: aiPaused, used_pending_rules: usedPending,
                  canon_version: CANON_VERSION, prose: prose ? prose.slice(0, 300) : null,
                  action_budget: budget, adherence_rate: adherenceRate,
                  adaptations },
      });

      out.written++;
      out.members.push({
        ...row, plan_id: planId, actions: selected.length, carried,
        excluded: excluded.length, ai_paused: aiPaused, used_pending_rules: usedPending,
        action_budget: budget, adherence_rate: adherenceRate, adaptations, prose,
      });
    } catch (e) {
      out.failed++;
      out.members.push({ ...row, error: String(e).slice(0, 240) });
    }
  }

  out.ai_generation_enabled = aiOn;
  out.approved_rules = (approved || []).length;
  out.pending_rules = (pending || []).length;
  return json(out);
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
