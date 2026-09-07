-- =====================================================================
-- 004  Intake — demographics and questionnaire
-- =====================================================================

create table demographics (
  client_id        uuid primary key references profiles(id) on delete cascade,
  date_of_birth    date,
  sex_at_birth     sex_at_birth,
  height_cm        numeric(5,1) check (height_cm between 60 and 260),
  starting_weight_kg numeric(5,1) check (starting_weight_kg between 20 and 400),
  occupation       text,
  -- Usual sleep window, captured as local clock times.
  typical_bedtime  time,
  typical_waketime time,
  -- Free text. Deliberately not parsed into structured medical fields:
  -- this is a coaching program, not a medical record.
  medications_note text,
  supplements_note text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger demographics_updated before update on demographics
  for each row execute function set_updated_at();

comment on table demographics is
  'Stable client attributes. Weight over time lives in measurements, not here.';

-- ---------------------------------------------------------------------
-- Question bank. Questions are data, not code, so the intake can change
-- between cohorts without a migration — and old answers stay
-- interpretable because they point at a versioned question row.
-- ---------------------------------------------------------------------
create table questions (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null,              -- 'energy_afternoon'
  version       integer     not null default 1,
  kind          question_kind not null,
  prompt        text        not null,
  help_text     text,
  -- For select kinds: [{"value":"never","label":"Never"}, ...]
  options       jsonb,
  scale_min     integer,
  scale_max     integer,
  unit          text,
  sort_order    integer     not null default 0,
  is_required   boolean     not null default false,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (slug, version)
);

create index questions_active_idx on questions (sort_order) where retired_at is null;

-- ---------------------------------------------------------------------
-- Answers. Typed columns rather than one JSON blob, so aggregate queries
-- across clients stay possible without parsing.
-- ---------------------------------------------------------------------
create table intake_responses (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid        not null references profiles(id) on delete cascade,
  membership_id uuid        references memberships(id) on delete set null,
  question_id   uuid        not null references questions(id) on delete restrict,
  -- Captured again at day 90 so intake can be compared with exit.
  draw_point    draw_point  not null default 'day_0',
  value_text    text,
  value_number  numeric(12,3),
  value_boolean boolean,
  value_date    date,
  value_choices text[],                            -- for multi_select
  answered_at   timestamptz not null default now(),
  unique (client_id, question_id, draw_point)
);

create index intake_responses_client_idx on intake_responses (client_id, draw_point);

-- ---------------------------------------------------------------------
-- measurements — anything numeric tracked over time that isn't blood.
-- Grip strength is here deliberately: cheap, objective, strongly
-- predictive, and it gives a non-blood outcome measure.
-- ---------------------------------------------------------------------
create table measurements (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid        not null references profiles(id) on delete cascade,
  measured_on   date        not null,
  weight_kg     numeric(5,1),
  waist_cm      numeric(5,1),
  resting_hr    integer check (resting_hr between 25 and 200),
  systolic      integer check (systolic between 60 and 260),
  diastolic     integer check (diastolic between 30 and 180),
  grip_kg       numeric(5,1),
  notes         text,
  created_at    timestamptz not null default now(),
  unique (client_id, measured_on)
);

create index measurements_client_idx on measurements (client_id, measured_on desc);
