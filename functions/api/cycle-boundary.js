// Cloudflare Pages Function. POST /api/cycle-boundary
//
// The caller complete.js never had. Brief 06 section 8 specified the completion
// agent and Brief 07 specified chaining, and nothing ever invoked either: the
// audit found zero runs on record, because no screen, job or webhook reached it.
// A ninety day program whose day ninety never fires is a program that quietly
// runs forever.
//
// This finds the memberships that have reached their end and asks /api/complete
// to close each one. It calls the endpoint rather than importing its internals,
// so the path that runs on a schedule is the same path the smoke test exercises.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';

// A membership is due when its ninetieth day has passed in the member's own
// timezone. Ninety days from day_zero INCLUSIVE, so day_zero + 89.
export const PROGRAM_DAYS = 90;

function localDate(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export async function onRequestPost({ request, env }) {
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'not allowed' }, 403);
  }
  let body = {};
  try { body = await request.json(); } catch { /* an empty body is the cron case */ }
  const dryRun = body.dry_run === true;

  const sb = db(env);
  const open = await sb.select('memberships', {
    where: { completed_on: null, status: 'active' },
    columns: 'id,client_id,day_zero,cycle,is_internal,profiles!memberships_client_id_fkey(timezone)',
  });

  const out = { checked: (open || []).length, due: 0, completed: 0, failed: 0, members: [] };

  for (const m of (open || [])) {
    if (!m.day_zero) { out.members.push({ client_id: m.client_id, skipped: 'no day zero' }); continue; }
    // The member's own local date, never the server's. A member in Auckland
    // reaches day ninety most of a day before a server in Chicago agrees.
    const tz = (m.profiles && m.profiles.timezone) || 'America/Chicago';
    const today = localDate(tz);
    const end = new Date(m.day_zero + 'T12:00:00Z');
    end.setUTCDate(end.getUTCDate() + PROGRAM_DAYS - 1);
    const endDate = end.toISOString().slice(0, 10);
    if (today < endDate) continue;

    out.due++;
    if (dryRun) { out.members.push({ client_id: m.client_id, due_on: endDate, dry_run: true }); continue; }

    try {
      const res = await fetch(new URL('/api/complete', request.url).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hbp-secret': env.WEBHOOK_SECRET },
        body: JSON.stringify({ client_id: m.client_id, force_end_date: endDate }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r.error || ('complete returned ' + res.status));
      out.completed++;
      out.members.push({ client_id: m.client_id, due_on: endDate, summary_id: r.summary_id || null });
    } catch (e) {
      out.failed++;
      out.members.push({ client_id: m.client_id, due_on: endDate, error: String(e).slice(0, 200) });
    }
  }

  return json(out);
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
