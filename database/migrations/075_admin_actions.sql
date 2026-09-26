-- 075: the owner's actions, each one audited with what it was before.
-- Part I Day 9, master prompt D10.
--
-- WHY EVERY ACTION IS A FUNCTION AND NOT AN UPDATE. Row level security already
-- lets an admin write these tables directly, so the screens could just PATCH
-- them. What a direct PATCH cannot do is record what the value WAS. "Change the
-- tier" and "change the tier, from intermediate to advanced, by this person, at
-- this time, for this reason" are different records, and only the second one can
-- answer a question three months later.
--
-- The before value is read inside the same statement that writes the after
-- value, so the two cannot come apart.

-- ---------------------------------------------------------------------
-- A shared audit helper, so twelve actions cannot record twelve shapes.
-- ---------------------------------------------------------------------
create or replace function admin_audit(
  p_action text, p_table text, p_record uuid, p_subject uuid,
  p_before jsonb, p_after jsonb, p_reason text)
returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, table_name, record_id, subject_id, detail)
  values (auth.uid(), p_action, p_table, p_record, p_subject,
          jsonb_build_object('before', p_before, 'after', p_after, 'reason', p_reason));
$$;

revoke execute on function admin_audit(text, text, uuid, uuid, jsonb, jsonb, text) from public;
revoke execute on function admin_audit(text, text, uuid, uuid, jsonb, jsonb, text) from anon;

-- ---------------------------------------------------------------------
-- CANON APPROVAL. Day 9's done-when, and the thing that unblocks real
-- participants: until the owner approves, plan-run gives a real member nothing.
--
-- Approving is deliberately NOT a single "approve everything" button with no
-- record. Each rule is approved individually and each gets its own review row,
-- because approving fourteen rules is fourteen decisions even when they are made
-- in one sitting.
-- ---------------------------------------------------------------------
create or replace function approve_rules(p_rule_ids uuid[], p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; ids uuid[] := '{}';
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false, 'message', 'Only the owner may approve a rule.');
  end if;

  for r in select * from canonical_rules
            where id = any(p_rule_ids) and review_status = 'pending' and retired_at is null
  loop
    update canonical_rules
       set review_status = 'approved', reviewed_by = auth.uid(), approved_at = now()
     where id = r.id;

    insert into rule_reviews (rule_id, from_status, to_status, actor_id, reason)
    values (r.id, 'pending', 'approved', auth.uid(), p_reason);

    perform admin_audit('canon.approved', 'canonical_rules', r.id, null,
      jsonb_build_object('review_status', 'pending'),
      jsonb_build_object('review_status', 'approved', 'rule_key', r.rule_key,
                         'version', r.version, 'evidence_tier', r.evidence_tier),
      p_reason);
    n := n + 1; ids := ids || r.id;
  end loop;

  return jsonb_build_object('ok', true, 'approved', n, 'ids', ids);
end; $$;

create or replace function retire_rule(p_rule_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false, 'message', 'Only the owner may retire a rule.');
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    -- A retirement with no reason is a rule that vanished. Somebody will ask why.
    return jsonb_build_object('ok', false, 'message', 'A reason is required to retire a rule.');
  end if;
  select * into r from canonical_rules where id = p_rule_id;
  if r.id is null then return jsonb_build_object('ok', false, 'message', 'No such rule.'); end if;

  update canonical_rules
     set review_status = 'retired', retired_at = now(), reviewed_by = auth.uid()
   where id = p_rule_id;
  insert into rule_reviews (rule_id, from_status, to_status, actor_id, reason)
  values (p_rule_id, r.review_status, 'retired', auth.uid(), p_reason);
  perform admin_audit('canon.retired', 'canonical_rules', p_rule_id, null,
    jsonb_build_object('review_status', r.review_status),
    jsonb_build_object('review_status', 'retired', 'rule_key', r.rule_key), p_reason);

  -- Retiring does not delete. A plan action that cited this rule still has to be
  -- explainable, and a deleted rule makes every plan that used it unreadable.
  return jsonb_build_object('ok', true, 'retired', r.rule_key);
end; $$;

-- ---------------------------------------------------------------------
-- MEMBER ACTIONS. Each records the previous value.
-- ---------------------------------------------------------------------
create or replace function admin_set_tier(p_client uuid, p_tier program_tier, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false, 'message', 'Owner only.');
  end if;
  select * into m from memberships where client_id = p_client and completed_on is null
   order by cycle desc limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'message', 'No open membership.'); end if;

  update memberships set tier = p_tier, tier_assigned_at = now(), tier_assigned_by = auth.uid()
   where id = m.id;
  insert into tier_history (membership_id, from_tier, to_tier, changed_by, reason)
  values (m.id, m.tier, p_tier, auth.uid(), p_reason);
  perform admin_audit('member.tier_changed', 'memberships', m.id, p_client,
    jsonb_build_object('tier', m.tier), jsonb_build_object('tier', p_tier), p_reason);
  return jsonb_build_object('ok', true, 'before', m.tier, 'after', p_tier);
end; $$;

create or replace function admin_set_start_date(p_client uuid, p_date date, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false, 'message', 'Owner only.');
  end if;
  select * into m from memberships where client_id = p_client and completed_on is null
   order by cycle desc limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'message', 'No open membership.'); end if;

  -- Moving a start date moves the program day, the payment schedule and day
  -- ninety. Said back to the caller so the screen can show what else shifts.
  update memberships set day_zero = p_date, updated_at = now() where id = m.id;
  perform admin_audit('member.start_date_changed', 'memberships', m.id, p_client,
    jsonb_build_object('day_zero', m.day_zero), jsonb_build_object('day_zero', p_date), p_reason);
  return jsonb_build_object('ok', true, 'before', m.day_zero, 'after', p_date,
    'note', 'Program day, the payment schedule and day ninety all move with this.');
end; $$;

create or replace function admin_set_status(p_client uuid, p_status membership_status, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false, 'message', 'Owner only.');
  end if;
  select * into m from memberships where client_id = p_client and completed_on is null
   order by cycle desc limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'message', 'No open membership.'); end if;

  update memberships
     set status = p_status,
         completed_on = case when p_status = 'completed' then current_date else completed_on end,
         updated_at = now()
   where id = m.id;
  perform admin_audit('member.status_changed', 'memberships', m.id, p_client,
    jsonb_build_object('status', m.status), jsonb_build_object('status', p_status), p_reason);
  return jsonb_build_object('ok', true, 'before', m.status, 'after', p_status);
end; $$;

create or replace function admin_add_note(p_client uuid, p_note text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Staff only.');
  end if;
  if p_note is null or length(trim(p_note)) = 0 then
    return jsonb_build_object('ok', false, 'message', 'An empty note is not a note.');
  end if;
  insert into coach_notes (client_id, author_id, body)
  values (p_client, auth.uid(), p_note);
  perform admin_audit('member.note_added', 'coach_notes', null, p_client,
    null, jsonb_build_object('length', length(p_note)), null);
  return jsonb_build_object('ok', true);
end; $$;

-- ---------------------------------------------------------------------
-- SUPPORT. A reply is sent and logged, and the notification row carries no
-- health detail by the constraint that already exists on that table.
-- ---------------------------------------------------------------------
create or replace function admin_answer_support(p_request uuid, p_reply text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Staff only.');
  end if;
  if p_reply is null or length(trim(p_reply)) = 0 then
    return jsonb_build_object('ok', false, 'message', 'An empty reply is not a reply.');
  end if;
  select * into s from support_requests where id = p_request;
  if s.id is null then return jsonb_build_object('ok', false, 'message', 'No such request.'); end if;

  update support_requests
     set reply = p_reply, status = 'answered', answered_at = now(), answered_by = auth.uid()
   where id = p_request;
  perform admin_audit('support.answered', 'support_requests', p_request, s.client_id,
    jsonb_build_object('status', s.status), jsonb_build_object('status', 'answered'), null);
  return jsonb_build_object('ok', true, 'client_id', s.client_id);
end; $$;

-- ---------------------------------------------------------------------
-- SENSITIVE ACCESS. Part G: log access to sensitive records.
--
-- Called by the member detail screen when it opens a participant's records. It
-- records that somebody LOOKED, which is the part that is invisible otherwise:
-- reading leaves no trace at all unless something writes one.
-- ---------------------------------------------------------------------
create or replace function log_record_access(p_client uuid, p_what text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then return; end if;
  -- Nobody needs an audit row for reading their own records.
  if auth.uid() = p_client then return; end if;
  insert into audit_log (actor_id, action, table_name, subject_id, detail)
  values (auth.uid(), 'record.viewed', p_what, p_client,
          jsonb_build_object('what', p_what));
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'approve_rules(uuid[], text)', 'retire_rule(uuid, text)',
    'admin_set_tier(uuid, program_tier, text)', 'admin_set_start_date(uuid, date, text)',
    'admin_set_status(uuid, membership_status, text)', 'admin_add_note(uuid, text)',
    'admin_answer_support(uuid, text)', 'log_record_access(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    execute format('revoke execute on function %s from anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
