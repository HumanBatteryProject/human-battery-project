// Whose records is this request about?
//
// WHY THIS IS ONE FUNCTION. I have now written the same three lines in eight endpoints:
//
//   const clientId = who.kind === 'member' ? who.id : body.client_id;
//
// and it is wrong in the same way every time. The owner's account is an admin, so whoami
// returns staff, so the ternary takes the second branch, so their own request is refused with
// "client_id required". I found that in data-request.js on Day 11, fixed it there, wrote the
// note about identity not depending on job title, and then reproduced it in five wearable
// endpoints within the hour.
//
// A rule that has to be retyped is a rule that will differ. So it is here once:
//
//   no client_id given  ->  yourself, whoever you are
//   client_id is you    ->  yourself
//   client_id is someone else -> staff or the service secret, or refused

export function subjectFor(who, asked) {
  const wanted = String(asked || '').trim();

  if (!wanted) return { ok: true, clientId: who.id, onBehalf: false };
  if (wanted === who.id) return { ok: true, clientId: who.id, onBehalf: false };

  if (['staff', 'service'].includes(who.kind)) {
    return { ok: true, clientId: wanted, onBehalf: true };
  }
  return { ok: false, status: 403, error: 'not allowed' };
}

/**
 * The service secret has no id of its own, so it MUST name a subject. Separated out because
 * "the caller is a machine" and "the caller is a person" fail differently: a machine with no
 * client_id is a bug in the caller, and a person with no client_id means themselves.
 */
export function requireSubject(who, asked) {
  const r = subjectFor(who, asked);
  if (!r.ok) return r;
  if (!r.clientId) {
    return { ok: false, status: 400,
             error: 'client_id required, because this caller has no identity of its own' };
  }
  return r;
}
