-- 068: the baseline submission records its collection context.
--
-- D2 requires "relevant collection context such as fasting status" on every
-- result. 067 added the columns; this is the write path actually setting them.
-- Without it the columns default to 'unknown' forever and the requirement is met
-- on paper only.
--
-- The two new arguments have defaults, so every existing caller keeps working and
-- the old five argument signature is dropped explicitly rather than left as a
-- second overload that silently records 'unknown'.

drop function if exists submit_client_result(uuid, draw_point, date, text, jsonb);

create or replace function submit_client_result(
  p_membership_id uuid,
  p_draw_point draw_point,
  p_collected_on date,
  p_document_path text,
  p_values jsonb,
  p_fasting fasting_state default 'unknown',
  p_fasted_hours smallint default null)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $fn$
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
    insert into lab_panels (client_id, membership_id, draw_point, drawn_on, lab_name, document_path,
                            fasting_status, fasted_hours)
    values (v_client, p_membership_id, p_draw_point, p_collected_on, 'OmegaQuant', p_document_path,
            coalesce(p_fasting, 'unknown'), p_fasted_hours)
    returning id into v_panel;
  else
    update lab_panels
       set drawn_on = p_collected_on,
           document_path = coalesce(document_path, p_document_path),
           -- Only overwrite the collection context if this submission states one.
           -- 'unknown' arriving later must not erase a 'fasted' somebody recorded.
           fasting_status = case when p_fasting is null or p_fasting = 'unknown'
                                 then lab_panels.fasting_status else p_fasting end,
           fasted_hours = coalesce(p_fasted_hours, lab_panels.fasted_hours),
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

$fn$;

revoke execute on function submit_client_result(uuid, draw_point, date, text, jsonb, fasting_state, smallint) from public;
revoke execute on function submit_client_result(uuid, draw_point, date, text, jsonb, fasting_state, smallint) from anon;
grant execute on function submit_client_result(uuid, draw_point, date, text, jsonb, fasting_state, smallint) to authenticated;
grant execute on function submit_client_result(uuid, draw_point, date, text, jsonb, fasting_state, smallint) to service_role;

comment on function submit_client_result is
  'A participant entering their own results. Records the collection context, '
  'because a glucose of 130 fasted and 130 after a meal are not the same '
  'observation and storing them identically loses that permanently. A later '
  'submission stating "unknown" does not erase a fasting status already recorded.';
