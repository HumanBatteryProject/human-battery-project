// POST /api/data-request  { kind, note? }
//
// A person asking for their data, or asking us to delete it. Part J: "Data export
// and deletion behave as documented." Part G: "documented retention, export, and
// deletion workflows."
//
// WHAT WAS MISSING. data_requests existed as a table with a 45-day due_by default,
// matching the sentence in the consumer health data policy that says "We respond
// within forty-five days". Nothing wrote to it. So the policy promised a process
// that had no way to be started, and the consent document a person agrees to says
// they can ask us to delete their records.
//
// DELETION IS RECORDED, NOT PERFORMED. Nothing here deletes anything, and that is
// deliberate rather than unfinished:
//
//   Deleting a participant's records is irreversible, it interacts with records we
//   may be required to keep, and it is the one operation where a bug is unrecoverable.
//   So it is a request with a due date that a human fulfils, which is what the policy
//   describes. An endpoint that emptied 39 tables on one POST would be the most
//   dangerous route in the product.
//
// CANCELLING A MEMBERSHIP IS NOT A DELETION REQUEST and a deletion request is not a
// cancellation. _continuation.js says so to the member and this file keeps them
// apart: they are reached separately, recorded separately, and neither implies the
// other.

import { json, db, hasServiceSecret, verifyStaff } from './_agent.js';
import { rateLimit, tooMany } from './_ratelimit.js';

// The kinds data_requests_kind_check allows. Named here so an unknown kind is
// refused with a list rather than a constraint violation.
const KINDS = ['access', 'export', 'delete', 'withdraw_consent', 'appeal'];

const WHAT_HAPPENS = {
  access: 'We will send you a copy of the records we hold about you.',
  export: 'We will send you a machine-readable copy of your records. You can also download one yourself at any time from your account screen.',
  delete: 'We will delete your records. This does not happen automatically: a person reviews it, because deletion cannot be undone. Anything we are required to keep will be named in our answer.',
  withdraw_consent: 'We will stop the use you have withdrawn consent for. Withdrawing consent for research does not affect your program.',
  appeal: 'We will review the decision you are appealing and answer you.',
};

async function whoami(request, env) {
  if (hasServiceSecret(request, env)) return { kind: 'service', id: null };
  const staff = await verifyStaff(request, env);
  if (staff) return { kind: 'staff', id: staff.id };
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.id ? { kind: 'member', id: user.id } : null;
}

export async function onRequestPost({ request, env }) {
  const who = await whoami(request, env);
  if (!who) return json({ error: 'not allowed' }, 403);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const kind = String(body.kind || '').trim();
  if (!KINDS.includes(kind)) {
    return json({ error: 'kind must be one of: ' + KINDS.join(', ') }, 400);
  }

  // DEFAULT TO THE CALLER, and make acting on somebody else explicit.
  //
  // The first version read "member ? who.id : body.client_id", which required a
  // staff member to name a client even when asking about themselves. The owner is
  // an admin and is also a participant, so their own deletion request was refused
  // with "client_id required". Staff being unable to exercise their own data rights
  // is a small bug; the general shape, where your identity depends on your job
  // title, is the part worth fixing.
  //
  // So: no client_id means yourself, whoever you are. A client_id that is not you
  // requires staff, and is refused otherwise rather than silently ignored.
  const asked = String(body.client_id || '').trim();
  const clientId = asked || who.id;
  if (!clientId) return json({ error: 'client_id required' }, 400);
  if (asked && asked !== who.id && !['staff', 'service'].includes(who.kind)) {
    return json({ error: 'not allowed' }, 403);
  }

  // A person may ask as often as they like, but not thousands of times a minute.
  // Keyed on the client rather than the address, because this needs a session.
  const limit = await rateLimit(env, 'waitlist_ip', `data-request:${clientId}`);
  if (!limit.allowed) return tooMany(limit, 'requests');

  const sb = db(env);

  // An open request of the same kind is not replaced. Two identical open requests
  // are one request somebody clicked twice, and losing the FIRST one loses its due
  // date, which is the part that matters.
  const open = await sb.one('data_requests', {
    where: { client_id: clientId, kind }, columns: 'id,requested_at,due_by,status',
    raw: 'status=in.(open,in_progress)', order: 'requested_at.desc',
  });
  if (open) {
    return json({
      ok: true, already_open: true, id: open.id,
      kind, requested_at: open.requested_at, due_by: open.due_by,
      what_happens: WHAT_HAPPENS[kind],
      note: 'You already have a request of this kind open. We kept the original, including its due date.',
    });
  }

  const profile = await sb.one('profiles', { where: { id: clientId }, columns: 'email' });

  let rows, err = null;
  try {
    rows = await sb.insert('data_requests', {
      client_id: clientId,
      email: profile ? profile.email : null,
      kind,
      status: 'open',
      // requested_at and due_by come from the table's own defaults, so the 45 day
      // clock is the database's and not a number repeated in code.
    }, { returning: true });
  } catch (e) { err = String(e).slice(0, 300); }
  if (err || !rows || !rows.length) {
    return json({ error: 'We could not record that request', why: err }, 500);
  }
  const row = rows[0];

  await sb.insert('audit_log', {
    actor_id: who.id, action: `data_request.${kind}`, table_name: 'data_requests',
    record_id: row.id, subject_id: clientId,
    detail: {
      kind, due_by: row.due_by,
      by: who.kind,
      // The member's own words about why, if they gave any. Capped, and it is their
      // text so it is stored rather than interpreted.
      note: String(body.note || '').slice(0, 1000) || null,
      deleted_anything: false,
    },
  });

  return json({
    ok: true,
    id: row.id,
    kind,
    requested_at: row.requested_at,
    due_by: row.due_by,
    what_happens: WHAT_HAPPENS[kind],
    // Said plainly, because the difference between "recorded" and "done" is the
    // whole point of this endpoint.
    recorded_not_performed: kind === 'delete',
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
