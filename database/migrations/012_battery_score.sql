-- =====================================================================
-- 012  Battery Score computation
--
-- Turns a lab panel into four subsystem scores and one composite.
--
-- Design constraints:
--   * Every marker is scored 0-100 by distance from its PROGRAM-OPTIMAL
--     band, not by whether it falls inside the lab's reference range.
--     A "normal" result sitting at the edge of the range is exactly the
--     person this program is for.
--   * Markers absent from a panel are EXCLUDED, never imputed. A missing
--     marker must not quietly become an average one.
--   * Subsystem weights are renormalised over whatever subsystems are
--     present, so a partial panel still produces a comparable composite.
--   * The per-marker breakdown is stored, so a score can be explained
--     line by line rather than asserted.
--
-- The Battery Score is a tracking index for this program. It is not
-- diagnostic, not validated for clinical use, and must never be
-- presented to a clinician as a medical measurement.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Score one marker value, 0-100.
--
-- 100  inside the optimal band
--  50  at the edge of the lab reference range
--   0  at or beyond twice the distance from optimal to reference edge
--
-- Linear between those points. Clamped.
-- ---------------------------------------------------------------------
create or replace function score_marker(
  v            numeric,
  ref_low      numeric,
  ref_high     numeric,
  opt_low      numeric,
  opt_high     numeric,
  direction    smallint
) returns numeric
language plpgsql
immutable
as $$
declare
  edge   numeric;   -- reference-range boundary in the failing direction
  target numeric;   -- optimal-band boundary in the failing direction
  span   numeric;
  raw    numeric;
begin
  if v is null then
    return null;
  end if;

  -- Inside the optimal band scores full marks, whichever bounds exist.
  if (opt_low is null or v >= opt_low) and (opt_high is null or v <= opt_high) then
    return 100;
  end if;

  if opt_low is not null and v < opt_low then
    -- Too low.
    target := opt_low;
    edge   := coalesce(ref_low, opt_low * 0.5);
  else
    -- Too high.
    target := opt_high;
    edge   := coalesce(ref_high, opt_high * 1.5);
  end if;

  span := abs(target - edge);

  -- Degenerate case: optimal boundary equals the reference boundary.
  -- Fall back to a fixed 20% band so the score still decays smoothly.
  if span = 0 or span is null then
    span := greatest(abs(target) * 0.2, 0.0001);
  end if;

  -- 100 at the optimal boundary, 50 at the reference edge, 0 at twice that.
  raw := 100 - (abs(v - target) / span) * 50;

  return greatest(0, least(100, round(raw, 2)));
end;
$$;

comment on function score_marker is
  'Marker score 0-100. 100 inside the program-optimal band, 50 at the lab '
  'reference edge, 0 at twice that distance. Direction is carried by which '
  'optimal bound is breached, so the argument is accepted for clarity but '
  'the bounds do the work.';

-- ---------------------------------------------------------------------
-- Compute and store a Battery Score for one panel.
-- Returns the composite. Safe to re-run — upserts on (panel, method).
-- ---------------------------------------------------------------------
create or replace function compute_battery_score(
  p_panel_id  uuid,
  p_method    text default 'bs-v1'
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
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
$$;

comment on function compute_battery_score is
  'Computes and stores the Battery Score for a panel. Idempotent.';

-- ---------------------------------------------------------------------
-- Day 0 vs day 90 at subsystem level
-- ---------------------------------------------------------------------
create or replace view score_progress as
select
  b0.client_id,
  b0.composite      as day_0_composite,
  b90.composite     as day_90_composite,
  round(b90.composite - b0.composite, 2)      as composite_delta,
  round(b90.charge_score  - b0.charge_score, 2)  as charge_delta,
  round(b90.drain_score   - b0.drain_score, 2)   as drain_delta,
  round(b90.output_score  - b0.output_score, 2)  as output_delta,
  round(b90.reserve_score - b0.reserve_score, 2) as reserve_delta
from battery_scores b0
join lab_panels p0  on p0.id = b0.panel_id and p0.draw_point = 'day_0'
join lab_panels p90 on p90.client_id = p0.client_id and p90.draw_point = 'day_90'
join battery_scores b90 on b90.panel_id = p90.id and b90.method_id = b0.method_id;
