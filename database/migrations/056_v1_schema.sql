-- 056: the Version 1 schema. Part I Day 1.
--
-- WHAT IS NOT HERE, AND WHY. The specification's entity list names consents,
-- daily_checkins, day90_summaries, dimension_summaries and score_snapshots.
-- Every one of those already exists under another name and is already correct:
--
--   consents            -> consent_documents (version, body_sha256, effective_from)
--                          plus client_consents (granted, granted_at, withdrawn_at)
--   daily_checkins      -> daily_logs, extended below with the fields D3 adds
--   day90_summaries     -> completion_summaries
--   dimension_summaries -> dimension_scores
--   score_snapshots     -> battery_scores
--   audit_log           -> audit_log, already exactly the right shape
--
-- Creating parallel tables would leave two places to read the same fact, which
-- is how a member's consent ends up recorded in one and checked in the other.
-- The instruction is to preserve and reuse existing working functionality.

-- =====================================================================
-- PILLARS. Master prompt C1: six, and every canonical rule belongs to one.
-- A table rather than an enum so the admin interface can show the mapping and
-- so a rule's pillar is a foreign key that cannot be misspelled.
-- =====================================================================
create table if not exists pillars (
  key         text primary key,
  label       text not null,
  sort_order  smallint not null,
  description text not null
);

insert into pillars (key, label, sort_order, description) values
  ('morning_daylight',  'Morning daylight',  1, 'Light on the eyes early, which sets everything downstream.'),
  ('hydration',         'Hydration',         2, 'The morning glass, then water with minerals through the day.'),
  ('movement',          'Movement',          3, 'Walking after meals, easy aerobic work, and load.'),
  ('food_timing',       'Food timing',       4, 'When the first and last meal happen, and how long the window is.'),
  ('sleep',             'Sleep',             5, 'The same bedtime and wake time, in a dark cool room.'),
  ('nighttime_darkness','Nighttime darkness',6, 'Getting the light out of the evening so sleep can start.')
on conflict (key) do nothing;

-- The nine protocol sections, and which pillar each maps onto. Recorded as data
-- because the mapping is a decision the owner made and the admin interface has
-- to be able to show it. Sections 08 and 09 map to no pillar: 08 is the phase
-- structure and 09 is the check-in, neither of which is a rule domain.
create table if not exists protocol_section_pillars (
  section_no  smallint primary key,
  section     text not null,
  pillar_key  text references pillars(key),
  note        text not null
);

insert into protocol_section_pillars (section_no, section, pillar_key, note) values
  (1, '01 THE CLOCK',        'morning_daylight',
      'Split. The morning light rules map here; the evening and pre-sleep light rules map to nighttime_darkness, which otherwise has no section and no rules.'),
  (2, '02 WATER',            'hydration',      'Clean fit.'),
  (3, '03 MOVEMENT',         'movement',       'Clean fit.'),
  (4, '04 FOOD',             'food_timing',    'The eating window maps here. What a person eats is carried by the Dietary Guidelines as education: the six pillars contain no pillar for food composition.'),
  (5, '05 HEAT AND COLD',    null,
      'NO PILLAR. Sauna and cold are not among the six. Both are in the medication screening table and both have hard caps, so they are kept as protocol instruction and generate NO daily actions in V1. Part D4 asks for low risk actions only.'),
  (6, '06 SLEEP',            'sleep',          'Clean fit.'),
  (7, '07 ENVIRONMENT',      'nighttime_darkness',
      'Glasses, bulbs and the router timer are the tools that make evening darkness possible, so the rules that are rules map here. Sourcing is a directory, not a rule.'),
  (8, '08 THE NINETY DAYS',  null,             'Not a rule domain. Program state, covered by D1.'),
  (9, '09 EVERY DAY',        null,             'Not a rule domain. This is the check-in itself, covered by D3.')
on conflict (section_no) do update
  set pillar_key = excluded.pillar_key, note = excluded.note, section = excluded.section;

-- =====================================================================
-- CANONICAL RULES. Master prompt C5, every field it names.
-- review_status starts at 'pending' and ONLY 'approved' may generate an action.
-- =====================================================================
do $$ begin
  create type rule_review_status as enum ('pending','approved','retired','rejected');
exception when duplicate_object then null; end $$;

create table if not exists canonical_rules (
  id              uuid primary key default gen_random_uuid(),
  rule_key        text not null,                    -- stable across versions
  version         integer not null default 1,
  pillar_key      text not null references pillars(key),

  -- who it is for, and what it needs before it can fire
  population      text not null,
  eligibility     jsonb not null default '{}'::jsonb,
  required_data   text[] not null default '{}',

  -- what to do, and how far it may be personalised
  action_text     text not null,
  parameter       text,                             -- protocol_parameters.param
  personalization jsonb not null default '{}'::jsonb,

  -- what must stop it
  contraindications text[] not null default '{}',   -- medication screening flags
  stop_conditions   text[] not null default '{}',

  -- evidence, per B2. unsupported may never appear here.
  evidence_tier   evidence_tier not null,
  source_passages uuid[] not null default '{}',

  reassess_days   smallint not null default 14,

  review_status   rule_review_status not null default 'pending',
  reviewed_by     uuid references profiles(id),
  approved_at     timestamptz,
  retired_at      timestamptz,
  created_at      timestamptz not null default now(),

  unique (rule_key, version),

  -- An approved rule must say who approved it and when. Without this a row can
  -- look approved with nobody accountable for it, which is the one thing the
  -- approval workflow exists to prevent.
  constraint approved_rules_are_accountable check (
    (review_status <> 'approved')
    or (reviewed_by is not null and approved_at is not null)),

  -- unsupported never generates an action, so it may not be a rule's tier.
  constraint no_unsupported_rule check (evidence_tier <> 'unsupported')
);

create index if not exists canonical_rules_live_idx
  on canonical_rules (pillar_key, review_status) where retired_at is null;

comment on table canonical_rules is
  'The action catalog. Only review_status = approved may generate a plan action, '
  'enforced in eligible_rules() below and not only in application code.';

-- Every state change to a rule, so version history is a record rather than a
-- reconstruction.
create table if not exists rule_reviews (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references canonical_rules(id) on delete cascade,
  from_status rule_review_status,
  to_status   rule_review_status not null,
  actor_id    uuid references profiles(id),
  reason      text,
  occurred_at timestamptz not null default now()
);

-- The single gate. Application code asks this, so "only approved rules generate
-- actions" is true in the database and not only in whichever endpoint remembers.
create or replace function eligible_rules(p_pillar text default null)
returns setof canonical_rules
language sql stable as $$
  select * from canonical_rules
   where review_status = 'approved'
     and retired_at is null
     and (p_pillar is null or pillar_key = p_pillar)
   order by pillar_key, rule_key;
$$;

-- =====================================================================
-- THE DAILY LOOP. D3 check-in fields, D4 plans and actions.
-- =====================================================================
alter table daily_logs
  add column if not exists energy            smallint check (energy between 1 and 5),
  add column if not exists symptoms          text[],
  add column if not exists movement_minutes  smallint,
  add column if not exists evening_light_low boolean,
  add column if not exists outdoor_daylight_min smallint;

comment on column daily_logs.energy is
  'D3. One to five. Deliberately coarse: a ten point scale invites precision '
  'that a person cannot actually feel the difference between.';

do $$ begin
  create type plan_action_status as enum ('pending','complete','skip','adjust');
exception when duplicate_object then null; end $$;

create table if not exists daily_plans (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references profiles(id) on delete cascade,
  membership_id uuid references memberships(id) on delete cascade,
  plan_date     date not null,                  -- the member's LOCAL date
  program_day   integer,
  generated_by  text not null,                  -- 'rules' or 'rules+explainer'
  ai_paused     boolean not null default false, -- true when the kill switch was off
  canon_version text,
  created_at    timestamptz not null default now(),
  unique (client_id, plan_date)                 -- one plan per member per local day
);

comment on constraint daily_plans_client_id_plan_date_key on daily_plans is
  'Idempotence for the daily job. Two firings for the same local date must '
  'produce one plan, and this is what makes that true rather than the job logic.';

create table if not exists plan_actions (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references daily_plans(id) on delete cascade,
  rule_id        uuid not null references canonical_rules(id),
  rule_key       text not null,
  rule_version   integer not null,
  sort_order     smallint not null default 0,

  action_text    text not null,
  why            text not null,                 -- why this was selected
  observations   jsonb not null default '[]'::jsonb,
  provenance     text not null default 'self_reported'
                 check (provenance in ('self_reported','device','lab','uploaded_document')),
  missing_data   text[] not null default '{}',
  confidence     text not null default 'limited'
                 check (confidence in ('good','limited','insufficient')),
  review_on      date,
  recipe_id      uuid references recipes(id),    -- D12.3, a suggestion inside the action

  status         plan_action_status not null default 'pending',
  barrier        text,
  responded_at   timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists plan_actions_plan_idx on plan_actions (plan_id, sort_order);

comment on column plan_actions.confidence is
  'Qualitative, per D4, tied to data coverage. Never a fabricated percentage: a '
  'number like 82 percent implies a calibration this system does not have.';

-- Rules excluded for a member, and why, so D13.4 and D4 can say so in words.
create table if not exists plan_exclusions (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references daily_plans(id) on delete cascade,
  rule_id    uuid not null references canonical_rules(id),
  reason     text not null,
  basis      text not null check (basis in ('contraindication','screening','eligibility','coverage','stop_condition')),
  created_at timestamptz not null default now()
);

create table if not exists weekly_reviews (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references profiles(id) on delete cascade,
  membership_id uuid references memberships(id) on delete cascade,
  week_start    date not null,
  changed       jsonb not null default '[]'::jsonb,
  stable        jsonb not null default '[]'::jsonb,
  actions_done  smallint,
  actions_total smallint,
  barriers      text[],
  limitations   text[],
  priorities    jsonb not null default '[]'::jsonb,
  narrative     text,
  created_at    timestamptz not null default now(),
  unique (client_id, week_start)
);

-- =====================================================================
-- BILLING. D9 and D3.8. payments already exists and is reused.
-- =====================================================================
do $$ begin
  create type entitlement_kind as enum ('program','continuation_monthly','continuation_annual');
exception when duplicate_object then null; end $$;

create table if not exists entitlements (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references profiles(id) on delete cascade,
  membership_id uuid references memberships(id) on delete set null,
  kind          entitlement_kind not null,
  effective_from date not null,
  effective_to   date,                      -- null means open ended
  renews_on      date,
  cancelled_at   timestamptz,
  access_until   date,                      -- cancellation keeps access to period end
  stripe_subscription text,
  stripe_customer     text,
  created_at    timestamptz not null default now()
);

create index if not exists entitlements_live_idx on entitlements (client_id, kind, effective_from);

comment on table entitlements is
  'Server side access, per D9. The portal never decides what a member may see; '
  'it asks. Cancellation sets access_until rather than deleting, because D9 '
  'says a cancelled membership keeps access to the end of the paid period and '
  'that cancellation is not deletion.';

-- Webhook idempotence and out of order tolerance, D9 and D3.8.
create table if not exists webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'stripe',
  event_id      text not null,
  event_type    text not null,
  created_at_provider timestamptz,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  status        text not null default 'received' check (status in ('received','processed','ignored','failed')),
  error         text,
  payload       jsonb,
  unique (provider, event_id)
);

comment on constraint webhook_events_provider_event_id_key on webhook_events is
  'A replayed webhook must not create a second membership or a second charge. '
  'Stripe retries on any non 2xx, so this is not a rare case: it is the normal '
  'behaviour of the system we are integrating with.';

-- =====================================================================
-- OPERATIONS. E4 cost and job records, D10 admin surfaces.
-- =====================================================================
create table if not exists ai_calls (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references profiles(id) on delete set null,
  component     text not null,              -- observer|interpreter|planner|explainer|reviewer|records_reader
  agent         text,
  model         text not null,
  prompt_version text,
  canon_version  text,
  tokens_in     integer,
  tokens_out    integer,
  occurred_at   timestamptz not null default now()
);

create index if not exists ai_calls_client_day_idx on ai_calls (client_id, occurred_at);

comment on table ai_calls is
  'Section 8 of the plan: measure, do not invent. Token counts are recorded and '
  'the provider rate is entered by the owner, because this repository does not '
  'know what a million tokens costs and must not guess.';

create table if not exists job_runs (
  id            uuid primary key default gen_random_uuid(),
  job           text not null,
  idempotency_key text,
  status        text not null default 'running' check (status in ('running','ok','failed','skipped')),
  attempt       smallint not null default 1,
  detail        jsonb,
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  unique (job, idempotency_key)
);

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references profiles(id) on delete set null,
  channel     text not null default 'email',
  kind        text not null,               -- sign_in|daily_plan|weekly_review|receipt|support_reply
  recipient   text not null,
  subject     text not null,
  status      text not null default 'queued' check (status in ('queued','sent','failed','bounced')),
  provider_id text,
  error       text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  -- Part G and D10.2: no health details in a subject line or a preview. The
  -- body is deliberately NOT stored here; the log records that a message was
  -- sent and to whom, not its contents.
  constraint subject_carries_no_health_detail check (
    subject !~* '(glucose|hba1c|ferritin|triglyceride|cholesterol|omega|crp|vitamin d|diagnos|medication|mg/dL|ng/mL)')
);

create index if not exists notifications_client_idx on notifications (client_id, created_at desc);

create table if not exists support_requests (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references profiles(id) on delete set null,
  subject     text not null,
  body        text not null,
  status      text not null default 'open' check (status in ('open','answered','closed')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  answered_by uuid references profiles(id),
  reply       text
);

-- =====================================================================
-- RLS on everything new, before anything can be written to it.
-- 053 exists because six tables shipped without it.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'pillars','protocol_section_pillars','canonical_rules','rule_reviews',
    'daily_plans','plan_actions','plan_exclusions','weekly_reviews',
    'entitlements','webhook_events','ai_calls','job_runs','notifications',
    'support_requests'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Reference and canon: any signed in person reads, only an admin writes.
do $$
declare t text;
begin
  foreach t in array array['pillars','protocol_section_pillars','canonical_rules'] loop
    execute format('drop policy if exists %I on %I', t||'_read', t);
    execute format('create policy %I on %I for select using (auth.uid() is not null)', t||'_read', t);
    execute format('drop policy if exists %I on %I', t||'_admin', t);
    execute format('create policy %I on %I for all using (current_role_is(''admin'')) with check (current_role_is(''admin''))', t||'_admin', t);
  end loop;
end $$;

-- Participant owned: the member reads their own, staff read all, staff write.
do $$
declare t text;
begin
  foreach t in array array['daily_plans','weekly_reviews','entitlements','support_requests'] loop
    execute format('drop policy if exists %I on %I', t||'_own', t);
    execute format('create policy %I on %I for select using (can_view_client(client_id))', t||'_own', t);
    execute format('drop policy if exists %I on %I', t||'_staff', t);
    execute format('create policy %I on %I for all using (is_staff()) with check (is_staff())', t||'_staff', t);
  end loop;
end $$;

-- Children of a plan, reached through it.
drop policy if exists plan_actions_own on plan_actions;
create policy plan_actions_own on plan_actions for select
  using (exists (select 1 from daily_plans p where p.id = plan_id and can_view_client(p.client_id)));
drop policy if exists plan_actions_member_respond on plan_actions;
create policy plan_actions_member_respond on plan_actions for update
  using (exists (select 1 from daily_plans p where p.id = plan_id and can_view_client(p.client_id)))
  with check (exists (select 1 from daily_plans p where p.id = plan_id and can_view_client(p.client_id)));
drop policy if exists plan_actions_staff on plan_actions;
create policy plan_actions_staff on plan_actions for all using (is_staff()) with check (is_staff());

drop policy if exists plan_exclusions_own on plan_exclusions;
create policy plan_exclusions_own on plan_exclusions for select
  using (exists (select 1 from daily_plans p where p.id = plan_id and can_view_client(p.client_id)));
drop policy if exists plan_exclusions_staff on plan_exclusions;
create policy plan_exclusions_staff on plan_exclusions for all using (is_staff()) with check (is_staff());

-- Staff only, no member read at all.
do $$
declare t text;
begin
  foreach t in array array['rule_reviews','webhook_events','ai_calls','job_runs','notifications'] loop
    execute format('drop policy if exists %I on %I', t||'_staff', t);
    execute format('create policy %I on %I for all using (is_staff()) with check (is_staff())', t||'_staff', t);
  end loop;
end $$;

-- A member may read their own notification log, because "what did you send me"
-- is a fair question and the log holds no health detail by construction.
drop policy if exists notifications_own on notifications;
create policy notifications_own on notifications for select using (can_view_client(client_id));
