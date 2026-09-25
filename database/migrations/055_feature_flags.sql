-- 055: feature flags, and the kill switch the master prompt requires.
--
-- The audit found no flag mechanism of any kind: AI_GENERATION_ENABLED appeared
-- zero times in the repository, so master prompt E4's "ability to pause all AI
-- recommendations immediately" and D10's emergency suspension did not exist, and
-- the rule only fallback had nothing to fall back from.
--
-- WHY A TABLE AND NOT A CONSTANT. A kill switch that needs a deploy is not a
-- kill switch. The point of it is the moment something is going wrong, and that
-- is the worst moment to be waiting on a build.

create table if not exists feature_flags (
  key         text primary key,
  enabled     boolean not null,
  description text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references profiles(id)
);

alter table feature_flags enable row level security;

-- Any signed in person may READ a flag, because the surfaces they see depend on
-- it. Only an admin may change one.
drop policy if exists flags_read on feature_flags;
create policy flags_read on feature_flags for select using (auth.uid() is not null);
drop policy if exists flags_admin on feature_flags;
create policy flags_admin on feature_flags for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

insert into feature_flags (key, enabled, description) values

  ('AI_GENERATION_ENABLED', true,
   'Master prompt E4. When false EVERY model call is refused at the single choke '
   'point in _agent.js ask(), the morning brief assembles from rules alone with '
   'no connective prose, the coach declines with its standard message, and the '
   'dashboard renders unchanged. Turn this off first when anything looks wrong.'),

  ('BATTERY_SCORE_ENABLED', false,
   'Master prompt C4. The overall Battery Score is hidden until the owner '
   'confirms a formula. Default false is the specification, not a placeholder: '
   'the only formula that exists is over the four retired subsystems and has '
   'never computed a row. Dimension summaries and trends do not depend on this.'),

  ('WEARABLES_ENABLED', false,
   'Master prompt F2. No wearable integration exists, so there must be no '
   '"connect a device" control. False until a real token pulls real data.')

on conflict (key) do nothing;

comment on table feature_flags is
  'Operating switches a human can flip without a deploy. A kill switch that '
  'needs a build is not a kill switch.';
