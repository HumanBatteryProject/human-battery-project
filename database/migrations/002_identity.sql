-- =====================================================================
-- 002  Identity, cohorts, pods, enrolment
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles — one row per authenticated user, extends auth.users
-- ---------------------------------------------------------------------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          app_role    not null default 'client',
  full_name     text        not null,
  email         citext      not null unique,
  phone         text,
  timezone      text        not null default 'America/Chicago',
  -- Residence drives which privacy regime applies (WA MHMDA, NV SB370, TX TDPSA).
  state         text,
  country       text        not null default 'US',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index profiles_role_idx on profiles (role) where is_active;
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

comment on column profiles.state is
  'State of residence. Determines the strictest applicable consumer health data law.';

-- ---------------------------------------------------------------------
-- cohorts
-- ---------------------------------------------------------------------
create table cohorts (
  id            uuid primary key default gen_random_uuid(),
  code          text        not null unique,          -- 'C01'
  name          text        not null,
  status        cohort_status not null default 'planning',
  seats         integer     not null default 25 check (seats > 0),
  starts_on     date        not null,
  ends_on       date        not null,
  price_cents   integer     not null check (price_cents >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint cohort_dates_ordered check (ends_on > starts_on)
);

create trigger cohorts_updated before update on cohorts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- pods — coach-led groups inside a cohort. Exists from day one so that
-- scaling to hundreds is a data change, not a migration.
-- ---------------------------------------------------------------------
create table pods (
  id            uuid primary key default gen_random_uuid(),
  cohort_id     uuid        not null references cohorts(id) on delete cascade,
  name          text        not null,
  coach_id      uuid        references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (cohort_id, name)
);

create index pods_coach_idx on pods (coach_id);

-- ---------------------------------------------------------------------
-- memberships — a client's enrolment in a cohort
-- ---------------------------------------------------------------------
create table memberships (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid        not null references profiles(id) on delete cascade,
  cohort_id       uuid        not null references cohorts(id) on delete restrict,
  pod_id          uuid        references pods(id) on delete set null,
  status          membership_status not null default 'invited',
  -- day_zero is the anchor for every relative date in the program.
  -- It can differ from cohort.starts_on if someone joins late.
  day_zero        date,
  completed_on    date,
  withdrawn_on    date,
  withdrawn_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, cohort_id)
);

create index memberships_cohort_idx on memberships (cohort_id, status);
create index memberships_pod_idx    on memberships (pod_id);
create index memberships_client_idx on memberships (client_id);

create trigger memberships_updated before update on memberships
  for each row execute function set_updated_at();

comment on column memberships.day_zero is
  'Anchor date. Program day N = day_zero + (N-1). Null until the client starts.';

-- ---------------------------------------------------------------------
-- Authorisation helpers. Security definer so they can read profiles
-- without recursing through the policies that call them.
-- ---------------------------------------------------------------------
create or replace function current_role_is(target app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = target and is_active
  );
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('coach', 'admin') and is_active
  );
$$;

-- True when the current user is an admin, or a coach who owns a pod that
-- the given client belongs to.
create or replace function can_view_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_client = auth.uid()
    or current_role_is('admin')
    or exists (
      select 1
      from memberships m
      join pods p on p.id = m.pod_id
      where m.client_id = target_client
        and p.coach_id  = auth.uid()
    );
$$;
