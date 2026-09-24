-- 033: the Chapter 21 mapping, applied. The book is the mapping.
--
-- docs/HBP-Marker-Dimension-Mapping-PROPOSAL.md is superseded and is no longer
-- a source of truth. Chapter 21 is. Where the two disagree, the book wins, and
-- they disagree in several places: the proposal put the thyroid panel and RBC
-- magnesium in flow, iron and the androgens in capacity, and cortisol in
-- timing. Chapter 21 names none of them, so none of them are scored.
--
-- THE RULE THAT DOES MOST OF THE WORK HERE
-- Anything Chapter 21 does not name defaults to referable, is flagged for
-- review, and is never scored. That is applied literally, and it demotes three
-- markers that are scored today: glucose-fasting, triglycerides and homa-ir.
-- They sit in flow because migration 031 moved the old `charge` subsystem
-- wholesale. Chapter 21's flow list is respiratory exchange ratio, oxygen
-- consumption, fasting insulin, HbA1c and the triglyceride-to-HDL ratio. The
-- other three are not on it. Demoting them is the rule working, not a bug, and
-- they are flagged so the demotion is visible rather than silent.
--
-- CAPACITY, TIMING and ENVIRONMENT get no lab markers at all. Their
-- instruments are functional tests and logged behaviour, not blood:
--   capacity     VO2max estimate, grip strength, sit-to-stand, walking speed, balance
--   timing       sleep and wake times, sleep regularity, meal timing, HRV, heart rate recovery
--   environment  morning light timing and duration, first meal, last meal
-- Chapter 21 says environment is logged, not drawn. That is true of all three.
-- An empty dimension here is correct, not missing data.

-- A marker demoted by the default rule is not the same as one Chapter 21
-- named as referable. The difference has to survive.
alter table lab_markers
  add column if not exists needs_review boolean not null default false;

comment on column lab_markers.needs_review is
  'True when this marker became referable by the Chapter 21 default rule, '
  'because the chapter does not name it, rather than by the chapter naming it '
  'referable outright. Awaiting a human decision. Never a reason to score it.';

-- ---------------------------------------------------------------------
-- Clear the board, in ONE statement. lab_markers_role_dimension_ck says a
-- scored row must carry a dimension, so nulling the dimension in its own
-- statement leaves every currently-scored row briefly illegal and the
-- constraint rejects it. Written as two statements first and it failed exactly
-- there. Role and dimension are two halves of one fact and move together.
-- ---------------------------------------------------------------------
update lab_markers set dimension = null, role = 'referable', needs_review = true;

-- ---------------------------------------------------------------------
-- FLOW. Chapter 21 names five inputs; three of them are lab markers.
-- Respiratory exchange ratio and oxygen consumption come from the CPET and
-- are not rows in lab_markers.
-- ---------------------------------------------------------------------
update lab_markers set dimension = 'flow', role = 'scored', needs_review = false
 where slug in ('insulin-fasting', 'hba1c', 'trig-hdl-ratio');

-- ---------------------------------------------------------------------
-- STRUCTURE. One marker, and it is the whole dimension.
-- Removing it would not weaken structure, it would delete it, and the
-- composite would then run over four. This is also why OmegaQuant is the one
-- named provider left in any deliverable: see CLAUDE.md rule 3d.
-- ---------------------------------------------------------------------
update lab_markers set dimension = 'structure', role = 'scored', needs_review = false
 where slug = 'omega3-index';

-- ---------------------------------------------------------------------
-- Named referable by Chapter 21 itself. Not flagged: this is a decision,
-- not a default. Body composition is on the chapter's list and is not a
-- lab_markers row; it arrives through measurements.
-- ---------------------------------------------------------------------
update lab_markers set needs_review = false
 where slug in ('hs-crp', 'ggt', 'uric-acid', 'homocysteine', 'vitamin-d');

-- ---------------------------------------------------------------------
-- role is now known for every marker, so it stops being nullable.
-- ---------------------------------------------------------------------
alter table lab_markers alter column role set not null;

create index if not exists lab_markers_needs_review_idx
  on lab_markers (needs_review) where needs_review;
