// The onboarding agent. POST /api/onboard
//
// Runs once per membership, right after payment. It does five things:
//
//   1. Places the client in a tier, from the seven placement answers on
//      their application.
//   2. Sets day zero to the next start wave, if the webhook has not.
//   3. Writes them a welcome email explaining the placement in their own
//      terms, with a signed link to the First Steps PDF for their tier.
//   4. Writes their first morning brief, so the portal is not empty the
//      first time they open it.
//   5. Marks the membership onboarded, so this never runs twice.
//
// Callers: the Stripe webhook, server to server, carrying WEBHOOK_SECRET.
// Or a staff member re-running it by hand with their own session.
//
// The agent writes prose. It does not write dates, prices, links or steps.
// Those are assembled here from the database, because an agent that
// invents a start date sends a client to the wrong month and the email
// reads exactly as convincingly as a correct one.

import {
  json, supabase, ask, startRun, finishRun,
  hasServiceSecret, verifyStaff, sendEmail, signedDocUrl,
  MODEL_PER_CLIENT,
} from './_agent.js';
import { IDENTITY, MODEL_SUMMARY, GUARDRAILS, TIER_VOICE, TIER_LABEL, stripDashes } from './_voice.js';

const AGENT = 'onboarding';

const PLACEMENT_QUESTIONS = {
  training: 'how often they train',
  cold: 'cold water',
  sauna: 'sauna or heat',
  fasting: 'when they eat',
  food: 'what they eat',
  morning_light: 'morning light',
  sleep: 'sleep',
};

// Rough Flesch-Kincaid, enough to tell a third grade brief from a ninth
// grade one and to make a drift visible in the agent_runs table. It is a
// flag, not a measurement.
function readingGrade(text) {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length || 1;
  const words = (text.match(/[A-Za-z']+/g) || []);
  if (!words.length) return null;
  const syllables = words.reduce((n, w) => {
    const lower = w.toLowerCase();
    const groups = lower.match(/[aeiouy]+/g) || [];
    let c = groups.length;
    if (lower.endsWith('e') && c > 1) c -= 1;
    return n + Math.max(1, c);
  }, 0);
  const grade = 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[m - 1]} ${d}, ${y}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Rule 11: never trust a user id from a request body. A caller is either
  // the shared secret or a verified staff session, and in both cases the
  // membership is looked up here rather than described by the caller.
  const isService = hasServiceSecret(request, env);
  const staff = isService ? null : await verifyStaff(request, env);
  if (!isService && !staff) return json({ error: 'Not authorised' }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  const membershipId = String(body.membership_id || '').trim();
  const force = body.force === true && !!staff;
  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) {
    return json({ error: 'membership_id is required' }, 400);
  }

  let runId = null;
  try {
    const rows = await supabase(
      env,
      `memberships?id=eq.${membershipId}&select=id,client_id,tier,day_zero,status,cycle,onboarded_at,` +
        `profiles!memberships_client_id_fkey(id,full_name,email,timezone)`
    );
    if (!rows.length) return json({ error: 'No such membership' }, 404);

    const m = rows[0];
    const client = m.profiles;
  // dry_run exists so the post-deploy smoke test can prove this endpoint is
  // reachable, authorizing, and finding its data, WITHOUT the side effect. This
  // one is not idempotent: it emails the participant, and a
  // smoke test must never send mail to a real person. So a smoke test that
  // called it for real on every deploy would corrupt the test member a little
  // more each time, and a smoke test nobody dares run is not a smoke test.
  const dryRun = body.dry_run === true;
  if (dryRun) {
    return json({ ok: true, dry_run: true, membership_id: m.id, client_id: m.client_id,
                  would_write: 'onboarding prose and one email to the participant' });
  }

    runId = await startRun(env, AGENT, { clientId: m.client_id, subjectId: m.id, model: MODEL_PER_CLIENT });

    // Stripe retries webhooks. Two welcome emails is worse than none.
    if (m.onboarded_at && !force) {
      await finishRun(env, runId, 'skipped', { detail: { reason: 'already onboarded', onboarded_at: m.onboarded_at } });
      return json({ ok: true, skipped: 'already onboarded', onboarded_at: m.onboarded_at });
    }

    // ---- 1. Placement ------------------------------------------------
    const apps = await supabase(
      env,
      `applications?email=eq.${encodeURIComponent(client.email)}&select=placement,suggested_tier&limit=1`
    );
    const application = apps.length ? apps[0] : null;
    const tier = m.tier || (application && application.suggested_tier) || null;

    if (!tier) {
      // No placement answers, so nothing to place them on. Guessing here
      // would send someone a protocol they cannot hold, and the email
      // would read as confidently as a correct one. A person decides.
      await notifyStaff(env, client, m, 'No placement answers on file, so no tier could be assigned.');
      await sendHoldingEmail(env, client);
      await finishRun(env, runId, 'error', { error: 'no placement answers, referred to staff' });
      return json({ ok: false, needs_human: 'no placement answers' }, 200);
    }

    // ---- 2. Day zero -------------------------------------------------
    let dayZero = m.day_zero;
    if (!dayZero) {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/next_wave_date`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      if (!res.ok) throw new Error(`next_wave_date ${res.status}`);
      dayZero = await res.json();
    }

    const patch = { day_zero: dayZero };
    if (!m.tier) {
      patch.tier = tier;
      patch.tier_assigned_at = new Date().toISOString();
      if (staff) patch.tier_assigned_by = staff.id;
    }
    await supabase(env, `memberships?id=eq.${m.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });

    if (!m.tier) {
      await supabase(env, 'tier_history', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          membership_id: m.id,
          from_tier: null,
          to_tier: tier,
          program_day: 0,
          reason: staff
            ? 'Assigned at onboarding by staff from the application placement answers.'
            : 'Assigned at onboarding from the seven placement answers on the application.',
          changed_by: staff ? staff.id : null,
        }),
      });
    }

    // ---- 3. The write-up ---------------------------------------------
    const firstName = (client.full_name || '').trim().split(/\s+/)[0] || 'there';
    const answers = application && application.placement ? application.placement : null;
    const answerLines = answers
      ? Object.entries(PLACEMENT_QUESTIONS)
          .map(([k, label]) => `- ${label}: they answered at the ${TIER_LABEL[answers[k]] || 'unknown'} level`)
          .join('\n')
      : '- no answers on file, the tier was set by staff';

    const placementPrompt = `${IDENTITY}

${MODEL_SUMMARY}

${GUARDRAILS}

You are writing the opening of a welcome email to a person who has just
paid for the 90 day program. Their name is ${firstName}.

They have been placed in the ${TIER_LABEL[tier]} tier. Here is what they
said about how they live now:

${answerLines}

Write two short paragraphs, 90 to 130 words in total.

The first paragraph tells them which tier they are in and why, in terms of
what they actually told us. Name one or two of their own answers. Do not
list all seven back at them.

The second paragraph says what the tier means and does not mean. Being in a
lower tier is not a judgement and is not a smaller version of the program.
Every tier gets the same measurement at both ends. The tier decides where
the protocol starts, and they can move up during the 90 days.

${TIER_VOICE[tier]}

Write only those two paragraphs. No greeting, no sign off, no subject line,
no headings. Do not mention dates, prices, links or next steps: those are
added after your text and you would only contradict them.`;

    const written = await ask(env, {
      system: placementPrompt,
      messages: [{ role: 'user', content: 'Write the two paragraphs.' }],
      maxTokens: 500,
    });
    const placementText = stripDashes(written.text);

    // ---- 4. The first brief ------------------------------------------
    const briefPrompt = `${IDENTITY}

${MODEL_SUMMARY}

${GUARDRAILS}

Write the first morning brief for ${firstName}, who is in the
${TIER_LABEL[tier]} tier. This is day 0. The program has not started yet.
Their day zero is ${formatDay(dayZero)}.

150 to 250 words. One idea, and one thing they can do before day zero.

The one thing is ordering their Omega-3 Index kit, because it takes two to
four weeks from ordering to result and it is the only step that has to
happen before day one. Do not give the price or the product name, those are
in their First Steps document.

The idea behind it: the Omega-3 Index is the marker on the panel that moves
most over 90 days, so a missing day 0 number cannot be recovered later.

${TIER_VOICE[tier]}

Write only the brief. No heading, no greeting, no sign off.`;

    const brief = await ask(env, {
      system: briefPrompt,
      messages: [{ role: 'user', content: 'Write the day 0 brief.' }],
      maxTokens: 600,
    });
    const briefText = stripDashes(brief.text);

    await supabase(env, 'morning_briefs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        client_id: m.client_id,
        membership_id: m.id,
        program_day: 0,
        brief_date: new Date().toISOString().slice(0, 10),
        tier,
        content: briefText,
        reading_grade: readingGrade(briefText),
        source: AGENT,
      }),
    });

    // ---- 5. The email ------------------------------------------------
    // Everything factual below is assembled here, not written by the agent.
    const docPath = `tier/${tier}/HBP-First-Steps-${tier.toUpperCase()}.pdf`;
    let docLink = null;
    try {
      docLink = await signedDocUrl(env, docPath);
    } catch (e) {
      console.error(`[${AGENT}] could not sign ${docPath}: ${(e && e.message) || e}`);
    }

    const portal = 'https://thehumanbatteryproject.com/portal/';
    const lines = [
      `${firstName},`,
      '',
      placementText,
      '',
      `Your start date is ${formatDay(dayZero)}. That is day zero. Everything before it is preparation.`,
      '',
      'Your First Steps document tells you what to do today and what to do this week. Read it first, before the protocol.',
    ];
    if (docLink) {
      lines.push('', `Your First Steps: ${docLink}`, '', 'That link works for two weeks. After it expires, the same document is in the portal under Program, and it always will be.');
    } else {
      lines.push('', 'Your First Steps document is in the portal under Program.');
    }
    lines.push(
      '',
      `Your portal: ${portal}`,
      '',
      'One thing is urgent and the rest is not. Order your Omega-3 Index kit today. It takes two to four weeks from ordering to result, and your day 0 number cannot be measured after day zero has passed. The First Steps document tells you exactly which one to buy.',
      '',
      'If anything here does not make sense, reply to this email.',
      '',
      'The Human Battery Project'
    );

    await sendEmail(env, {
      to: client.email,
      subject: `You are in. Your start date is ${formatDay(dayZero)}`,
      text: stripDashes(lines.join('\n')),
    });

    // ---- 6. Done -----------------------------------------------------
    await supabase(env, `memberships?id=eq.${m.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ onboarded_at: new Date().toISOString() }),
    });

    await finishRun(env, runId, 'ok', {
      tokens_in: (written.tokensIn || 0) + (brief.tokensIn || 0),
      tokens_out: (written.tokensOut || 0) + (brief.tokensOut || 0),
      model: written.model,
      detail: {
        tier,
        tier_source: m.tier ? 'already on the membership' : 'placement answers',
        day_zero: dayZero,
        brief_grade: readingGrade(briefText),
        doc_linked: !!docLink,
      },
    });

    return json({ ok: true, tier, day_zero: dayZero, brief_grade: readingGrade(briefText) });
  } catch (e) {
    const why = (e && e.message) || String(e);
    console.error(`[${AGENT}] failed for membership ${membershipId}: ${why}`);
    await finishRun(env, runId, 'error', { error: why.slice(0, 800) });
    return json({ error: 'Onboarding failed', detail: why.slice(0, 200) }, 500);
  }
}

// A paying client who cannot be placed still hears from us the same day.
// Silence after a payment is the worst version of this.
async function sendHoldingEmail(env, client) {
  const firstName = (client.full_name || '').trim().split(/\s+/)[0] || 'there';
  try {
    await sendEmail(env, {
      to: client.email,
      subject: 'We have your payment, and one thing to sort out',
      text: `${firstName},

Your payment went through and your place is held.

We could not match your application to the questions we use to decide which
version of the protocol to send you, so a person is looking at it rather
than a piece of software guessing. You will hear from us within one working
day with your tier, your start date and your First Steps.

Nothing is needed from you right now.

The Human Battery Project`,
    });
  } catch (e) {
    console.error(`[${AGENT}] holding email failed: ${(e && e.message) || e}`);
  }
}

async function notifyStaff(env, client, membership, reason) {
  if (!env.NOTIFY_EMAIL) {
    console.error(`[${AGENT}] NEEDS A HUMAN, and NOTIFY_EMAIL is not set. membership=${membership.id} reason=${reason}`);
    return;
  }
  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL,
      subject: `Onboarding needs a human: ${client.full_name || client.email}`,
      text: `${reason}\n\nClient: ${client.full_name || 'no name'} <${client.email}>\nMembership: ${membership.id}\n\nPlace them by hand, then re-run onboarding for this membership id.`,
    });
  } catch (e) {
    console.error(`[${AGENT}] staff notification failed: ${(e && e.message) || e}`);
  }
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
