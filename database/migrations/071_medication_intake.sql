-- 071: the medication screening question at intake.
--
-- The Safety gate reads a participant's screening flags from their intake
-- answers. There were no questions at all: the table was empty, so no answer
-- could exist, so no flag could ever be raised, so the gate could never fire.
-- The gate, the keyed screening table and the rule contraindications were all
-- correct and all pointed at nothing.
--
-- ONE free text question plus a checklist. The checklist is what most people
-- answer; the free text is there because the regular expressions in _medical.js
-- catch brand names the checklist does not list, and somebody writing "I'm on
-- Eliquis" should be flagged whether or not they tick a box.

insert into questions (slug, version, kind, prompt, help_text, options, sort_order, is_required)
values
 ('medications_checklist', 1, 'multi_select',
  'Do any of these apply to you?',
  'This is the only medical question the program asks, and it is asked because '
  'some of the protocol interacts with these. Ticking one does not remove you '
  'from the program: it means the affected actions wait until your prescriber '
  'has cleared them.',
  '["Anticoagulants, or a blood thinner","Thyroid medication","Blood pressure medication","Diabetes medication","Lithium","Diuretics, or a sodium-restricted diet","Heart failure, or a fluid restriction","A bipolar diagnosis","None of these"]'::jsonb,
  10, true),
 ('medications_free_text', 1, 'text',
  'Anything else you take regularly, in your own words',
  'Optional. Write it however you like. We read it for the same eight things '
  'listed above and nothing else.',
  null, 11, false)
on conflict do nothing;

comment on table questions is
  'Intake questions. The medication ones are the contraindication source the '
  'Safety gate reads: with no rows here no flag can be raised and the gate '
  'silently permits everything.';
