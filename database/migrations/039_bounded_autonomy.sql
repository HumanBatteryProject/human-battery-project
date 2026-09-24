-- 039: bounded autonomy. The trend agent applies its own changes inside
-- published bounds, and anything outside them goes to a review queue.
--
-- This supersedes the approve-everything queue in brief 06 section 7. The
-- reason the bounds are a TABLE and not constants in the agent is that the
-- bound is the safety property. A bound living in the agent's own code is a
-- bound the agent's next revision can widen without anyone noticing; a bound
-- in the database with the agent reading it is one a human has to change on
-- purpose.

create table if not exists protocol_parameters (
  id             uuid primary key default gen_random_uuid(),
  param          text not null,
  tier           program_tier not null,
  unit           text not null,
  min_value      numeric not null,
  max_value      numeric not null,
  weekly_step    numeric not null,
  intervention   text not null,
  note           text,
  unique (param, tier)
);

comment on table protocol_parameters is
  'The published range and the weekly step for every parameter the trend agent '
  'may move, per tier. A change outside min..max, or larger than weekly_step, '
  'is never auto-applied. `intervention` is what the parameter belongs to, so '
  'a screening flag on that intervention can block a change to it.';

create table if not exists proposals (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references profiles(id) on delete cascade,
  membership_id      uuid,
  created_at         timestamptz not null default now(),
  param              text not null,
  from_value         numeric,
  to_value           numeric not null,
  rationale          text not null,
  passage_ids        uuid[] not null default '{}',
  evidence_tier      evidence_tier,
  counter_evidence   uuid references knowledge_passages(id),
  status             text not null default 'queued'
                     check (status in ('applied','queued','declined','reverted')),
  permitted_by       text,
  blocked_by         text,
  applied_at         timestamptz,
  declined_at        timestamptz,
  declined_by        text check (declined_by in ('member','admin')),
  reverted_at        timestamptz,
  reverted_by        uuid,
  weak_justification boolean not null default false
);

comment on column proposals.permitted_by is
  'The rule that allowed an auto-apply, recorded so an applied change can be '
  'explained afterwards rather than reconstructed.';
comment on column proposals.blocked_by is
  'Which of the five bounds sent this to the queue instead of applying it. '
  'Null when it applied.';
comment on column proposals.weak_justification is
  'True when the justifying tier is below "Early evidence". Written either '
  'way, flagged so the queue shows it as weak rather than hiding it.';
comment on column proposals.counter_evidence is
  'The passage that argues against this change, where one exists. The queue '
  'shows both sides. This is the minimal build of the counter-evidence schema.';

create index if not exists proposals_open_idx on proposals (client_id, status);
create index if not exists proposals_queue_idx on proposals (status, created_at desc)
  where status = 'queued';

alter table proposals enable row level security;
drop policy if exists proposals_own on proposals;
create policy proposals_own on proposals
  for select using (client_id = auth.uid() or is_staff());
drop policy if exists proposals_member_decline on proposals;
create policy proposals_member_decline on proposals
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists proposals_admin on proposals;
create policy proposals_admin on proposals
  for all using (current_role_is('admin'::app_role));
