-- 067: program day, computed once, and the baseline record fields D2 requires.
-- Part I Day 3.
--
-- PROGRAM DAY. D1 requires program day tracking in the PARTICIPANT's local
-- timezone. There was no function for it: daily_logs has a program_day column
-- that every caller filled in for itself, which is the shape that produces two
-- answers. A participant in Auckland reaches day 47 most of a day before a server
-- in Chicago agrees, and the brief, the plan and the check-in must all say 47.
--
-- Day 1 IS day_zero, matching the payment schedule, so day_zero + 46 is day 47.

create or replace function program_day(target_client uuid, on_date date default null)
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
  'Which day of the program the participant is on, in THEIR timezone. Day 1 is '
  'day_zero, the same convention the payment schedule uses. Null when no start '
  'date is set yet, which is different from day 0 and must not be rendered as a '
  'number. Reads the latest cycle, so a continuing participant gets the current '
  'cycle''s day and not a count from their first ever start.';

revoke execute on function program_day(uuid, date) from public;
revoke execute on function program_day(uuid, date) from anon;
grant execute on function program_day(uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- BASELINE RECORDS. D2 lists what every result must preserve. All of it existed
-- except the collection context, which is the one that changes what a number
-- MEANS: a glucose of 130 fasted and 130 two hours after a meal are not the same
-- observation, and storing them identically loses that permanently.
-- ---------------------------------------------------------------------
do $$ begin
  create type fasting_state as enum ('fasted','not_fasted','unknown');
exception when duplicate_object then null; end $$;

alter table lab_panels
  add column if not exists fasting_status fasting_state not null default 'unknown',
  add column if not exists fasted_hours smallint check (fasted_hours is null or fasted_hours between 0 and 48),
  add column if not exists collection_note text;

comment on column lab_panels.fasting_status is
  'D2 collection context. Defaults to unknown rather than to fasted: assuming a '
  'draw was fasted when nobody said so is inventing the context, and a fasting '
  'glucose reference range applied to a fed sample reads as a problem that is not '
  'there. unknown is a fact; fasted is a claim.';

-- ---------------------------------------------------------------------
-- START DATE SELECTION. D1: the participant picks the 1st or the 15th. Stored on
-- the application so the choice survives from the form to the membership.
-- ---------------------------------------------------------------------
alter table applications
  add column if not exists preferred_start_date date;

comment on column applications.preferred_start_date is
  'Which of the offered start dates the applicant chose. Validated against '
  'program_start_dates() on submit, so a hand posted date that does not leave '
  'time for the baseline draw is refused rather than accepted and quietly moved.';

-- Is this a date the program actually offers? Used by the form handler, so the
-- rule lives in one place rather than being re-derived in JavaScript.
create or replace function is_offered_start_date(d date)
returns boolean
language sql stable as $$
  select exists (select 1 from program_start_dates(12) s where s = d);
$$;

comment on function is_offered_start_date is
  'True only for a date program_start_dates() currently offers. The 1st and the '
  '15th exist to leave time for the baseline labs, so a date that does not leave '
  'that time is not an offer even if it is a 1st or a 15th.';

revoke execute on function is_offered_start_date(date) from public;
revoke execute on function is_offered_start_date(date) from anon;
grant execute on function is_offered_start_date(date) to authenticated, service_role;
