-- =====================================================================
-- 014  Single-arm cohort design
--
-- Cohorts run 30 participants, all starting on the same date with the
-- same protocol. The study_arm column and its 'not_applicable' default
-- are retained: a future cohort may adopt a staggered design, and
-- dropping the column would make old and new cohorts incomparable.
-- =====================================================================

alter table cohorts alter column seats set default 30;

update cohorts set design = 'single_arm' where design is null;

comment on column cohorts.design is
  'single_arm: everyone starts together, no comparison group — results are '
  'descriptive, not causal. staggered_waitlist: reserved for a future cohort.';

comment on column memberships.arm is
  'not_applicable for single-arm cohorts. Retained so a later staggered '
  'cohort stays comparable with earlier data.';
