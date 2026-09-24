-- 031: leak moves to frontier. Five scored dimensions. Old charge becomes flow.
--
-- ---------------------------------------------------------------------
-- Why leak moved
-- ---------------------------------------------------------------------
-- The panel was searched for an oxidative stress instrument and has none: no
-- 8-OHdG, no F2-isoprostanes, no GSH/GSSG, no MDA, no TBARS. The nearest
-- markers, hs-CRP, GGT, uric acid and homocysteine, are inflammation and liver
-- markers. Scoring leak from those would put an inflammation proxy on the page
-- wearing the label of oxidative damage.
--
-- Proton leak is measured in isolated cells by Seahorse and has no validated
-- whole-person equivalent. That is the same situation as charge and redox, so
-- it belongs with them, not in a scored dimension with a weak instrument.
--
-- The composite now runs over five. It is still complete by definition. There
-- is no coverage figure and no "n of 8" or "n of 5" anywhere.

update state_dimensions
   set is_scored = false,
       basis     = 'frontier',
       body      = 'Proton leak and reactive oxygen signalling. Measurable in isolated cells, with no validated whole-person clinical equivalent. Inflammatory markers are not a substitute and this model does not treat them as one.',
       instruments = null,
       sort_order = 9
 where dimension = 'leak';

-- Frontier sits below the scored grid, in model order.
update state_dimensions set sort_order = 1 where dimension = 'flow';
update state_dimensions set sort_order = 2 where dimension = 'capacity';
update state_dimensions set sort_order = 3 where dimension = 'timing';
update state_dimensions set sort_order = 4 where dimension = 'structure';
update state_dimensions set sort_order = 5 where dimension = 'environment';
update state_dimensions set sort_order = 6 where dimension = 'charge';
update state_dimensions set sort_order = 7 where dimension = 'redox';
update state_dimensions set sort_order = 8 where dimension = 'leak';

-- ---------------------------------------------------------------------
-- Definitions narrowed to what is actually captured
-- ---------------------------------------------------------------------
-- A named input with no instrument behind it is a promise the schema cannot
-- keep. Temperature has no column anywhere. Activity exists only in
-- log_exercises, which is a different thing from environmental movement and is
-- not surfaced here. Both come out of the definition until there is capture.
update state_dimensions
   set basis       = 'calculated',
       instruments = 'Morning light timing and duration, first meal time, last meal time',
       body        = 'The light you get in the morning, and when you eat.'
 where dimension = 'environment';

-- "Rhythm amplitude" came out. A single morning cortisol draw yields no
-- amplitude, and implying otherwise would be a claim the panel cannot support.
update state_dimensions
   set instruments = 'Logged sleep and wake times, their regularity, and meal timing',
       body        = 'When you sleep, wake and eat, and how steady that is.'
 where dimension = 'timing';

-- Flow keeps two input groups: the CPET respiratory exchange ratios, and the
-- glucose regulation panel below. That is why it is calculated rather than
-- measured. Capacity stays measured: VO2max is taken directly. One test can
-- legitimately feed two dimensions on different bases, because the basis
-- describes how the value is derived, not how many instruments touched it.
update state_dimensions
   set instruments = 'Respiratory exchange ratio and oxygen consumption, with the glucose regulation panel'
 where dimension = 'flow';

-- ---------------------------------------------------------------------
-- The charge collision: old charge becomes flow
-- ---------------------------------------------------------------------
-- The six markers filed under the old `charge` subsystem measure fuel handling
-- and the ability to switch fuels. In the new model that is flow. Moving them
-- makes the word charge mean one thing again: mitochondrial membrane
-- potential, frontier, unmeasured.
alter table lab_markers add column if not exists dimension state_dimension;

comment on column lab_markers.dimension is
  'The scored dimension this marker feeds. Replaces `subsystem`. Null means '
  'not yet mapped: the remaining markers are awaiting an approved mapping and '
  'MUST NOT be scored until they have one.';

update lab_markers set dimension = 'flow'
 where slug in ('glucose-fasting','hba1c','homa-ir','insulin-fasting',
                'trig-hdl-ratio','triglycerides');

update lab_markers set dimension = 'structure' where slug = 'omega3-index';

-- ---------------------------------------------------------------------
-- The old subsystem enum is NOT dropped here, deliberately
-- ---------------------------------------------------------------------
-- 26 markers still carry a `subsystem` value and no approved `dimension`, and
-- `circadian_practices.target` also depends on the type. Dropping it now would
-- destroy the only classification those rows have while their replacement is
-- still awaiting approval. The column is marked deprecated instead, and it
-- comes out in the migration that applies the approved mapping.
comment on column lab_markers.subsystem is
  'DEPRECATED. Superseded by lab_markers.dimension. Retained only until the '
  'remaining markers have an approved dimension mapping, then dropped with '
  'the type. Do not read this column in new code.';

-- A guard so the deprecation cannot rot quietly: a marker may not carry a
-- dimension that is frontier, whatever happens to the mapping later.
create or replace function lab_marker_dimension_is_scored(d state_dimension)
returns boolean language sql stable as $$
  select d is null or (select is_scored from state_dimensions where dimension = d)
$$;

alter table lab_markers
  add constraint lab_markers_dimension_scored
  check (lab_marker_dimension_is_scored(dimension));
