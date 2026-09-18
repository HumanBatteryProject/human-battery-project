-- =====================================================================
-- 019  Minimum lead time before a wave
--
-- 018 returned the next 1st or 15th. Paying on the 14th started you on
-- the 15th, which is one day to get a blood draw booked and nowhere near
-- enough for the Omega-3 Index kit, which has to ship out, be collected,
-- be posted back and be processed before day 0.
--
-- next_wave_date now skips to the following wave when the next one falls
-- inside minimum_lead_days. The number lives in program_settings so it
-- can move when the real turnaround is known.
--
-- Note this supersedes the spec's example of paying on the 3rd and
-- starting on the 15th. With a 14 day lead, the 3rd starts on the 1st of
-- the following month, because the 15th is only 12 days away.
-- =====================================================================

insert into program_settings (key, value, description) values
  ('minimum_lead_days', '14',
   'Clear days between paying and day zero. Set by the Omega-3 Index kit round trip, which is the longest lead item.')
on conflict (key) do nothing;

create or replace function next_wave_date(from_date date default current_date)
returns date
language plpgsql
stable
as $$
declare
  floor_date date;
  lead_days  integer;
  earliest   date;
  d          date;
begin
  select value::date    into floor_date from program_settings where key = 'first_wave_date';
  select value::integer into lead_days  from program_settings where key = 'minimum_lead_days';
  lead_days := coalesce(lead_days, 0);

  -- The first wave date is a floor on its own. The lead time applies to
  -- when the person paid, not to the floor.
  earliest := greatest(from_date + lead_days, coalesce(floor_date, from_date));

  if extract(day from earliest) <= 1 then
    return date_trunc('month', earliest)::date;
  elsif extract(day from earliest) <= 15 then
    return (date_trunc('month', earliest) + interval '14 days')::date;
  else
    return (date_trunc('month', earliest) + interval '1 month')::date;
  end if;
end;
$$;

comment on function next_wave_date(date) is
  'The next 1st or 15th at least minimum_lead_days after the given date, and never before first_wave_date.';
