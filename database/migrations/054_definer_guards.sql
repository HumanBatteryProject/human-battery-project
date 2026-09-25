-- 054: authorization inside the SECURITY DEFINER functions, and EXECUTE stripped
-- from PUBLIC.
--
-- 053 closed the read hole. This closes a WRITE hole that 053 did not reach and
-- that the audit had not yet found, because the audit stopped at "anon can call
-- these, and each one defends itself". Two of them do. Three of them do not.
--
-- A SECURITY DEFINER function bypasses row level security by design. Three of
-- them wrote to participant records with no authorization check at all:
--
--   defer_day_zero(membership_id)              updates memberships.day_zero
--   record_omega3_collection(membership_id, d) updates the baseline collection date
--   compute_battery_score(panel_id, method)    inserts into battery_scores
--
-- This was not only an anonymous hole. Functions grant EXECUTE to PUBLIC by
-- default, so revoking from anon in 053 changed nothing for them, and any SIGNED
-- IN participant could pass somebody else's membership id and move their start
-- date or their baseline. That is a cross user write, which Part J forbids
-- outright.
--
-- submit_client_result and verify_client_result already checked auth.uid() and
-- is_staff() respectively and are left alone.
--
-- The guards below were inserted immediately after "begin" in each function and
-- the rest of every body is byte identical to what was already deployed. No
-- logic was rewritten while fixing a permission.

begin;

create or replace function defer_day_zero(p_membership_id uuid)
returns date
language plpgsql
security definer
set search_path = public
as $fn$
declare
  current_zero date;
  new_zero     date;
  wave_id      uuid;
begin
  -- ADDED IN 054. This function is SECURITY DEFINER, so it bypasses row level
  -- security by design, and it had no authorization check of any kind. Any
  -- signed in participant could defer ANOTHER participant's start date by
  -- passing their membership id, and the anonymous role could too, because
  -- functions grant EXECUTE to PUBLIC by default.
  if not (is_staff() or exists (
        select 1 from memberships m
         where m.id = p_membership_id and m.client_id = auth.uid())) then
    raise exception 'not permitted';
  end if;
  select day_zero into current_zero from memberships where id = p_membership_id;
  if current_zero is null then
    raise exception 'membership % has no day_zero to defer', p_membership_id;
  end if;

  -- The next wave strictly after the current one. Lead time does not
  -- apply here; the person has already been waiting.
  if extract(day from current_zero) < 15 then
    new_zero := (date_trunc('month', current_zero) + interval '14 days')::date;
  else
    new_zero := (date_trunc('month', current_zero) + interval '1 month')::date;
  end if;

  select id into wave_id from cohorts where starts_on = new_zero limit 1;

  update memberships
     set day_zero        = new_zero,
         cohort_id       = coalesce(wave_id, cohort_id),
         day_zero_deferrals = day_zero_deferrals + 1,
         updated_at      = now()
   where id = p_membership_id;

  return new_zero;
end;

$fn$;

create or replace function record_omega3_collection(p_membership_id uuid, p_collected_on date DEFAULT CURRENT_DATE)
returns TABLE(accepted boolean, program_day integer, reason text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  zero     date;
  day_n    integer;
begin
  -- ADDED IN 054. Same defect as defer_day_zero: SECURITY DEFINER with no
  -- authorization check. The Omega-3 collection date is the gate on day_zero, so
  -- writing it for somebody else moves their baseline.
  if not (is_staff() or exists (
        select 1 from memberships m
         where m.id = p_membership_id and m.client_id = auth.uid())) then
    raise exception 'not permitted';
  end if;
  select day_zero into zero from memberships where id = p_membership_id;
  if zero is null then
    return query select false, null::integer, 'This membership has no start date yet.';
    return;
  end if;

  -- Day 1 is day_zero. A spot collected before day_zero is day 0 or earlier.
  day_n := (p_collected_on - zero) + 1;

  if p_collected_on > zero + 14 then
    return query select false, day_n,
      'Collected on day ' || day_n || '. Past day 14 the spot no longer reflects pre-protocol membranes closely enough to stand as a baseline.';
    return;
  end if;

  update memberships
     set omega3_collected_on        = p_collected_on,
         omega3_kit_posted_at       = coalesce(omega3_kit_posted_at, now()),
         omega3_baseline_waived_at  = null,
         updated_at                 = now()
   where id = p_membership_id;

  return query select true, day_n,
    case when day_n <= 1
      then 'Recorded as your day 0 baseline.'
      else 'Recorded. Collected on day ' || day_n || ', which still reflects pre-protocol membranes. Your comparison will say so.'
    end;
end;

$fn$;

create or replace function compute_battery_score(p_panel_id uuid, p_method text DEFAULT 'bs-v1'::text)
returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_method_id   uuid;
  v_weights     jsonb;
  v_client      uuid;
  v_charge      numeric;
  v_drain       numeric;
  v_output      numeric;
  v_reserve     numeric;
  v_composite   numeric;
  v_weight_sum  numeric := 0;
  v_acc         numeric := 0;
  v_detail      jsonb;
begin
  -- ADDED IN 054. SECURITY DEFINER, writes battery_scores, and had no
  -- authorization check. Scoring is an internal operation: a participant has no
  -- reason to invoke it and must not be able to write a score row for any panel.
  if not is_staff() then
    raise exception 'not permitted';
  end if;
  select id, weights into v_method_id, v_weights
  from score_methods
  where version = p_method and retired_at is null;

  if v_method_id is null then
    raise exception 'Unknown or retired score method: %', p_method;
  end if;

  select client_id into v_client from lab_panels where id = p_panel_id;
  if v_client is null then
    raise exception 'No such panel: %', p_panel_id;
  end if;

  -- Per-marker scores for this panel.
  with scored as (
    select
      m.subsystem,
      m.slug,
      m.name,
      r.value,
      r.unit,
      score_marker(
        r.value,
        coalesce(r.ref_low,  m.ref_low),
        coalesce(r.ref_high, m.ref_high),
        m.optimal_low,
        m.optimal_high,
        m.better_direction
      ) as score
    from lab_results r
    join lab_markers m on m.id = r.marker_id
    where r.panel_id = p_panel_id
      and m.is_active
  ),
  -- A subsystem needs at least two markers to mean anything. One marker
  -- is a data point, not a system reading.
  by_system as (
    select subsystem, round(avg(score), 2) as score, count(*) as n
    from scored
    where score is not null
    group by subsystem
    having count(*) >= 2
  )
  select
    max(case when subsystem = 'charge'  then score end),
    max(case when subsystem = 'drain'   then score end),
    max(case when subsystem = 'output'  then score end),
    max(case when subsystem = 'reserve' then score end)
  into v_charge, v_drain, v_output, v_reserve
  from by_system;

  -- Weighted composite over whatever subsystems are present. Weights are
  -- renormalised so a partial panel is still comparable to a full one.
  if v_charge  is not null then
    v_acc := v_acc + v_charge  * (v_weights->>'charge')::numeric;
    v_weight_sum := v_weight_sum + (v_weights->>'charge')::numeric;
  end if;
  if v_drain   is not null then
    v_acc := v_acc + v_drain   * (v_weights->>'drain')::numeric;
    v_weight_sum := v_weight_sum + (v_weights->>'drain')::numeric;
  end if;
  if v_output  is not null then
    v_acc := v_acc + v_output  * (v_weights->>'output')::numeric;
    v_weight_sum := v_weight_sum + (v_weights->>'output')::numeric;
  end if;
  if v_reserve is not null then
    v_acc := v_acc + v_reserve * (v_weights->>'reserve')::numeric;
    v_weight_sum := v_weight_sum + (v_weights->>'reserve')::numeric;
  end if;

  if v_weight_sum = 0 then
    return null;   -- nothing scoreable in this panel
  end if;

  v_composite := round(v_acc / v_weight_sum, 2);

  -- Store the breakdown so the score can be explained line by line.
  select jsonb_agg(jsonb_build_object(
           'marker', slug, 'name', name, 'subsystem', subsystem,
           'value', value, 'unit', unit, 'score', score
         ) order by subsystem, slug)
  into v_detail
  from (
    select m.subsystem::text as subsystem, m.slug, m.name, r.value, r.unit,
           score_marker(r.value,
             coalesce(r.ref_low, m.ref_low), coalesce(r.ref_high, m.ref_high),
             m.optimal_low, m.optimal_high, m.better_direction) as score
    from lab_results r
    join lab_markers m on m.id = r.marker_id
    where r.panel_id = p_panel_id and m.is_active
  ) d;

  insert into battery_scores
    (client_id, panel_id, method_id, charge_score, drain_score,
     output_score, reserve_score, composite, detail, computed_at)
  values
    (v_client, p_panel_id, v_method_id, v_charge, v_drain,
     v_output, v_reserve, v_composite, v_detail, now())
  on conflict (panel_id, method_id) do update set
    charge_score  = excluded.charge_score,
    drain_score   = excluded.drain_score,
    output_score  = excluded.output_score,
    reserve_score = excluded.reserve_score,
    composite     = excluded.composite,
    detail        = excluded.detail,
    computed_at   = now();

  return v_composite;
end;

$fn$;

-- ---------------------------------------------------------------------
-- EXECUTE is granted to PUBLIC by default on every function, which is why
-- "revoke from anon" in 053 did not stop anon calling them. Revoke from PUBLIC,
-- then grant back explicitly to the roles that need each one.
--
-- Listed one by one rather than with a blanket grant, because a blanket grant to
-- authenticated is how this class of defect returns: it would hand every future
-- helper to every signed in participant without anybody deciding to.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all routines  in schema public from public;
revoke execute on all functions in schema public from anon;

-- The service key runs every /api endpoint and every job. It needs everything.
grant execute on all functions in schema public to service_role;

-- Referenced INSIDE row level security policies. The policy expression is
-- evaluated as the invoking role, so without these every policy that calls one
-- fails and the portal shows a signed in participant nothing at all.
grant execute on function is_staff()                        to authenticated;
grant execute on function current_role_is(app_role)          to authenticated;
grant execute on function can_view_client(uuid)              to authenticated;
grant execute on function is_enrolled()                      to authenticated;
grant execute on function my_program_tier()                  to authenticated;

-- Called by name from the portal. These five and no others: confirmed by
-- enumerating every rpc() call under public/.
grant execute on function submit_client_result(uuid, draw_point, date, text, jsonb) to authenticated;
grant execute on function verify_client_result(uuid, boolean)                        to authenticated;
grant execute on function defer_day_zero(uuid)                                       to authenticated;
grant execute on function record_omega3_collection(uuid, date)                       to authenticated;
grant execute on function in_season_for(uuid, date)                                  to authenticated;

-- in_season_for is not a definer function, so it runs as the caller and reads
-- season_of on the way through. Without this the seasonal screen fails for a
-- signed in participant.
grant execute on function season_of(date, text) to authenticated;

-- And stop the next function granting itself to the world.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

commit;
