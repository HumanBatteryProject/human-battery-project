-- =====================================================================
-- 016  Program tiers
--
-- Placement by how the person already lives, assigned at intake.
-- Pro is already fasting, cold plunging, using a sauna, training
-- seriously. Beginner is starting from the couch. A client can move up
-- mid-program when their current tier becomes easy; the history is
-- kept so the day 0 / day 90 comparison can be read against the tier
-- they actually ran.
-- =====================================================================

create type program_tier as enum ('beginner', 'intermediate', 'advanced', 'pro');

alter table memberships
  add column if not exists tier program_tier,
  add column if not exists tier_assigned_at timestamptz,
  add column if not exists tier_assigned_by uuid references profiles(id) on delete set null;

create index if not exists memberships_tier_idx on memberships (cohort_id, tier);

-- Tier changes are recorded, never overwritten.
create table tier_history (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid        not null references memberships(id) on delete cascade,
  from_tier     program_tier,
  to_tier       program_tier not null,
  program_day   integer,
  reason        text,
  changed_by    uuid        references profiles(id) on delete set null,
  changed_at    timestamptz not null default now()
);

create index tier_history_membership_idx on tier_history (membership_id, changed_at);

alter table tier_history enable row level security;
create policy tier_history_read on tier_history
  for select using (
    exists (select 1 from memberships m
            where m.id = tier_history.membership_id and can_view_client(m.client_id))
  );
create policy tier_history_staff_write on tier_history
  for all using (is_staff()) with check (is_staff());

-- Practices, foods and content can now be scoped to a minimum tier
-- as well as a minimum phase.
alter table circadian_practices
  add column if not exists tier_min program_tier not null default 'beginner';

alter table exercises
  add column if not exists tier_min program_tier not null default 'beginner';

alter table recipes
  add column if not exists tier_min program_tier not null default 'beginner';

comment on column memberships.tier is
  'Assigned at intake from the placement rubric. Four or more matches in a '
  'column places the client there; mixed results place them in the lower of '
  'the two closest, because moving up is easier than failing.';
