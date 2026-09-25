// Member decline and admin revert. POST /api/proposal { id, action }
//
// A member can decline an applied change from the portal; an admin can revert
// one with one click. Both are recorded with who and when, because an applied
// change nobody can undo is not bounded autonomy, it is just autonomy.

import { json, db, verifyStaff } from './_agent.js';

const NEXT = {
  applied:  { decline: 'declined', revert: 'reverted' },
  queued:   { approve: 'applied',  decline: 'declined' },
  declined: {},
  reverted: {},
};

export async function onRequestPost({ request, env }) {
  const sb = db(env);
  let body = {}; try { body = await request.json(); } catch (e) {}
  const { id, action } = body;
  if (!id || !action) return json({ error: 'id and action required' }, 400);

  const auth = request.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const staff = await verifyStaff(request, env);
  let me = null;
  if (jwt) {
    const u = await fetch(env.SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + jwt },
    }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    me = u && u.id ? u.id : null;
  }
  if (!staff && !me) return json({ error: 'sign in first' }, 401);

  const p = await sb.one('proposals', { where: { id } });
  if (!p) return json({ error: 'no such proposal' }, 404);

  // a member may only decline, and only their own
  if (!staff) {
    if (p.client_id !== me) return json({ error: 'not yours' }, 403);
    if (action !== 'decline') return json({ error: 'a member can decline, not approve or revert' }, 403);
  }

  const to = (NEXT[p.status] || {})[action];
  if (!to) {
    return json({ error: 'cannot ' + action + ' a proposal that is ' + p.status }, 409);
  }

  const patch = { status: to };
  if (to === 'declined') { patch.declined_at = new Date().toISOString(); patch.declined_by = staff ? 'admin' : 'member'; }
  if (to === 'reverted') { patch.reverted_at = new Date().toISOString(); patch.reverted_by = me; }
  if (to === 'applied')  { patch.applied_at = new Date().toISOString(); patch.permitted_by = 'admin approved from the queue'; }

  try { await sb.update('proposals', { id }, patch); }
  catch (e) { return json({ error: String(e).slice(0, 300) }, 500); }
  return json({ id, from: p.status, to, by: staff ? 'admin' : 'member' });
}
