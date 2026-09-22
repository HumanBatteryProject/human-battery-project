-- 030: the eight state dimensions, and two separate evidence axes.
--
-- Supersedes the four-subsystem model for participant state. The old
-- `subsystem` enum and the 33 lab_markers mapped to it are NOT touched here:
-- remapping those markers is a scientific decision, not a schema change, and
-- it is on the open list. This migration builds the shape they will move into.
--
-- ---------------------------------------------------------------------
-- Two evidence axes, deliberately not one column
-- ---------------------------------------------------------------------
-- They answer different questions and collapsing them loses the distinction
-- the whole design rests on.
--
--   evidence_tier   how good is the science behind this statement
--                   lives on knowledge passages, citations, claims
--
--   evidence_basis  how did THIS PARTICIPANT'S number get here
--                   lives on state dimensions
--
-- A statement can be `established` science measured by a `frontier` instrument
-- that does not exist yet. That is exactly the case for charge: the physics of
-- mitochondrial membrane potential is not in dispute, and there is still no
-- whole-person clinical measurement of it. One column could not say that.

-- ---------------------------------------------------------------------
-- evidence_tier, rebuilt with six values
-- ---------------------------------------------------------------------
-- Safe to recreate rather than extend: verified before writing that no row
-- anywhere uses `working_model`. circadian_practices (10 rows) uses only
-- `contested` and `established`; knowledge_sources and knowledge_passages are
-- both empty. `working_model` is replaced by `hypothesis` plus the separate
-- is_authors_model flag, because "this is a hypothesis" and "this hypothesis
-- is the author's own" are two facts and the coach needs both.

alter type evidence_tier rename to evidence_tier_old;

create type evidence_tier as enum (
  'established',   -- We know this
  'strong',        -- We are confident
  'emerging',      -- Early evidence
  'contested',     -- Real findings, disputed
  'hypothesis',    -- Dr. Micah's idea, being tested
  'unsupported'    -- never shown to a participant, kept so the coach can decline it
);

-- circadian_practices.tier carries a default, and Postgres will not cast a
-- column out from under one. Drop it, cast, put it back.
alter table circadian_practices alter column tier drop default;
alter table circadian_practices
  alter column tier type evidence_tier using tier::text::evidence_tier;
alter table circadian_practices alter column tier set default 'established'::evidence_tier;
alter table knowledge_sources
  alter column evidence_tier type evidence_tier using evidence_tier::text::evidence_tier;
alter table knowledge_passages
  alter column evidence_tier type evidence_tier using evidence_tier::text::evidence_tier;

drop type evidence_tier_old;

comment on type evidence_tier is
  'How good the science is behind a statement. Client-facing badges, written '
  'at a third to fifth grade reading level: established "We know this", '
  'strong "We are confident", emerging "Early evidence", contested is shown '
  'as disputed with what is disputed named, hypothesis "Dr. Micah''s idea, '
  'being tested". unsupported is NEVER shown to a participant: it is retained '
  'so the coach can recognise a claim and decline it.';

-- Separate from the tier. A hypothesis from the literature and a hypothesis
-- this program invented are both hypotheses, and a participant deserves to
-- know which one they are being told.
alter table knowledge_sources    add column if not exists is_authors_model boolean not null default false;
alter table knowledge_passages   add column if not exists is_authors_model boolean not null default false;
alter table circadian_practices  add column if not exists is_authors_model boolean not null default false;

comment on column knowledge_passages.is_authors_model is
  'True when this passage is the author''s own working model rather than a '
  'position held in the literature. Orthogonal to evidence_tier. The coach '
  'must say so out loud when it stands on one of these.';

-- ---------------------------------------------------------------------
-- The eight dimensions
-- ---------------------------------------------------------------------
create type state_dimension as enum (
  'charge', 'redox',                                    -- frontier
  'flow', 'leak', 'capacity', 'timing', 'structure', 'environment'
);

create type evidence_basis as enum (
  'measured',    -- one direct test or log
  'calculated',  -- a composite of markers
  'frontier'     -- no participant value, and none is coming from current instruments
);

comment on type evidence_basis is
  'How this participant''s number got here. Renders as a quiet label on every '
  'scored tile. Not the same axis as evidence_tier.';

-- ---------------------------------------------------------------------
-- The reference table. One row per dimension, eight rows, fixed.
-- ---------------------------------------------------------------------
create table if not exists state_dimensions (
  dimension     state_dimension primary key,
  is_scored     boolean        not null,
  basis         evidence_basis not null,
  sort_order    smallint       not null,
  label         text           not null,
  -- Frontier copy is fixed and exact. It is not a placeholder and must not be
  -- softened into an empty state.
  body          text           not null,
  instruments   text,

  -- A frontier dimension is never scored and a scored dimension is never
  -- frontier. Enforced so no later migration can quietly create a
  -- half-measured dimension.
  constraint state_dimensions_basis_ck check (
    (is_scored = true  and basis in ('measured','calculated'))
    or
    (is_scored = false and basis = 'frontier')
  )
);

comment on table state_dimensions is
  'The eight dimensions of the Human Battery model. Six are scored and enter '
  'the composite. Two are frontier: they are MODEL STRUCTURE, not missing '
  'patient data, and they carry no score, ever. Not a null standing in for a '
  'measurement that failed to arrive. No surface may present a participant''s '
  'score as incomplete on account of them, and there is no coverage figure '
  'and no "n of 8" anywhere.';

insert into state_dimensions (dimension, is_scored, basis, sort_order, label, body, instruments) values
  -- Also seeded as specified, also does not fit: flow's inputs (VO2, RER) come
  -- from the same single CPET that produces capacity, which is seeded
  -- 'measured'. One instrument, two different bases.
  ('flow',        true,  'calculated', 1, 'Flow',
   'How much oxygen you use, and which fuel you are burning.',
   'Oxygen consumption, respiratory exchange ratio'),
  ('leak',        true,  'calculated', 2, 'Leak',
   'Signs that energy is being wasted as damage instead of doing work.',
   'Oxidative stress markers. See the note on instrument quality.'),
  ('capacity',    true,  'measured',   3, 'Capacity',
   'The most work your system can do when you push it.',
   'VO2 max or equivalent'),
  ('timing',      true,  'calculated', 4, 'Timing',
   'When you sleep, wake and eat, and how steady that is.',
   'Sleep and wake timing, rhythm amplitude, meal timing'),
  ('structure',   true,  'measured',   5, 'Structure',
   'What your cell membranes are built from.',
   'Omega-3 Index, required for every participant'),
  -- Seeded as the amendment specifies. Verification says this does not fit:
  -- environment is a composite of at least four daily_logs fields, and two of
  -- its four named inputs (temperature, activity) have no capture at all.
  -- Reported rather than silently changed. See the open list.
  ('environment', true,  'measured',   6, 'Environment',
   'The light, temperature, movement and meal timing you give your body.',
   'Light exposure and timing, temperature, activity, food timing'),

  ('charge',      false, 'frontier',   7, 'Charge',
   'Mitochondrial membrane potential (ΔΨm). Direct whole-person clinical measurement is not yet routinely available.',
   null),
  ('redox',       false, 'frontier',   8, 'Redox',
   'Mitochondrial redox state. Current biomarkers reveal pieces of the system, but do not provide a direct whole-person mitochondrial redox measurement.',
   null)
on conflict (dimension) do nothing;

alter table state_dimensions enable row level security;
-- Reference data. Everyone signed in reads it; only staff change it.
create policy state_dimensions_read on state_dimensions for select using (true);
create policy state_dimensions_staff on state_dimensions for all
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- Per-participant dimension scores
-- ---------------------------------------------------------------------
-- The composite runs over the scored dimensions and is complete by
-- definition. There is deliberately NO coverage column and NO denominator:
-- the score is not a fraction of the model, and the model extending past
-- current instruments is not a gap in anyone's result.
create table if not exists dimension_scores (
  id            uuid            primary key default gen_random_uuid(),
  client_id     uuid            not null references profiles(id) on delete cascade,
  membership_id uuid            not null references memberships(id) on delete cascade,
  panel_id      uuid            references lab_panels(id) on delete set null,
  draw_point    text            not null check (draw_point in ('day_0','day_90')),

  dimension     state_dimension not null references state_dimensions(dimension),
  score         numeric(5,2)    not null check (score >= 0 and score <= 100),
  basis         evidence_basis  not null check (basis <> 'frontier'),

  -- Which inputs actually fed this number, so a score can be explained rather
  -- than asserted.
  detail        jsonb,

  -- Step 6: instrument and schema versions on every record, timestamps in UTC.
  method_id     uuid            references score_methods(id),
  schema_version text           not null default '030',
  computed_at   timestamptz     not null default now(),

  constraint dimension_scores_once unique (membership_id, draw_point, dimension)
);

-- A frontier dimension can never acquire a score, at the storage layer, not
-- just in the UI. This is the rule the amendment turns on, so it is a
-- constraint and not a convention.
create or replace function dimension_is_scored(d state_dimension)
returns boolean language sql stable as $$
  select is_scored from state_dimensions where dimension = d
$$;

alter table dimension_scores
  add constraint dimension_scores_not_frontier
  check (dimension_is_scored(dimension));

create index if not exists dimension_scores_member_idx
  on dimension_scores (membership_id, draw_point);

alter table dimension_scores enable row level security;
create policy dimension_scores_read on dimension_scores
  for select using (can_view_client(client_id));
create policy dimension_scores_staff on dimension_scores
  for all using (is_staff()) with check (is_staff());

comment on table dimension_scores is
  'One row per participant, per draw point, per SCORED dimension. Six rows '
  'when complete. Frontier dimensions never appear here and their absence is '
  'not missing data: dimension_scores_not_frontier enforces it at the '
  'storage layer. Never compute a coverage ratio from this table.';
