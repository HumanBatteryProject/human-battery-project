-- 036: every coach turn is logged with the passages it retrieved and the tier
-- it rendered, so a wrong answer is traceable to a passage.
--
-- Brief 06 section 4 rule 7. Without this a bad answer is unfalsifiable: you
-- cannot tell a retrieval failure from a generation failure from a tagging
-- failure, and all three have different fixes.

create table if not exists coach_turns (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references profiles(id) on delete cascade,
  asked_at      timestamptz not null default now(),
  question      text not null,
  route         text not null check (route in ('coach','prescriber','urgent','declined')),
  passage_ids   uuid[] not null default '{}',
  tiers         text[] not null default '{}',
  top_score     real,
  reply         text,
  model         text,
  run_id        uuid,
  created_at    timestamptz not null default now()
);

comment on table coach_turns is
  'One row per coach turn. passage_ids and tiers are what the reply was built '
  'from, so a wrong answer is traced to a passage rather than guessed at. '
  'route=declined means retrieval returned nothing above the floor and the '
  'coach said so instead of improvising.';

create index if not exists coach_turns_client_idx on coach_turns (client_id, asked_at desc);
create index if not exists coach_turns_route_idx  on coach_turns (route);

alter table coach_turns enable row level security;

drop policy if exists coach_turns_own on coach_turns;
create policy coach_turns_own on coach_turns
  for select using (client_id = auth.uid() or is_staff());

drop policy if exists coach_turns_admin on coach_turns;
create policy coach_turns_admin on coach_turns
  for all using (current_role_is('admin'::app_role));
