-- 043: internal members, and the location fields the brief and the seasonal
-- work both read.
--
-- An internal member is a real account with real data that must never appear
-- in a number anyone reasons about. Not billed, not counted in cohort
-- statistics, not counted in the proposal queue. The flag lives on the
-- membership rather than the profile because the same person could in
-- principle be a real participant later, and the distinction belongs to the
-- cycle, not to the human.

alter table memberships
  add column if not exists is_internal boolean not null default false;

comment on column memberships.is_internal is
  'True for staff and test memberships. Never billed. EXCLUDED from every '
  'cohort statistic and from proposal-queue counts. Any query that reports a '
  'number about participants must filter this out, and the views below are '
  'the supported way to do it so the filter cannot be forgotten.';

create index if not exists memberships_internal_idx on memberships (is_internal)
  where is_internal;

-- The supported surface for anything that counts participants. Reaching past
-- these is how an internal row ends up in a statistic.
create or replace view participant_memberships as
  select * from memberships where is_internal = false;

comment on view participant_memberships is
  'Every membership that is a real participant. Use this, not memberships, '
  'for any count, average or cohort statistic.';

create or replace view participant_proposals as
  select p.* from proposals p
    join memberships m on m.id = p.membership_id
   where m.is_internal = false;

-- Location. ZIP or postal code plus country, and the three things derived from
-- it. NO STREET ADDRESS: the program has no use for one and storing it would
-- be collecting a more sensitive thing than it needs.
alter table profiles
  add column if not exists postal_code text,
  add column if not exists country     text,
  add column if not exists latitude    numeric(6,3),
  add column if not exists hemisphere  text check (hemisphere in ('N','S'));

comment on column profiles.postal_code is
  'ZIP for US, postal code elsewhere. Deliberately coarse: the program needs '
  'a region and a latitude, not an address, so no street address is stored.';
comment on column profiles.latitude is
  'Derived from the postal code at intake. The morning brief, the light '
  'timing and the winter vitamin D sentence all read it. Season is computed '
  'from latitude and date and is hemisphere aware, which is why hemisphere is '
  'stored rather than inferred from the sign at every call site.';

-- Test data must be visible AS test data wherever it appears.
alter table lab_results add column if not exists is_test boolean not null default false;
comment on column lab_results.is_test is
  'Synthetic value. Must be labeled TEST DATA on every screen that shows it. '
  'A synthetic number that looks real is worse than no number.';
