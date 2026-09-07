-- =====================================================================
-- 015  Functional testing — oxidative throughput
--
-- Charge previously meant fuel handling, measured entirely from blood.
-- That is fuel DELIVERY, not charge generation. This migration adds the
-- reaction itself: oxygen consumed, CO2 produced, work sustained before
-- anaerobic fallback.
--
-- The membrane potential cannot be measured in a living person. The
-- throughput of the reaction that builds it can, and it happens to be
-- the strongest mortality predictor available (Mandsager, JAMA Netw
-- Open 2018, n=122,007).
-- =====================================================================

create type fitness_test_method as enum (
  'lab_gas_exchange',   -- true VO2max with breath-by-breath analysis
  'submaximal_est',     -- step or bike protocol, estimated
  'wearable_est',       -- watch estimate; tracking only, not comparable across people
  'field_test'          -- Cooper, 1-mile walk, etc.
);

create table functional_tests (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid        not null references profiles(id) on delete cascade,
  membership_id   uuid        references memberships(id) on delete set null,
  draw_point      draw_point  not null,          -- aligned with the blood timepoints
  tested_on       date        not null,
  method          fitness_test_method not null,

  -- Oxidative ceiling. The terminal step of the electron transport chain,
  -- measured whole-body.
  vo2max          numeric(5,2) check (vo2max between 5 and 100),   -- mL/kg/min
  mets            numeric(5,2) check (mets between 1 and 30),

  -- The two outputs of the reaction: CO2 produced over O2 consumed.
  -- ~0.70 = pure fat oxidation, ~1.00 = pure carbohydrate.
  rer_rest        numeric(4,3) check (rer_rest between 0.60 and 1.30),
  rer_fasted      numeric(4,3) check (rer_fasted between 0.60 and 1.30),
  rer_fed         numeric(4,3) check (rer_fed between 0.60 and 1.30),

  -- Where oxidative capacity runs out and pyruvate goes to lactate
  -- instead of into the mitochondrion.
  lactate_rest_mmol      numeric(4,2) check (lactate_rest_mmol between 0 and 30),
  lactate_fixed_load_mmol numeric(4,2) check (lactate_fixed_load_mmol between 0 and 30),
  fixed_load_watts       integer,

  hr_max          integer check (hr_max between 60 and 230),
  hr_recovery_60s integer check (hr_recovery_60s between 0 and 120),

  lab_name        text,
  notes           text,
  entered_by      uuid        references profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, draw_point, tested_on)
);

create index functional_tests_client_idx on functional_tests (client_id, tested_on desc);

create trigger functional_tests_updated before update on functional_tests
  for each row execute function set_updated_at();

comment on table functional_tests is
  'Oxidative throughput. Charge layer one — the reaction. The blood markers '
  'in Charge are layer two: whether fuel reaches the machinery at all.';

comment on column functional_tests.rer_fasted is
  'Metabolic flexibility is the fasted-to-fed RER shift. A system that cannot '
  'switch fuels is a system with limited mitochondrial adaptability.';

comment on column functional_tests.method is
  'wearable_est is valid for within-person tracking only. Never compare a '
  'wearable estimate against a lab value or across clients.';

alter table functional_tests enable row level security;

create policy functional_tests_read on functional_tests
  for select using (can_view_client(client_id));
create policy functional_tests_write on functional_tests
  for all using (client_id = auth.uid() or is_staff())
  with check (client_id = auth.uid() or is_staff());

-- ---------------------------------------------------------------------
-- Metabolic flexibility, derived
-- ---------------------------------------------------------------------
create or replace function metabolic_flexibility(p_test uuid)
returns numeric
language sql
stable
as $$
  select round(rer_fed - rer_fasted, 3)
  from functional_tests
  where id = p_test and rer_fed is not null and rer_fasted is not null;
$$;

comment on function metabolic_flexibility is
  'RER shift from fasted to fed. Larger positive shift = better fuel switching. '
  'A flat response suggests the system is stuck on one substrate.';

-- ---------------------------------------------------------------------
-- Day 0 vs day 90 on the functional side
-- ---------------------------------------------------------------------
create or replace view functional_progress as
select
  f0.client_id,
  f0.vo2max                      as day_0_vo2max,
  f90.vo2max                     as day_90_vo2max,
  round(f90.vo2max - f0.vo2max, 2) as vo2max_delta,
  f0.rer_fasted                  as day_0_rer_fasted,
  f90.rer_fasted                 as day_90_rer_fasted,
  f0.lactate_fixed_load_mmol     as day_0_lactate,
  f90.lactate_fixed_load_mmol    as day_90_lactate,
  round(f0.lactate_fixed_load_mmol - f90.lactate_fixed_load_mmol, 2) as lactate_improvement,
  f0.hr_recovery_60s             as day_0_hr_recovery,
  f90.hr_recovery_60s            as day_90_hr_recovery,
  f0.method                      as day_0_method,
  f90.method                     as day_90_method,
  -- A delta is only meaningful if both tests used the same method.
  (f0.method = f90.method)       as methods_comparable
from functional_tests f0
join functional_tests f90
  on f90.client_id = f0.client_id and f90.draw_point = 'day_90'
where f0.draw_point = 'day_0';

comment on view functional_progress is
  'Functional deltas. methods_comparable is false when the two timepoints used '
  'different testing methods — in that case the delta is not interpretable.';

-- ---------------------------------------------------------------------
-- Charge weighting note
--
-- The Battery Score still computes from blood markers only, because
-- functional testing will not be universal in early cohorts. When
-- coverage is high enough, a bs-v2 method can fold VO2max into Charge.
-- Recording the intent here so the reasoning survives.
-- ---------------------------------------------------------------------
insert into score_methods (version, description, weights) values
  ('bs-v2-draft',
   'DRAFT, not in use. Extends Charge to include oxidative throughput '
   '(VO2max, RER, lactate) alongside the fuel-delivery blood markers. Held '
   'until functional testing coverage is high enough that scoring it does not '
   'penalise clients who did not test. Do not activate mid-cohort — changing '
   'the method between day 0 and day 90 invalidates the comparison.',
   '{"charge":0.30,"drain":0.25,"output":0.25,"reserve":0.20}'::jsonb)
on conflict (version) do nothing;

update score_methods set retired_at = now() where version = 'bs-v2-draft';
