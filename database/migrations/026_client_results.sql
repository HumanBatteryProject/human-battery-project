-- 026: a client enters their own Omega-3 Index result.
--
-- The kit is ordered by the client and OmegaQuant emails the result to
-- the client, not to us. Without this there is no path for that number to
-- reach the program at all, and the Omega-3 Index is required at day 0 and
-- day 90 for every tier.
--
-- The rules, and where each one is enforced:
--
--   only markers the kit reports that are on our panel  lab_markers.client_enterable
--   only the client's own rows                          submit_client_result checks auth.uid()
--   only day 0 and day 90                               submit_client_result
--   source recorded as client-entered                   lab_results.source, defaulted and forced
--   a staff-verified flag beside it                     lab_results.verified_at / verified_by
--   the result PDF is required                          submit_client_result
--   implausible values rejected at entry                lab_markers.plausible_low / plausible_high
--
-- None of it lives in the browser. The portal talks to Supabase directly,
-- so anything checked only in JavaScript is not checked at all.

-- ---------------------------------------------------------------------
-- Where a number came from, and whether anyone has checked it.
-- ---------------------------------------------------------------------
create type result_source as enum ('lab_entered', 'client_entered');

alter table lab_results
  add column if not exists source      result_source not null default 'lab_entered',
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references profiles(id) on delete set null;

create index if not exists lab_results_unverified_idx
  on lab_results (source, verified_at) where source = 'client_entered' and verified_at is null;

comment on column lab_results.source is
  'Who put the number in. Self-entered values count in the Battery Score, '
  'so the score is never missing a required marker, but the data always '
  'says where it came from.';
comment on column lab_results.verified_at is
  'Set when staff have compared the number to the uploaded report. Null '
  'does not mean wrong, it means nobody has looked yet. Later analysis can '
  'separate checked numbers from unchecked ones on this column alone.';

-- ---------------------------------------------------------------------
-- Which markers a client may enter, and what counts as a possible number.
--
-- The plausible range is not the reference range and it is not the optimal
-- band. It is the range of values a real person can physically have. Its
-- only job is catching a typing mistake: 58 for 5.8 is the one that
-- matters, because it is a factor of ten and it would drag a Battery Score
-- and never look obviously wrong in a table.
-- ---------------------------------------------------------------------
alter table lab_markers
  add column if not exists client_enterable boolean not null default false,
  add column if not exists plausible_low    numeric,
  add column if not exists plausible_high   numeric,
  add column if not exists entry_hint       text;

alter table lab_markers
  add constraint lab_markers_plausible_needed
  check (not client_enterable or (plausible_low is not null and plausible_high is not null));

comment on column lab_markers.client_enterable is
  'True only for markers the OmegaQuant Complete kit reports that are also '
  'on our panel. Adding a marker here opens it to self-entry, so it is a '
  'deliberate act, not a default.';

-- The Omega-3 Index Complete kit reports both of these, and both are on
-- the panel. Nothing else on the kit is, and nothing else opens.
--
-- Omega-3 Index: red cell EPA plus DHA as a percentage of total fatty
-- acids. Published population values run from about 2 to 12. The window
-- below is wider than any real result on purpose: it is a typo catcher,
-- not a second opinion.
--
-- AA:EPA: at the low end a very high dose fish oil user can approach 1.
-- At the high end a western diet with no fish reaches the twenties. 0.2 to
-- 60 admits every real result and still catches a decimal point.
update lab_markers set
  client_enterable = true,
  plausible_low = 1.0, plausible_high = 20.0,
  entry_hint = 'On the report as Omega-3 Index, a percentage, usually between 2 and 12.'
where slug = 'omega3-index';

update lab_markers set
  client_enterable = true,
  plausible_low = 0.2, plausible_high = 60.0,
  entry_hint = 'On the report as AA:EPA, a ratio, usually between 2 and 25. Only the Complete test reports it.'
where slug = 'aa-epa-ratio';

-- ---------------------------------------------------------------------
-- A private bucket for what clients upload. One folder per client, named
-- with their own id, which is what the policies below key on.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-uploads', 'client-uploads', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic'])
on conflict (id) do nothing;

-- A client writes only into their own folder and reads only their own
-- folder. Staff read everything, because checking a number against the
-- report is the entire point of requiring the upload.
create policy "client uploads: own folder write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'client-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
    and is_enrolled()
  );

create policy "client uploads: own folder read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'client-uploads'
    and (is_staff() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- No update and no delete for clients, deliberately. A result document is
-- a record. Replacing it after staff have verified against it would make
-- the verified flag a lie.
create policy "client uploads: staff manage"
  on storage.objects for all to authenticated
  using (bucket_id = 'client-uploads' and is_staff())
  with check (bucket_id = 'client-uploads' and is_staff());

-- ---------------------------------------------------------------------
-- The only way a client writes a result.
--
-- security definer, because the client has no insert rights on lab_results
-- and must not be given any. Every rule is checked here, in one place, and
-- a rejection comes back as a plain sentence rather than a constraint
-- violation, because the person reading it is holding a lab report and
-- wondering what they did wrong.
-- ---------------------------------------------------------------------
create or replace function submit_client_result(
  p_membership_id uuid,
  p_draw_point    draw_point,
  p_collected_on  date,
  p_document_path text,
  p_values        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_client   uuid := auth.uid();
  v_member   memberships%rowtype;
  v_marker   lab_markers%rowtype;
  v_panel    uuid;
  v_slug     text;
  v_value    numeric;
  v_raw      text;
  v_written  int := 0;
  v_existing int;
begin
  if v_client is null then
    return jsonb_build_object('ok', false, 'message', 'You are not signed in.');
  end if;

  select * into v_member from memberships where id = p_membership_id;
  if not found or v_member.client_id <> v_client then
    -- Same answer either way. Telling a caller that a membership exists
    -- but is not theirs is a fact they did not have before.
    return jsonb_build_object('ok', false, 'message', 'We could not find that enrolment.');
  end if;

  if p_draw_point not in ('day_0', 'day_90') then
    return jsonb_build_object('ok', false,
      'message', 'Results can only be entered for day 0 and day 90.');
  end if;

  if p_document_path is null or length(trim(p_document_path)) = 0 then
    return jsonb_build_object('ok', false,
      'message', 'Please attach the report from OmegaQuant before saving.');
  end if;

  -- The upload policy already pins the folder to the caller, so a path
  -- under someone else's folder cannot have been written by this client.
  if (storage.foldername(p_document_path))[1] <> v_client::text then
    return jsonb_build_object('ok', false,
      'message', 'That file does not belong to this account.');
  end if;

  if not exists (select 1 from storage.objects
                 where bucket_id = 'client-uploads' and name = p_document_path) then
    return jsonb_build_object('ok', false,
      'message', 'The file did not finish uploading. Please try attaching it again.');
  end if;

  if p_collected_on is null or p_collected_on > current_date then
    return jsonb_build_object('ok', false,
      'message', 'Please enter the date on the report. It cannot be in the future.');
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    return jsonb_build_object('ok', false, 'message', 'Please enter at least one result.');
  end if;

  -- Validate everything before writing anything. A half-saved panel is
  -- worse than a refused one.
  for v_slug, v_raw in select key, value from jsonb_each_text(p_values) loop
    select * into v_marker from lab_markers where slug = v_slug and is_active;
    if not found or not v_marker.client_enterable then
      return jsonb_build_object('ok', false,
        'message', 'That is not a result you can enter here. You can enter the Omega-3 Index and the AA to EPA ratio.');
    end if;

    begin
      v_value := v_raw::numeric;
    exception when others then
      return jsonb_build_object('ok', false, 'field', v_slug,
        'message', format('%s should be a number. Please check the report.', v_marker.name));
    end;

    if v_value < v_marker.plausible_low or v_value > v_marker.plausible_high then
      return jsonb_build_object('ok', false, 'field', v_slug,
        'message', format(
          '%s came out as %s, which is outside anything we have seen. Please check the report, a misplaced decimal point is the usual cause. %s',
          v_marker.name, trim(to_char(v_value, 'FM999999990.0999')), coalesce(v_marker.entry_hint, '')));
    end if;
  end loop;

  -- One panel per draw point per membership. A second entry updates the
  -- panel and replaces those markers rather than creating a rival panel,
  -- because two day 0 panels would silently split a Battery Score.
  select id into v_panel from lab_panels
  where membership_id = p_membership_id and draw_point = p_draw_point
  order by created_at limit 1;

  if v_panel is null then
    insert into lab_panels (client_id, membership_id, draw_point, drawn_on, lab_name, document_path)
    values (v_client, p_membership_id, p_draw_point, p_collected_on, 'OmegaQuant', p_document_path)
    returning id into v_panel;
  else
    update lab_panels
       set drawn_on = p_collected_on,
           document_path = coalesce(document_path, p_document_path),
           updated_at = now()
     where id = v_panel;
  end if;

  for v_slug, v_raw in select key, value from jsonb_each_text(p_values) loop
    select * into v_marker from lab_markers where slug = v_slug;
    v_value := v_raw::numeric;

    -- A value staff have already checked is not silently overwritten by a
    -- later self-entry. That would erase the verification without erasing
    -- the flag.
    select count(*) into v_existing from lab_results
     where panel_id = v_panel and marker_id = v_marker.id and verified_at is not null;
    if v_existing > 0 then
      continue;
    end if;

    delete from lab_results where panel_id = v_panel and marker_id = v_marker.id;

    insert into lab_results (panel_id, marker_id, value, unit, ref_low, ref_high, entered_by, source)
    values (v_panel, v_marker.id, v_value, v_marker.unit,
            v_marker.ref_low, v_marker.ref_high, v_client, 'client_entered');
    v_written := v_written + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'panel_id', v_panel,
    'written', v_written,
    'message', 'Saved. We will check it against your report.');
end;
$$;

revoke all on function submit_client_result(uuid, draw_point, date, text, jsonb) from public;
grant execute on function submit_client_result(uuid, draw_point, date, text, jsonb) to authenticated;

comment on function submit_client_result is
  'The only path by which a client writes a lab result. Enforces own rows, '
  'day 0 and day 90 only, client-enterable markers only, a required '
  'document, and a plausible range. Writes source = client_entered.';

-- ---------------------------------------------------------------------
-- Staff verification, the other half of the flag.
-- ---------------------------------------------------------------------
create or replace function verify_client_result(p_result_id uuid, p_ok boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Staff only.');
  end if;
  update lab_results
     set verified_at = case when p_ok then now() else null end,
         verified_by = case when p_ok then auth.uid() else null end
   where id = p_result_id
   returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'message', 'No such result.');
  end if;
  return jsonb_build_object('ok', true, 'verified', p_ok);
end;
$$;

revoke all on function verify_client_result(uuid, boolean) from public;
grant execute on function verify_client_result(uuid, boolean) to authenticated;
