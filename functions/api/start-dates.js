// Cloudflare Pages Function. GET /api/start-dates
//
// The dates a person can actually start on. Public, because it is public
// information and the application form needs it before anybody has signed in.
//
// The dates come from program_start_dates() in the database rather than being
// computed here, so the form, the validator that accepts the submission, and the
// admin screen all read the same answer. Computing them in JavaScript as well
// would be a second implementation of the lead time rule, and the two would
// disagree the first time the lead time changed.

import { json } from './_agent.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const count = Math.min(12, Math.max(1, parseInt(url.searchParams.get('count') || '4', 10) || 4));

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/program_start_dates`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_count: count }),
  });
  if (!res.ok) {
    // Loud. A form that silently offers no dates looks like a program that is
    // not taking anybody.
    console.error('[start-dates] program_start_dates failed', res.status, (await res.text()).slice(0, 200));
    return json({ error: 'Could not load start dates' }, 502);
  }
  const rows = await res.json();
  const dates = (Array.isArray(rows) ? rows : []).map((r) => (typeof r === 'string' ? r : r.program_start_dates)).filter(Boolean);

  return new Response(JSON.stringify({
    ok: true,
    dates,
    // Said on the form, because "why can I not start on Tuesday" is a fair
    // question and the answer is not arbitrary.
    why: 'Programs start on the 1st and the 15th. The gap is so your baseline blood draw and Omega-3 kit are done before day 1.',
  }), {
    headers: {
      'Content-Type': 'application/json',
      // A date list that changes at most daily. Cached briefly so the form is
      // fast without going stale across a month boundary.
      'Cache-Control': 'public, max-age=900',
    },
  });
}
