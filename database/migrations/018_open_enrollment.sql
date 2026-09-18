-- =====================================================================
-- 018  Open enrollment and individual clocks
--
-- Cohorts stop being seat-capped groups and become start waves: one row
-- per 1st and 15th, unlimited, generated ahead. Nobody is limited by a
-- wave. It exists so the weekly call and the reporting can say "the
-- March 1 wave" when that is useful.
--
-- Everyone runs their own 90-day clock from their own day_zero, which is
-- the next wave on or after the day they pay. Paying on the 3rd starts
-- you on the 15th. Paying on the 20th starts you on the 1st. That leaves
-- at least a week to get bloodwork done before the clock starts.
--
-- The first wave date lives in program_settings, not in code, so it can
-- move without a deploy.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Settings. Key/value so the schedule, the Zoom link and the first wave
-- date can change without a migration.
-- ---------------------------------------------------------------------
create table program_settings (
  key         text        primary key,
  value       text,
  description text,
  updated_at  timestamptz not null default now()
);

alter table program_settings enable row level security;

-- Enrolled clients need the call schedule and the Zoom link on their
-- dashboard. Nothing secret belongs in this table.
create policy program_settings_read on program_settings
  for select using (is_staff() or is_enrolled());
create policy program_settings_admin on program_settings
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

insert into program_settings (key, value, description) values
  ('first_wave_date',        '2027-01-01', 'No day_zero is ever earlier than this.'),
  ('weekly_call_day',        'Wednesday',  'Day of the week the group call runs.'),
  ('weekly_call_time',       '19:00',      'Local start time, 24 hour, in weekly_call_timezone.'),
  ('weekly_call_timezone',   'America/Chicago', 'IANA timezone for the call.'),
  ('weekly_call_zoom_url',   '',           'Empty until the standing Zoom link exists.'),
  ('return_price_cents',     '',           'Set in Phase 8, when the invitation back is built.'),
  ('coach_daily_message_limit', '20',      'Coach messages per client per day.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Cohorts become start waves. Seats no longer cap anything.
-- ---------------------------------------------------------------------
alter table cohorts alter column seats drop not null;
alter table cohorts alter column seats drop default;
comment on column cohorts.seats is
  'Legacy. Open enrollment has no seat cap. Null means uncapped, which is now every wave.';

-- ---------------------------------------------------------------------
-- The next wave on or after a given date, never before first_wave_date.
-- ---------------------------------------------------------------------
create or replace function next_wave_date(from_date date default current_date)
returns date
language plpgsql
stable
as $$
declare
  floor_date date;
  d          date;
begin
  select value::date into floor_date from program_settings where key = 'first_wave_date';
  d := greatest(from_date, coalesce(floor_date, from_date));

  if extract(day from d) <= 1 then
    return date_trunc('month', d)::date;
  elsif extract(day from d) <= 15 then
    return (date_trunc('month', d) + interval '14 days')::date;
  else
    return (date_trunc('month', d) + interval '1 month')::date;
  end if;
end;
$$;

comment on function next_wave_date(date) is
  'The next 1st or 15th on or after the given date, and never before first_wave_date.';

-- ---------------------------------------------------------------------
-- Generate wave rows. Safe to run repeatedly; existing waves are kept.
-- ---------------------------------------------------------------------
create or replace function create_waves(months_ahead integer default 12)
returns integer
language plpgsql
as $$
declare
  floor_date date;
  start_at   date;
  d          date;
  made       integer := 0;
  dom        integer;
begin
  select value::date into floor_date from program_settings where key = 'first_wave_date';
  start_at := greatest(current_date, coalesce(floor_date, current_date));
  d := date_trunc('month', start_at)::date;

  while d < (start_at + make_interval(months => months_ahead)) loop
    foreach dom in array array[1, 15] loop
      declare wave_day date := (date_trunc('month', d) + make_interval(days => dom - 1))::date;
      begin
        if wave_day >= start_at then
          insert into cohorts (code, name, status, seats, starts_on, ends_on, price_cents)
          values (
            'W' || to_char(wave_day, 'YYYY-MM-DD'),
            to_char(wave_day, 'FMMonth FMDD, YYYY') || ' wave',
            'enrolling',
            null,
            wave_day,
            wave_day + 89,
            100000
          )
          on conflict (code) do nothing;
          if found then made := made + 1; end if;
        end if;
      end;
    end loop;
    d := (d + interval '1 month')::date;
  end loop;

  return made;
end;
$$;

comment on function create_waves(integer) is
  'Inserts start waves for the 1st and 15th, months_ahead from now. Idempotent on cohorts.code.';

-- ---------------------------------------------------------------------
-- Individual clocks and repeat cycles.
-- ---------------------------------------------------------------------
alter table memberships
  add column if not exists cycle                  integer      not null default 1,
  add column if not exists intensity_multiplier   numeric(4,2) not null default 1.0,
  add column if not exists previous_membership_id uuid references memberships(id) on delete set null;

comment on column memberships.cycle is 'First 90 days is 1. A returning client starts cycle 2.';
comment on column memberships.intensity_multiplier is
  'Scales the protocol for a returning client. Capped in application code, never open ended.';

create index if not exists memberships_previous_idx on memberships (previous_membership_id);

-- ---------------------------------------------------------------------
-- The weekly call. One per week, open to everyone enrolled.
-- ---------------------------------------------------------------------
create table weekly_calls (
  id             uuid        primary key default gen_random_uuid(),
  scheduled_at   timestamptz not null,
  zoom_url       text,
  recording_url  text,
  topic          text,
  questions_open boolean     not null default true,
  created_at     timestamptz not null default now()
);

create index weekly_calls_when_idx on weekly_calls (scheduled_at desc);

alter table weekly_calls enable row level security;
create policy weekly_calls_read on weekly_calls
  for select using (is_staff() or is_enrolled());
create policy weekly_calls_staff on weekly_calls
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- Questions submitted ahead of a call.
-- ---------------------------------------------------------------------
create table call_questions (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references profiles(id) on delete cascade,
  call_id      uuid        references weekly_calls(id) on delete set null,
  question     text        not null,
  submitted_at timestamptz not null default now(),
  answered     boolean     not null default false
);

create index call_questions_call_idx on call_questions (call_id, submitted_at);

alter table call_questions enable row level security;
create policy call_questions_insert_self on call_questions
  for insert with check (client_id = auth.uid() and is_enrolled());
create policy call_questions_read on call_questions
  for select using (can_view_client(client_id));
create policy call_questions_staff on call_questions
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- The invitation back, written at day 90. Filled in during Phase 8.
-- ---------------------------------------------------------------------
create table completion_invitations (
  id                 uuid        primary key default gen_random_uuid(),
  client_id          uuid        not null references profiles(id) on delete cascade,
  from_membership_id uuid        not null references memberships(id) on delete cascade,
  offered_tier       program_tier,
  offered_multiplier numeric(4,2),
  improved           boolean,
  score_delta        numeric(6,2),
  markers_improved   text[],
  sent_at            timestamptz,
  accepted_at        timestamptz,
  declined_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index completion_invitations_client_idx on completion_invitations (client_id, created_at desc);

alter table completion_invitations enable row level security;
create policy completion_invitations_read on completion_invitations
  for select using (can_view_client(client_id));
create policy completion_invitations_staff on completion_invitations
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- Twelve months of waves, starting from the first wave date.
-- ---------------------------------------------------------------------
select create_waves(12);
