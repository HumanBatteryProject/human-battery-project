-- 063: the start date a chained cycle gets.
--
-- 061 proved chaining works but the new cycle came out with day_zero null, and
-- the ruling is explicit: cycle 2 is a new row for the same participant WITH THE
-- NEXT START DATE. A cycle with no start date has no program day, so the brief
-- cannot place it and the member sees nothing.
--
-- WHY THIS IS A SEPARATE FUNCTION FROM program_start_dates. That one applies
-- minimum_lead_days, because a NEW participant needs time to get their baseline
-- labs drawn before day 0. A continuing participant does not: they are already in
-- the program and their day 90 draw is the same draw as the next cycle's day 0.
-- Applying the lead time to a continuation would push their next cycle three
-- weeks into the future for no reason, leaving a gap in which they are paying and
-- have no protocol.
--
-- Same 1st and 15th. Different reason for choosing among them, so a different
-- function rather than a boolean argument nobody would remember to pass.

create or replace function next_start_date_after(p_after date)
returns date
language sql stable as $$
  select min(d) from (
    select generate_series(date_trunc('month', p_after),
                           date_trunc('month', p_after) + interval '2 months',
                           interval '1 month')::date d
    union all
    select (generate_series(date_trunc('month', p_after),
                            date_trunc('month', p_after) + interval '2 months',
                            interval '1 month') + interval '14 days')::date
  ) x where d > p_after;
$$;

comment on function next_start_date_after is
  'The next 1st or 15th strictly after the given date, with NO lead time. For a '
  'continuing participant only: they already have a protocol and their day 90 '
  'draw is the next cycle''s day 0 draw. New participants use '
  'program_start_dates(), which does apply the lead time.';

revoke execute on function next_start_date_after(date) from public;
revoke execute on function next_start_date_after(date) from anon;
grant execute on function next_start_date_after(date) to service_role;
grant execute on function next_start_date_after(date) to authenticated;
