-- 041: completion summaries, and the rule that a finished cycle is immutable.
--
-- Chaining creates the NEXT cycle's rows and links them. It never mutates the
-- completed one. That is not tidiness: the completed cycle is the measurement.
-- If day 90 can be edited by anything that happens afterwards, the day 0 to
-- day 90 comparison stops being a comparison.

create table if not exists completion_summaries (
  id               uuid primary key default gen_random_uuid(),
  membership_id    uuid not null unique,
  client_id        uuid not null references profiles(id) on delete cascade,
  completed_on     date not null,
  dimensions       jsonb not null default '{}',
  markers_moved    jsonb not null default '{}',
  adherence_pct    numeric,
  days_logged      smallint,
  narrative        text,
  next_tier        program_tier,
  next_multiplier  numeric,
  created_at       timestamptz not null default now()
);

comment on table completion_summaries is
  'Written once at day 90 from stored scores and logs. The completed cycle is '
  'never edited afterwards, so this is a record rather than a view: a view '
  'would change if anything downstream changed, and then the day 0 to day 90 '
  'comparison would stop being a comparison.';

alter table memberships
  add column if not exists completion_summary_id uuid references completion_summaries(id);

comment on column memberships.intensity_multiplier is
  'Applied to the next cycle only. A returning member who improved comes back '
  'at the next tier, or at Pro with more intensity. Hard caps in CLAUDE.md '
  'still bind: sauna 25 minutes, cold 10 minutes and never below 38F, one '
  'extended fast a week. The multiplier scales toward those ceilings and can '
  'never scale past them.';
