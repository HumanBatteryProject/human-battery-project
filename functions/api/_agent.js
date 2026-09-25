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

// ---------------------------------------------------------------------
// A small query surface over the REST helper.
//
// The agents written for brief 06 were drafted against the supabase-js client
// API, `sb.from(...).select(...)`, which this codebase does not use and does
// not ship. They threw `sb.from is not a function` on the first real call.
// Rather than rewrite five agents into raw PostgREST paths, which is where the
// quoting mistakes live, this exposes exactly the four operations they need.
//
// It is deliberately NOT a general client. Anything it cannot express should
// be written as an explicit supabase(env, path) call so the query is visible.
// ---------------------------------------------------------------------

const enc = encodeURIComponent;

function qs(filters = {}, extra = '') {
  const parts = [];
  for (const [k, v] of Object.entries(filters)) {
    if (v === null) parts.push(`${k}=is.null`);
    else if (Array.isArray(v)) parts.push(`${k}=in.(${v.map(enc).join(',')})`);
    else parts.push(`${k}=eq.${enc(v)}`);
  }
  if (extra) parts.push(extra);
  return parts.length ? '?' + parts.join('&') : '';
}

export function db(env) {
  return {
    async select(table, { where = {}, columns = '*', order = null, limit = null, raw = '' } = {}) {
      let extra = `select=${columns}`;
      if (order) extra += `&order=${order}`;
      if (limit) extra += `&limit=${limit}`;
      if (raw) extra += `&${raw}`;
      return (await supabase(env, `${table}${qs(where, extra)}`)) || [];
    },
    async one(table, opts = {}) {
      const rows = await this.select(table, { ...opts, limit: 1 });
      return rows && rows.length ? rows[0] : null;
    },
    // `upsert` is for tables with a natural key, where re-running the same
    // operation must not be an error. lab_results is unique on
    // (panel_id, marker_id): re-analysing a panel is a correction, not a
    // second draw, so it merges rather than colliding.
    async insert(table, rows, { returning = false, upsert = null } = {}) {
      const prefer = [returning ? 'return=representation' : 'return=minimal'];
      if (upsert) prefer.push('resolution=merge-duplicates');
      return supabase(env, table + (upsert ? `?on_conflict=${upsert}` : ''), {
        method: 'POST',
        headers: { Prefer: prefer.join(',') },
        body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
      });
    },
    async update(table, where, patch) {
      return supabase(env, `${table}${qs(where)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
    },
    async rpc(fn, args) {
      return (await supabase(env, `rpc/${fn}`, {
        method: 'POST', body: JSON.stringify(args),
      })) || [];
    },
    // The count a rate limit needs, without pulling the rows.
    async count(table, where = {}, raw = '') {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${table}${qs(where, 'select=id' + (raw ? '&' + raw : ''))}`,
        { headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            Prefer: 'count=exact', Range: '0-0' } });
      const cr = res.headers.get('content-range') || '';
      const n = cr.split('/')[1];
      return n === '*' ? 0 : Number(n || 0);
    },
  };
}
