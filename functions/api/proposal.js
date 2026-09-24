// Member decline and admin revert. POST /api/proposal { id, action }
//
// A member can decline an applied change from the portal; an admin can revert
// one with one click. Both are recorded with who and when, because an applied
// change nobody can undo is not bounded autonomy, it is just autonomy.

import { json, supabase, verifyStaff } from './_agent.js';

const NEXT = {
  applied:  { decline: 'declined', revert: 'reverted' },
  queued:   { approve: 'applied',  decline: 'declined' },
  declined: {},
  reverted: {},
};

export async function onRequestPost({ request, env }) {
  const sb = supabase(env);
  let body = {}; try { body = await request.json(); } catch (e) {}
  const { id, action } = body;
  if (!id || !action) return json({ error: 'id and action required' }, 400);

  const auth = request.headers.get('Authorization') || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const staff = await verifyStaff(request, env);
  let me = null;
  if (jwt) { const { data } = await sb.auth.getUser(jwt); me = data && data.user ? data.user.id : null; }
  if (!staff && !me) return json({ error: 'sign in first' }, 401);

  const { data: p } = await sb.from('proposals').select('*').eq('id', id).maybeSingle();
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

  const { error } = await sb.from('proposals').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);
  return json({ id, from: p.status, to, by: staff ? 'admin' : 'member' });
}
