-- 081: the owner can review and accept an application.
-- Part I Day 13: a consented pilot needs somebody to be accepted first.
--
-- THE GAP THIS CLOSES. The public form writes an application with status 'new'. Nothing
-- in the admin interface listed applications, and no function could change one's status,
-- so an application arrived and became unactionable. checkout.js refuses anybody without
-- an accepted application, by design, which means the enrolment path stopped at step two
-- and no participant could ever be enrolled through the interface.
--
-- It is not a hypothetical. drmicah@thehumanbatteryproject.com applied on 10 September
-- and has been sitting at 'new' for seventeen days, because there was nowhere to accept
-- it. A table with a status column and no way to change the status reads like a feature.
--
-- WHY A FUNCTION AND NOT A DIRECT UPDATE, which is the same reason 075 gives for the
-- twelve owner actions: row level security already lets an admin PATCH the row, and what
-- a PATCH cannot do is record what the status WAS, who changed it and why. "Accepted" and
-- "accepted, from reviewing, by this person, at this time, for this reason" are different
-- records, and only the second answers a question in three months.

create or replace function applications_set_status(
  p_application uuid,
  p_status text,
  p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare was text; who uuid; app_email text;
begin
  if not current_role_is('admin') then
    raise exception 'only an admin may change an application' using errcode = '42501';
  end if;

  -- 'enrolled' is deliberately NOT settable here. It is set by the payment webhook when
  -- money actually arrives, and an admin marking somebody enrolled by hand would create a
  -- participant with no payment, no entitlement and no schedule.
  if p_status = 'enrolled' then
    raise exception 'enrolled is set by the payment webhook, not by hand. Accept them and let them pay.'
      using errcode = '22023';
  end if;

  -- The same list the table's own check constraint allows, checked AFTER the enrolled case
  -- above. Ordered that way deliberately: 'enrolled' is not in this list either, so putting
  -- this first meant an admin trying it got "status must be new, reviewing, ..." and no hint
  -- that the payment webhook is what sets it. An error that explains beats one that refuses.
  if p_status not in ('new', 'reviewing', 'accepted', 'waitlisted', 'declined', 'withdrawn') then
    raise exception 'status must be new, reviewing, accepted, waitlisted, declined or withdrawn'
      using errcode = '22023';
  end if;

  select status, email into was, app_email from applications where id = p_application;
  if was is null then
    raise exception 'no such application' using errcode = 'P0002';
  end if;

  -- Going back from enrolled would orphan a paid membership.
  if was = 'enrolled' then
    raise exception 'that application is already enrolled, so its status is the payment record now'
      using errcode = '22023';
  end if;

  update applications set status = p_status where id = p_application;

  who := auth.uid();
  perform admin_audit('application.status_changed', 'applications', p_application, null,
                      jsonb_build_object('status', was),
                      jsonb_build_object('status', p_status), p_reason);

  return jsonb_build_object('ok', true, 'application_id', p_application,
                            'was', was, 'now', p_status, 'email', app_email);
end $fn$;

revoke execute on function applications_set_status(uuid, text, text) from public;
revoke execute on function applications_set_status(uuid, text, text) from anon;
grant execute on function applications_set_status(uuid, text, text) to authenticated, service_role;

-- Applications are staff-only reading. There is no member-facing view of somebody else's
-- application, and an applicant is not yet a profile, so there is nobody for can_view_client
-- to match.
alter table applications enable row level security;
drop policy if exists applications_staff_read on applications;
create policy applications_staff_read on applications for select using (is_staff());
