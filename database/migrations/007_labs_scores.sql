-- =====================================================================
-- 007  Labs and the Battery Score
--
-- The PDF is the source document. The analysable truth lives in
-- lab_results as one row per marker. Storing only the PDF would make the
-- day 0 vs day 90 comparison a manual read and the research thesis
-- impossible.
-- =====================================================================

create table lab_panels (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid        not null references profiles(id) on delete cascade,
  membership_id  uuid        references memberships(id) on delete set null,
  draw_point     draw_point  not null,
  drawn_on       date        not null,
  reported_on    date,
  lab_name       text,
  requisition_ref text,
  -- Object storage path. Private bucket, signed URLs only.
  document_path  text,
  -- Set when a coach has reviewed and, where needed, referred out.
  reviewed_at    timestamptz,
  reviewed_by    uuid        references profiles(id) on delete set null,
  -- Written referral protocol: any out-of-range result gets referred to a
  -- physician. This records that it happened.
  referral_made  boolean     not null default false,
  referral_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (client_id, draw_point, drawn_on)
);

create index lab_panels_client_idx on lab_panels (client_id, drawn_on desc);

create trigger lab_panels_updated before update on lab_panels
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- lab_results — one row per marker per panel
-- ---------------------------------------------------------------------
create table lab_results (
  id            uuid primary key default gen_random_uuid(),
  panel_id      uuid        not null references lab_panels(id) on delete cascade,
  marker_id     uuid        not null references lab_markers(id) on delete restrict,
  value         numeric(12,4) not null,
  unit          text        not null,
  -- The range printed on this specific report, which can differ by lab.
  ref_low       numeric(12,4),
  ref_high      numeric(12,4),
  flag          result_flag,
  entered_by    uuid        references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (panel_id, marker_id)
);

create index lab_results_marker_idx on lab_results (marker_id);

-- ---------------------------------------------------------------------
-- Battery Score
--
-- A composite index built for this program. Explicitly NOT a diagnostic
-- tool, not validated for clinical use, and never presented to a
-- clinician as a medical measurement. The methodology is versioned so a
-- score computed in 2026 stays interpretable in 2031.
-- ---------------------------------------------------------------------
create table score_methods (
  id            uuid primary key default gen_random_uuid(),
  version       text        not null unique,        -- 'bs-v1'
  description   text        not null,
  -- {"charge":0.30,"drain":0.25,"output":0.25,"reserve":0.20}
  weights       jsonb       not null,
  effective_from timestamptz not null default now(),
  retired_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table battery_scores (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid        not null references profiles(id) on delete cascade,
  panel_id      uuid        not null references lab_panels(id) on delete cascade,
  method_id     uuid        not null references score_methods(id) on delete restrict,
  charge_score  numeric(5,2) check (charge_score between 0 and 100),
  drain_score   numeric(5,2) check (drain_score between 0 and 100),
  output_score  numeric(5,2) check (output_score between 0 and 100),
  reserve_score numeric(5,2) check (reserve_score between 0 and 100),
  composite     numeric(5,2) check (composite between 0 and 100),
  -- Which markers were present and how each contributed, kept so a score
  -- can be explained line by line to the client.
  detail        jsonb,
  computed_at   timestamptz not null default now(),
  unique (panel_id, method_id)
);

create index battery_scores_client_idx on battery_scores (client_id, computed_at desc);

comment on table battery_scores is
  'Composite index for tracking change across 90 days. Not diagnostic. '
  'Never interpret an individual marker as evidence of a condition.';

-- ---------------------------------------------------------------------
-- Convenience view: day 0 vs day 90, per marker, with direction of change
-- ---------------------------------------------------------------------
create or replace view marker_deltas as
select
  p0.client_id,
  m.slug                          as marker_slug,
  m.name                          as marker_name,
  m.subsystem,
  m.unit,
  r0.value                        as day_0_value,
  r90.value                       as day_90_value,
  r90.value - r0.value            as delta,
  case
    when r0.value = 0 then null
    else round(((r90.value - r0.value) / abs(r0.value)) * 100, 1)
  end                             as delta_pct,
  case
    when m.better_direction = 0 then null
    when sign(r90.value - r0.value)::smallint = m.better_direction then true
    when r90.value = r0.value then null
    else false
  end                             as improved
from lab_panels p0
join lab_results r0    on r0.panel_id = p0.id
join lab_markers m     on m.id = r0.marker_id
join lab_panels p90    on p90.client_id = p0.client_id and p90.draw_point = 'day_90'
join lab_results r90   on r90.panel_id = p90.id and r90.marker_id = m.id
where p0.draw_point = 'day_0';

comment on view marker_deltas is
  'Day 0 vs day 90 per marker. Powers the client comparison view.';
