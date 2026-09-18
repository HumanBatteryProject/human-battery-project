-- =====================================================================
-- 022  A late Omega-3 baseline is still a baseline
--
-- 021 made the waiver permanent. It does not need to be.
--
-- Red cell fatty acids turn over across roughly four months, which is
-- why the Omega-3 Index works as a 90-day marker at all. A spot
-- collected on day 10 still reflects pre-protocol membranes closely
-- enough to use as a baseline. So a client who waived on day 1 and then
-- sorted the kit out in week one can still record it.
--
-- The collection date travels with the number. The analysis and the day
-- 90 comparison say "collected on day 6" rather than pretending it was
-- day 0. Past day 14 the waiver stands.
-- =====================================================================

alter table memberships
  add column if not exists omega3_collected_on date;

comment on column memberships.omega3_collected_on is
  'The day the dried blood spot was actually collected. Day 0 for most, later for a recovered baseline. Always reported with the number, never rounded to day 0.';

-- ---------------------------------------------------------------------
-- Record a collection, clearing a waiver if one is in place.
-- Refuses past day 14, which is where the baseline stops being one.
-- ---------------------------------------------------------------------
create or replace function record_omega3_collection(
  p_membership_id uuid,
  p_collected_on  date default current_date
)
returns table (accepted boolean, program_day integer, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  zero     date;
  day_n    integer;
begin
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
$$;

comment on function record_omega3_collection(uuid, date) is
  'Records an Omega-3 collection and clears any waiver, up to day 14. Stores the real collection date.';

revoke all on function record_omega3_collection(uuid, date) from public;
grant execute on function record_omega3_collection(uuid, date) to authenticated;
