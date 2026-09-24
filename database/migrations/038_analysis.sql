-- 038: what the analysis agent needs to turn labs into coaching honestly.
--
-- Three things the schema could not express before:
--   1. A value that cannot enter. An unknown marker name or a missing unit is
--      HELD, not dropped and not guessed into the nearest marker. Dropping it
--      loses a real measurement silently; guessing puts someone else's number
--      in a member's score.
--   2. What a unit conversion actually did. A converted value with no record
--      of the conversion is unauditable, and a wrong factor looks exactly like
--      a real result.
--   3. Coverage. A dimension computed from two of its three markers is not the
--      same number as one computed from three, and the member is entitled to
--      know which they are looking at.

create table if not exists lab_results_held (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references profiles(id) on delete cascade,
  panel_id      uuid,
  reported_name text not null,
  reported_value text,
  reported_unit text,
  reason        text not null check (reason in
                  ('unknown_marker','missing_unit','unconvertible_unit','implausible_value')),
  held_at       timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_to   uuid references lab_markers(id)
);

comment on table lab_results_held is
  'A reported value that could not enter under a canonical Chapter 21 marker '
  'name. Held, never dropped and never guessed into the nearest marker: '
  'dropping loses a real measurement silently and guessing puts one person''s '
  'number into another marker''s score. Surfaced in the admin results screen.';

create index if not exists lab_results_held_open_idx
  on lab_results_held (client_id) where resolved_at is null;

alter table lab_results
  add column if not exists value_raw      numeric,
  add column if not exists unit_raw       text,
  add column if not exists conversion     text;

comment on column lab_results.conversion is
  'The conversion applied on ingest, as a readable statement, e.g. '
  '"mmol/L to mg/dL, x 18.0182". Null means the unit arrived canonical. A '
  'converted value with no record of the conversion is unauditable and a wrong '
  'factor is indistinguishable from a real result.';

alter table dimension_scores
  add column if not exists markers_expected smallint,
  add column if not exists markers_present  smallint;

comment on column dimension_scores.markers_present is
  'How many of the dimension''s markers this score was actually computed from. '
  'A missing marker is MISSING, never zero: zero is a value and would drag the '
  'score down as though the member had tested badly rather than not at all.';

-- Every marker needs to say what it is drawn from, for the panel definitions.
alter table lab_markers
  add column if not exists specimen text
    check (specimen in ('blood','dried_blood_spot','functional','logged','derived'));

comment on column lab_markers.specimen is
  'What the value is obtained from. Panels are built from this: a functional '
  'test or a logged behaviour cannot appear on a blood panel.';
