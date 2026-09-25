-- 048: the 24 flagged markers are settled as referable, and the flag is cleared
-- with the reason recorded on the row.
--
-- needs_review meant "became referable by the default rule and nobody has
-- looked". Someone has now looked, and the answer is that the default rule was
-- right: Chapter 21 is canonical and a marker scores only if the chapter names
-- it under a dimension. That includes the three that used to be scored,
-- glucose-fasting, triglycerides and homa-ir, which were scored only because
-- migration 031 moved the old `charge` subsystem wholesale.
--
-- The flag comes off because it no longer describes anything true. The REASON
-- stays, on the row, because "referable" without a reason invites the next
-- person to treat it as an oversight and fix it.
--
-- PROMOTION HAPPENS BY EDITING CHAPTER 21 AND RE-RUNNING THE MAPPING
-- MIGRATION. Never in the database alone. A marker promoted by an UPDATE is a
-- marker the book does not know about, and the book is what the coach cites.

alter table lab_markers add column if not exists role_reason text;

comment on column lab_markers.role_reason is
  'Why this marker has the role it has. Set once the flag is cleared so the '
  'state is explained rather than merely recorded. A referable marker is not '
  'an unmapped one and must not be "fixed" by assigning it a dimension: to '
  'promote one, edit Chapter 21 and re-run the mapping migration.';

update lab_markers
   set role_reason = 'Chapter 21 canonical, referable by default',
       needs_review = false
 where needs_review;

-- The ones Chapter 21 named referable outright keep their own reason.
update lab_markers
   set role_reason = 'Chapter 21 names this referable'
 where slug in ('hs-crp','ggt','uric-acid','homocysteine','vitamin-d')
   and role_reason is null;

update lab_markers
   set role_reason = 'Chapter 21 names this under ' || dimension::text
 where role = 'scored' and role_reason is null;
