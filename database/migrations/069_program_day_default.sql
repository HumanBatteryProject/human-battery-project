-- 069: program_day defaults to the caller.
--
-- 067 gave it a required first argument, so the browser calling
-- rpc('program_day') with no arguments got nothing back and the check-in told a
-- participant with a start date of 2026-08-11 that their start date was not set.
-- Found by rendering the screen at a true 390px, not by reading the function.
--
-- Defaulting to auth.uid() also removes the shape where a screen has to pass a
-- participant id, which is the shape that lets one be passed somebody else's.

create or replace function program_day(target_client uuid default auth.uid(), on_date date default null)
returns integer
language sql stable as $$
  select case
           when m.day_zero is null then null
           else (coalesce(on_date,
                          (current_timestamp at time zone coalesce(p.timezone, 'America/Chicago'))::date)
                 - m.day_zero) + 1
         end
    from memberships m
    join profiles p on p.id = m.client_id
   where m.client_id = target_client
   order by m.cycle desc
   limit 1;
$$;

comment on function program_day is
  'Which day of the program the caller is on, in THEIR timezone. Day 1 is '
  'day_zero, the same convention the payment schedule uses. Defaults to '
  'auth.uid() so a screen never has to pass an id, which is the shape that lets '
  'one be passed somebody else''s. Null when no start date is set, which is not '
  'day 0 and must not be rendered as a number.';

revoke execute on function program_day(uuid, date) from public;
revoke execute on function program_day(uuid, date) from anon;
grant execute on function program_day(uuid, date) to authenticated, service_role;

-- PostgREST caches the function signatures it will accept. Changing an argument
-- list without telling it leaves the browser calling a shape the cache does not
-- have, answered with PGRST202 rather than a result. 051 learned this for a
-- foreign key; it is the same for a function.
notify pgrst, 'reload schema';
