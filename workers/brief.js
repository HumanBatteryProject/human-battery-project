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
    // ONE TRIGGER DECIDES WHAT IS DUE, and it now actually does.
    //
    // wrangler.toml has a single cron, "0 * * * *", because Workers Free allows five per
    // ACCOUNT and this account has others. The previous version looked the fired cron up in a
    // table of six expressions, found '/api/brief-run', and called run(env). Which means the
    // other five entries never fired: no plan-run, no billing-run, no cycle-boundary, no
    // trend, no weekly-review. The comment above that table said the hourly firing decides
    // what else is due. It did not. A table of schedules that cannot fire reads exactly like
    // a schedule, which is why it survived.
    //
    // So the hour decides, from the one firing we actually get. UTC deliberately: these are
    // account-level jobs, and every endpoint behind them works out each member's own local
    // date for itself. That is why the trigger is hourly at all.
    const now = new Date(event.scheduledTime || Date.now());
    const hour = now.getUTCHours();
    const isMonday = now.getUTCDay() === 1;

    const due = [];
    due.push('/api/brief-run');                        // every hour, for every timezone's morning
    due.push('/api/wearable-sync');                    // every hour, the pull half of wearables
    if (hour === 11) due.push('/api/plan-run');        // the plan before the brief
    if (hour === 15) due.push('/api/cycle-boundary');  // day ninety
    if (hour === 16) due.push('/api/billing-run');     // what is due today
    if (isMonday && hour === 12) due.push('/api/weekly-review');
    if (isMonday && hour === 13) due.push('/api/trend');   // after the review, deliberately

    // Sequential, not parallel. They share a database and the later ones read what the
    // earlier ones write: the plan is written before the brief that describes it.
    ctx.waitUntil((async () => {
      for (const path of due) await call(env, path);
      console.log(`hour ${hour} UTC: ran ${due.join(', ')}`);
    })());
  },

  // The same path by hand, for testing. Requires the same secret.
  async fetch(request, env) {
    const given = request.headers.get('x-hbp-secret') || '';
    if (!env.WEBHOOK_SECRET || given !== env.WEBHOOK_SECRET) {
      return new Response('no', { status: 403 });
    }
    // ?job=/api/wearable-sync runs one job, so a single one can be exercised by hand
    // without waiting for its hour.
    const job = new URL(request.url).searchParams.get('job');
    if (job) {
      if (!/^\/api\/[a-z-]+$/.test(job)) {
        return new Response(JSON.stringify({ error: 'that is not a job path' }), { status: 400 });
      }
      await call(env, job);
      return new Response(JSON.stringify({ ran: job }), {
        headers: { 'content-type': 'application/json' },
      });
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
