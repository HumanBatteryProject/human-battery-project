-- =====================================================================
-- 006  The daily log
--
-- This is the research instrument and the accountability mechanism at
-- the same time. Design constraints that the shape here encodes:
--
--   * Structured, not free text. Every food and exercise points at a
--     reference row by ID. Free text exists as an optional note only.
--   * Under sixty seconds to complete on a phone, or compliance dies.
--   * A missed day is LOGGED, not punished. A program that shames people
--     into silence produces a record of good days only, which is
--     worthless for research and useless for coaching.
--   * Adherence is a percentage, not a streak. A broken streak makes
--     people quit; 78% makes them push for 85%.
-- =====================================================================

create table daily_logs (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid        not null references profiles(id) on delete cascade,
  membership_id   uuid        references memberships(id) on delete set null,
  log_date        date        not null,
  program_day     integer,                          -- 1..90, null outside program

  -- Sleep and light. Timestamps rather than durations, because circadian
  -- analysis needs when, not just how long.
  bedtime            timestamptz,
  waketime           timestamptz,
  sleep_quality      smallint check (sleep_quality between 1 and 5),
  morning_light_min  integer  check (morning_light_min between 0 and 600),
  morning_light_at   timestamptz,
  last_screen_at     timestamptz,

  -- Simple daily fields
  water_ml           integer  check (water_ml between 0 and 15000),
  first_meal_at      timestamptz,
  last_meal_at       timestamptz,
  alcohol_units      numeric(4,1) not null default 0 check (alcohol_units >= 0),
  added_sugar        boolean  not null default false,

  -- Adherence. daily_five_score is the count of protocol items hit today.
  daily_five_score   smallint check (daily_five_score between 0 and 5),
  adherence_pct      numeric(5,2) check (adherence_pct between 0 and 100),

  -- The one free-text field. Optional by design.
  note               text,

  -- Backfill window is enforced in application code (yesterday only).
  -- Retroactive logging is fiction and corrupts circadian timestamps.
  submitted_at       timestamptz not null default now(),
  is_backfilled      boolean     not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (client_id, log_date)
);

create index daily_logs_client_date_idx on daily_logs (client_id, log_date desc);
create index daily_logs_membership_idx  on daily_logs (membership_id, log_date);
create index daily_logs_date_idx        on daily_logs (log_date);

create trigger daily_logs_updated before update on daily_logs
  for each row execute function set_updated_at();

comment on column daily_logs.program_day is
  'Derived from membership.day_zero at write time and stored, so historic '
  'rows stay correct if day_zero is ever corrected.';

-- ---------------------------------------------------------------------
-- Food entries
-- ---------------------------------------------------------------------
create table log_foods (
  id            uuid primary key default gen_random_uuid(),
  daily_log_id  uuid        not null references daily_logs(id) on delete cascade,
  food_id       uuid        not null references foods(id) on delete restrict,
  recipe_id     uuid        references recipes(id) on delete set null,
  meal          meal_slot   not null,
  quantity      numeric(8,2) not null default 1 check (quantity > 0),
  unit          text        not null default 'serving',
  -- Set when the food's tier was 'excluded' at the time of logging.
  -- Recorded so deviations are visible without re-deriving from history.
  off_protocol  boolean     not null default false,
  logged_at     timestamptz not null default now()
);

create index log_foods_log_idx  on log_foods (daily_log_id);
create index log_foods_food_idx on log_foods (food_id);

-- ---------------------------------------------------------------------
-- Exercise entries
-- ---------------------------------------------------------------------
create table log_exercises (
  id            uuid primary key default gen_random_uuid(),
  daily_log_id  uuid        not null references daily_logs(id) on delete cascade,
  exercise_id   uuid        references exercises(id) on delete set null,
  modality      exercise_modality not null,
  duration_min  integer     check (duration_min between 0 and 1440),
  intensity     intensity_level,
  time_of_day   day_part,
  sets          smallint,
  reps          smallint,
  load_kg       numeric(6,2),
  distance_km   numeric(6,2),
  logged_at     timestamptz not null default now()
);

create index log_exercises_log_idx on log_exercises (daily_log_id);

-- ---------------------------------------------------------------------
-- Circadian and protocol practice entries — booleans with timestamps
-- ---------------------------------------------------------------------
create table log_practices (
  id            uuid primary key default gen_random_uuid(),
  daily_log_id  uuid        not null references daily_logs(id) on delete cascade,
  practice_id   uuid        not null references circadian_practices(id) on delete restrict,
  completed     boolean     not null default false,
  minutes       integer     check (minutes between 0 and 600),
  occurred_at   timestamptz,
  unique (daily_log_id, practice_id)
);

create index log_practices_log_idx on log_practices (daily_log_id);

-- ---------------------------------------------------------------------
-- Behavioural scores — the second axis
--
-- Blood measures the biology twice. This measures the inputs every day.
-- Five domains, 0-4 each. Two taps per domain at most.
-- ---------------------------------------------------------------------
create table log_behaviors (
  id            uuid primary key default gen_random_uuid(),
  daily_log_id  uuid        not null references daily_logs(id) on delete cascade,
  domain        behavior_domain not null,
  score         smallint    not null check (score between 0 and 4),
  minutes       integer     check (minutes >= 0),
  note          text,
  unique (daily_log_id, domain)
);

create index log_behaviors_log_idx    on log_behaviors (daily_log_id);
create index log_behaviors_domain_idx on log_behaviors (domain, score);

comment on table log_behaviors is
  'connection = social contact and sense of purpose; cognitive = deliberate '
  'learning vs passive consumption; movement = movement and muscle; '
  'light_sleep = light exposure and sleep timing; emotional = stress load.';
