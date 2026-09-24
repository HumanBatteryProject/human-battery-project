-- 032: every marker gets a role. Nothing is orphaned.
--
-- "Unmapped" reads as an oversight in a schema and invites a later hand to
-- fix it by forcing a mapping. A marker that belongs to no dimension is not a
-- gap: an out-of-range ALT matters to the participant whether or not it feeds
-- a score. Naming that state stops someone repairing it.
--
--   scored     enters a dimension and the composite
--   referable  a clinically meaningful result returned to the person and
--              flagged when out of range, belonging to no dimension
--
-- Nine of the referable markers only ever belonged to `leak`, which became
-- frontier in 031. They are not homeless, they are not dimensional.

create type marker_role as enum ('scored', 'referable');

alter table lab_markers add column if not exists role marker_role;

comment on column lab_markers.role is
  'scored: feeds a dimension and the composite. referable: returned to the '
  'participant and flagged out of range, belonging to no dimension. A '
  'referable marker is not an unmapped one and must not be "fixed" by '
  'assigning it a dimension.';

-- ---------------------------------------------------------------------
-- Already dimensional, from 031
-- ---------------------------------------------------------------------
update lab_markers set role = 'scored' where dimension is not null;

-- ---------------------------------------------------------------------
-- Referable, decided
-- ---------------------------------------------------------------------
-- The nine whose only honest home was leak, plus albumin, B12 and folate.
update lab_markers set role = 'referable' where slug in (
  'hs-crp', 'wbc', 'kyn-trp-ratio', 'alt', 'ast', 'ggt',
  'homocysteine', 'uric-acid', 'albumin', 'vitamin-b12', 'folate');

-- The hormone cluster. Capacity is reserve above resting demand and VO2max
-- measures it directly. Five hormonal markers would have diluted a clean
-- measured dimension into a composite and flipped its basis. Endocrine status
-- correlates with plenty and measures capacity specifically not at all.
update lab_markers set role = 'referable' where slug in (
  'dhea-s', 'testosterone-total', 'testosterone-free', 'shbg', 'igf-1');

-- vitamin-d is referable, NOT environment.
--
-- Two reasons, and the second is the one that matters. The protocol
-- recommends D3, so serum vitamin D measures supplementation adherence at
-- least as much as sun exposure: a participant on capsules reads as well-lit
-- while living indoors.
--
-- The deeper reason is the book's own argument in Chapter 7: the large
-- vitamin D supplementation trials underperformed partly because they tested
-- a molecule rather than sunlight, and sunlight does several things of which
-- vitamin D is only one. Using serum vitamin D as the proxy for light
-- exposure would commit precisely that error. The program cannot make that
-- argument in print and then rely on it in the schema.
--
-- Environment is measured by what is actually logged: morning light timing
-- and duration, first and last meal. A blood marker a capsule can move is not
-- an environmental exposure measure.
update lab_markers set role = 'referable' where slug = 'vitamin-d';

-- ---------------------------------------------------------------------
-- Nine markers deliberately left with no role yet
-- ---------------------------------------------------------------------
-- aa-epa-ratio, tsh, free-t3, free-t4, magnesium-rbc, hdl, cortisol-am,
-- ferritin, iron-saturation were proposed in
-- docs/HBP-Marker-Dimension-Mapping-PROPOSAL.md and have not been adjudicated.
-- Leaving role null is the honest state: not referable, not yet scored, and
-- awaiting a decision. `role` is therefore nullable for now and becomes NOT
-- NULL in the migration that applies the approved mapping.

create index if not exists lab_markers_role_idx on lab_markers (role);

-- A scored marker must have a dimension, and a referable one must not. This
-- is the rule the role split exists to express, so it is a constraint.
alter table lab_markers
  add constraint lab_markers_role_dimension_ck check (
    (role = 'scored'    and dimension is not null)
    or (role = 'referable' and dimension is null)
    or role is null
  );
