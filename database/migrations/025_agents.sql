-- 025: the tables the agents write to, and the onboarding agent's mark.
--
-- agent_runs is observability. Every agent writes one row per run, whether
-- it succeeds or fails, so a client who never got a welcome email can be
-- traced to the run that did not finish rather than guessed at.
--
-- morning_briefs arrives here rather than in Phase 5 because the onboarding
-- agent writes the first one, so that something is waiting when a new
-- client logs in for the first time. The Phase 5 cron writes the other 89.

-- ---------------------------------------------------------------------
-- Every agent run, successful or not.
-- ---------------------------------------------------------------------
create table if not exists agent_runs (
  id           uuid        primary key default gen_random_uuid(),
  agent        text        not null,
  client_id    uuid        references profiles(id) on delete set null,
  subject_id   uuid,                                   -- membership, panel, call, whatever the run was about
  status       text        not null default 'running'
                 check (status in ('running', 'ok', 'error', 'skipped')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  tokens_in    integer,
  tokens_out   integer,
  model        text,
  error        text,
  detail       jsonb
);

create index if not exists agent_runs_agent_idx  on agent_runs (agent, started_at desc);
create index if not exists agent_runs_client_idx on agent_runs (client_id, started_at desc);

alter table agent_runs enable row level security;

-- Deliberately staff only. A run row carries model names, token counts and
-- raw error text, which is operational detail, not client-facing content.
create policy agent_runs_staff on agent_runs
  for all using (is_staff()) with check (is_staff());

comment on table agent_runs is
  'One row per agent run. Written by the service key from server-side code. '
  'Staff read only: this is operations, not client content.';

-- ---------------------------------------------------------------------
-- The daily brief. One per client per program day.
-- ---------------------------------------------------------------------
create table if not exists morning_briefs (
  id            uuid         primary key default gen_random_uuid(),
  client_id     uuid         not null references profiles(id) on delete cascade,
  membership_id uuid         not null references memberships(id) on delete cascade,
  program_day   smallint     not null check (program_day between 0 and 90),
  brief_date    date         not null,
  tier          program_tier not null,
  content       text         not null,
  reading_grade numeric(3,1),
  source        text         not null default 'morning_brief_agent',
  created_at    timestamptz  not null default now(),
  read_at       timestamptz
);

-- One brief per person per day. The hourly cron in Phase 5 will run over
-- the same client more than once in a day if a time zone is edited or a run
-- is retried, and a client must never open the portal to two briefs.
create unique index if not exists morning_briefs_day_uidx
  on morning_briefs (membership_id, program_day);
create index if not exists morning_briefs_client_idx
  on morning_briefs (client_id, brief_date desc);

alter table morning_briefs enable row level security;

create policy morning_briefs_read on morning_briefs
  for select using (can_view_client(client_id));
-- A client marks their own brief read. That is the only column they may
-- touch, so the check pins client_id and nothing else is writable to them.
create policy morning_briefs_mark_read on morning_briefs
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy morning_briefs_staff on morning_briefs
  for all using (is_staff()) with check (is_staff());

comment on column morning_briefs.program_day is
  'Day 0 is the brief the onboarding agent writes before the program starts.';

-- ---------------------------------------------------------------------
-- The onboarding agent runs once per membership.
-- ---------------------------------------------------------------------
alter table memberships
  add column if not exists onboarded_at timestamptz;

comment on column memberships.onboarded_at is
  'Set by the onboarding agent when it has assigned the tier, written the '
  'first brief and sent the welcome email. Its presence is what stops the '
  'agent running twice: Stripe retries webhooks, and a client must not get '
  'two welcome emails.';
