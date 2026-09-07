-- =====================================================================
-- 013  Research-informed additions
--
--   * Omega-3 Index, AA:EPA, kynurenine:tryptophan markers
--   * Sex-specific optimal bands (testosterone, DHEA-S, ferritin)
--   * Study arms, for the staggered waitlist-control design
--   * Evidence tier on every protocol element, so the three-tier
--     discipline is enforced by the data model rather than by memory
-- =====================================================================

-- ---------------------------------------------------------------------
-- Evidence tier. Applied to practices, foods and content so that any
-- surface rendering them can label the claim honestly.
-- ---------------------------------------------------------------------
create type evidence_tier as enum (
  'established',   -- citable, defensible to a reviewer
  'contested',     -- credible, disputed; state as hypothesis with critics
  'working_model'  -- speculative; drives design, never stated as fact
);

alter table circadian_practices
  add column if not exists tier evidence_tier not null default 'established',
  add column if not exists rationale_established text,
  add column if not exists rationale_model       text;

comment on column circadian_practices.rationale_established is
  'The ordinary, defensible justification. Safe for the website and consent form.';
comment on column circadian_practices.rationale_model is
  'The working-model rationale. Protocol manual and book only — never marketing.';

-- ---------------------------------------------------------------------
-- Study arms. The single most valuable design upgrade available:
-- half the cohort starts 30 days later and logs during the wait, which
-- controls for seasonality, secular trend and regression to the mean.
-- ---------------------------------------------------------------------
create type study_arm as enum ('immediate', 'delayed', 'not_applicable');

alter table memberships
  add column if not exists arm study_arm not null default 'not_applicable',
  add column if not exists baseline_start date;

comment on column memberships.baseline_start is
  'Delayed arm only: when observation-period logging began, before day_zero.';

create index if not exists memberships_arm_idx on memberships (cohort_id, arm);

alter table cohorts
  add column if not exists design text
    check (design in ('single_arm','staggered_waitlist')),
  add column if not exists registration_url text;

comment on column cohorts.registration_url is
  'Prospective registration record (OSF or ClinicalTrials.gov). Required before '
  'data collection if results are ever to be published.';

-- ---------------------------------------------------------------------
-- Sex-specific reference and optimal bands.
--
-- Testosterone, free testosterone, DHEA-S and ferritin all need
-- different bands for female clients. Without this the panel silently
-- scores women against male ranges.
-- ---------------------------------------------------------------------
create table marker_ranges (
  id            uuid primary key default gen_random_uuid(),
  marker_id     uuid        not null references lab_markers(id) on delete cascade,
  sex           sex_at_birth not null,
  age_min       smallint,
  age_max       smallint,
  ref_low       numeric(12,4),
  ref_high      numeric(12,4),
  optimal_low   numeric(12,4),
  optimal_high  numeric(12,4),
  note          text,
  created_at    timestamptz not null default now(),
  unique (marker_id, sex, age_min, age_max)
);

create index marker_ranges_marker_idx on marker_ranges (marker_id, sex);

alter table marker_ranges enable row level security;
create policy marker_ranges_read on marker_ranges
  for select using (auth.uid() is not null);
create policy marker_ranges_admin on marker_ranges for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- Resolve the band for a client, falling back to the marker default.
create or replace function marker_band(p_marker uuid, p_sex sex_at_birth)
returns table (ref_low numeric, ref_high numeric, optimal_low numeric, optimal_high numeric)
language sql
stable
as $$
  select
    coalesce(r.ref_low,      m.ref_low),
    coalesce(r.ref_high,     m.ref_high),
    coalesce(r.optimal_low,  m.optimal_low),
    coalesce(r.optimal_high, m.optimal_high)
  from lab_markers m
  left join marker_ranges r on r.marker_id = m.id and r.sex = p_sex
  where m.id = p_marker;
$$;

-- ---------------------------------------------------------------------
-- New markers
-- ---------------------------------------------------------------------
insert into lab_markers
  (slug, name, loinc_code, unit, subsystem, ref_low, ref_high,
   better_direction, optimal_low, optimal_high, sort_order) values
  -- Reserve. The most responsive marker on the panel: red cell turnover
  -- is ~4 months, so a day 0 / day 90 interval captures most of the
  -- achievable change. Harris & von Schacky bands: <4% high risk, >8%
  -- desirable.
  ('omega3-index', 'Omega-3 Index (EPA+DHA, RBC)', null, '%', 'reserve',
   4, 12, 1, 8, 12, 5),

  -- Drain. Less validated than the index itself — exploratory.
  ('aa-epa-ratio', 'Arachidonic acid : EPA ratio', null, 'ratio', 'drain',
   null, 10, -1, 1.5, 3.0, 15),

  -- Drain. Validated marker of inflammation-driven tryptophan
  -- degradation via IDO. Independently defensible on immunology grounds.
  ('kyn-trp-ratio', 'Kynurenine : tryptophan ratio', null, 'umol/mmol', 'drain',
   null, 60, -1, 20, 35, 25)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Female bands for the sex-dependent markers
-- ---------------------------------------------------------------------
insert into marker_ranges (marker_id, sex, ref_low, ref_high, optimal_low, optimal_high, note)
select m.id, 'female', v.rl, v.rh, v.ol, v.oh, v.note
from (values
  ('testosterone-total',   15,    70,   30,    60,   'Female reference range, ng/dL'),
  ('testosterone-free',    0.1,   6.4,  1.5,    5.0, 'Female reference range, pg/mL'),
  ('dhea-s',              35,   430,  150,   350,   'Female reference range, ug/dL'),
  ('ferritin',            15,   150,   40,   100,   'Female range; lower ceiling reflects menstrual iron loss'),
  ('shbg',                20,   130,   40,    90,   'Female reference range, nmol/L')
) as v(slug, rl, rh, ol, oh, note)
join lab_markers m on m.slug = v.slug
on conflict (marker_id, sex, age_min, age_max) do nothing;

-- Male bands recorded explicitly so nothing relies on a silent default.
insert into marker_ranges (marker_id, sex, ref_low, ref_high, optimal_low, optimal_high, note)
select m.id, 'male', m.ref_low, m.ref_high, m.optimal_low, m.optimal_high,
       'Male band; same as the marker default'
from lab_markers m
where m.slug in ('testosterone-total','testosterone-free','dhea-s','ferritin','shbg')
on conflict (marker_id, sex, age_min, age_max) do nothing;

-- ---------------------------------------------------------------------
-- Tryptophan tracking in the daily log.
--
-- Three independent lines — Kurian's superradiance, the Kalra/Scholes
-- microtubule exciton work, and the delayed-luminescence findings — all
-- centre on tryptophan in the same structures. Not proof of anything.
-- Worth having the variable, since kyn:trp is now on the panel.
-- ---------------------------------------------------------------------
alter table daily_logs
  add column if not exists tryptophan_sources smallint
    check (tryptophan_sources between 0 and 10);

comment on column daily_logs.tryptophan_sources is
  'Count of tryptophan-dense foods logged today. Pairs with the kyn:trp panel marker.';

alter table foods
  add column if not exists is_tryptophan_source boolean not null default false;

update foods set is_tryptophan_source = true
where slug in ('eggs-pastured','salmon-wild','beef-grassfed','chicken-thigh',
               'sardines','liver-beef','walnuts','lentils','cheese-aged');

-- ---------------------------------------------------------------------
-- Tier and rationale on the existing practices
-- ---------------------------------------------------------------------
update circadian_practices set
  tier = 'established',
  rationale_established = 'Light entrains circadian timing through melanopsin-expressing retinal ganglion cells, which set the downstream endocrine and metabolic rhythm.',
  rationale_model = 'Treated as the charging input: photic signalling precedes and primes fuel handling, so light comes before food.'
where slug = 'morning-light';

update circadian_practices set
  tier = 'contested',
  rationale_established = 'Modest UVB exposure drives vitamin D synthesis; UVA mobilises cutaneous nitric oxide stores and lowers blood pressure independently of vitamin D.',
  rationale_model = 'Sun exposure as direct energy input to the system, not merely a vitamin precursor. Scaled to skin type; never to burning.'
where slug = 'midday-sun';

update circadian_practices set
  tier = 'contested',
  rationale_established = 'Cold exposure produces catecholamine release and sympathetic activation. Best-controlled trial found no advantage over an active control.',
  rationale_model = 'Hormetic load that increases capacity rather than spending it.'
where slug = 'cold-exposure';

update circadian_practices set tier = 'established' where tier is null;
