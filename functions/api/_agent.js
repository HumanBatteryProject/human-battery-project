// Shared machinery for every server-side agent.
//
// Three things live here because every agent needs all three and none of
// them should be written twice: the call to Anthropic, the agent_runs row
// that records what happened, and the Supabase JWT check.
//
// Nothing in this file may be imported by anything under public/. It reads
// SUPABASE_SERVICE_KEY and ANTHROPIC_API_KEY.

import { supabase } from './_payments.js';

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Written per client, so Sonnet. Opus is reserved for the weekly trend
// agent, which reads across everybody at once.
export const MODEL_PER_CLIENT = 'claude-sonnet-5';
export const MODEL_ACROSS_CLIENTS = 'claude-opus-5';

// ---------------------------------------------------------------------
// agent_runs
// ---------------------------------------------------------------------

export async function startRun(env, agent, { clientId = null, subjectId = null, model = null } = {}) {
  const rows = await supabase(env, 'agent_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ agent, client_id: clientId, subject_id: subjectId, model, status: 'running' }),
  });
  return rows[0].id;
}

export async function finishRun(env, runId, status, patch = {}) {
  if (!runId) return;
  try {
    await supabase(env, `agent_runs?id=eq.${runId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, finished_at: new Date().toISOString(), ...patch }),
    });
  } catch (e) {
    // The run row is observability. Failing to close it must never be the
    // thing that fails the agent, but it must not be silent either.
    console.error(`[agent] could not close run ${runId}: ${(e && e.message) || e}`);
  }
}

// ---------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------

export async function ask(env, { system, messages, maxTokens = 1024, model = MODEL_PER_CLIENT }) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });

  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return {
    text,
    tokensIn: data.usage ? data.usage.input_tokens : null,
    tokensOut: data.usage ? data.usage.output_tokens : null,
    model: data.model || model,
  };
}

// ---------------------------------------------------------------------
// Who is calling
// ---------------------------------------------------------------------

// Server-to-server callers carry the shared secret. This is the path the
// Stripe webhook uses, and it is a header compare rather than a JWT
// because there is no user session behind it.
export function hasServiceSecret(request, env) {
  const given = request.headers.get('x-hbp-secret');
  if (!given || !env.WEBHOOK_SECRET) return false;
  // Constant time. A timing difference on a shared secret is a small leak
  // but it is a free one to close.
  if (given.length !== env.WEBHOOK_SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ env.WEBHOOK_SECRET.charCodeAt(i);
  return diff === 0;
}

// The human path. Verifies the token with Supabase rather than decoding
// it here, so a forged or expired token cannot pass, and returns the
// profile so the caller can check the role. Never trust a user id from a
// request body.
export async function verifyStaff(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (!user || !user.id) return null;

  const rows = await supabase(env, `profiles?id=eq.${user.id}&select=id,role,full_name`);
  if (!rows.length) return null;
  return ['admin', 'coach', 'staff'].includes(rows[0].role) ? rows[0] : null;
}

// ---------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------

export async function sendEmail(env, { to, subject, text, attachments }) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    throw new Error('RESEND_API_KEY or FROM_EMAIL is not set');
  }
  const body = { from: env.FROM_EMAIL, to, subject, text };
  if (attachments && attachments.length) body.attachments = attachments;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

// A signed link rather than an attachment. The First Steps PDF lives in
// the program-docs bucket where the path is the permission, and emailing
// the bytes would put a tier document outside that rule permanently.
export async function signedDocUrl(env, storagePath, seconds = 60 * 60 * 24 * 14) {
  const res = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/sign/program-docs/${storagePath}`,
    {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: seconds }),
    }
  );
  if (!res.ok) throw new Error(`storage sign ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return `${env.SUPABASE_URL}/storage/v1${data.signedURL}`;
}

export { supabase };
