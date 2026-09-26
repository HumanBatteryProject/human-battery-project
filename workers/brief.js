// The morning brief cron Worker.
//
// This is a THIN SCHEDULER and holds exactly one secret. It knows how to wake
// up and how to call one URL. All the logic, every database query, every model
// call, lives behind /api/brief-run in Pages Functions, which already has the
// Supabase and Anthropic keys.
//
// The reason is blast radius. A Worker that held its own SUPABASE_SERVICE_KEY
// and ANTHROPIC_API_KEY would be a second place those secrets live, a second
// place they rotate, and a second place they leak. This holds WEBHOOK_SECRET
// and nothing else, so compromising it buys an attacker the ability to make
// the brief run, which is what the cron does anyway.
//
// Cron: see wrangler.toml. It fires hourly, not daily, because members are in
// different timezones and /api/brief-run computes each member's own local date
// and the unique index makes a second write for the same local day a no-op.
// Hourly firing plus database-enforced idempotence is how every timezone gets
// a morning without the Worker knowing anything about timezones.

export default {
  async scheduled(event, env, ctx) {
    // Three schedules, routed by which cron fired. The hourly one is the
    // morning brief; the other two are the jobs that had no caller at all.
    const JOBS = {
      '0 * * * *':   '/api/brief-run',       // hourly, each member's local morning
      '0 13 * * 1':  '/api/trend',           // Monday, the weekly review pass
      '0 15 * * *':  '/api/cycle-boundary',  // daily, day ninety
      '0 16 * * *':  '/api/billing-run',     // daily, charges what is due
    };
    const path = JOBS[event.cron];
    if (path && path !== '/api/brief-run') {
      ctx.waitUntil(call(env, path));
      return;
    }
    ctx.waitUntil(run(env));
  },

  // The same path by hand, for testing. Requires the same secret.
  async fetch(request, env) {
    const given = request.headers.get('x-hbp-secret') || '';
    if (!env.WEBHOOK_SECRET || given !== env.WEBHOOK_SECRET) {
      return new Response('no', { status: 403 });
    }
    const r = await run(env);
    return new Response(JSON.stringify(r), {
      headers: { 'content-type': 'application/json' },
    });
  },
};

// Post to one endpoint with the shared secret. Logs and does not retry: a
// failed firing is picked up by the next one, and every endpoint it calls is
// idempotent per member per period.
async function call(env, path) {
  const base = env.SITE_ORIGIN || 'https://thehumanbatteryproject.com';
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hbp-secret': env.WEBHOOK_SECRET },
      body: JSON.stringify({}),
    });
    console.log(path, res.status, (await res.text()).slice(0, 300));
  } catch (e) {
    console.log(path, 'threw', String(e).slice(0, 200));
  }
}

async function run(env) {
  const base = env.SITE_ORIGIN || 'https://thehumanbatteryproject.com';
  const res = await fetch(base + '/api/brief-run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hbp-secret': env.WEBHOOK_SECRET,
    },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  // The Worker logs and does not retry. A failed hour is picked up by the next
  // one, and the unique index means the catch-up cannot double-send.
  console.log('brief-run', res.status, text.slice(0, 400));
  return { status: res.status, body: text.slice(0, 400) };
}
