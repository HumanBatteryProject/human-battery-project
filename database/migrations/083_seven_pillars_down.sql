-- Reverses 083_seven_pillars.sql back to the six pillar model.
-- One transaction: the earlier down migration in this project raised its guard
-- and then dropped the tables anyway, because the guard and the drops were in
-- separate statements.
begin;

delete from canonical_rules where rule_key in ('sauna_session','cold_exposure');

alter table circadian_practices drop column if exists pillar_key;

delete from protocol_parameters
 where param in ('sauna_temp_c','cold_temp_c','sauna_per_week','cold_per_week');

update protocol_parameters set max_value = 2  where param = 'cold_min' and tier = 'beginner';
update protocol_parameters set max_value = 5  where param = 'cold_min' and tier = 'intermediate';
update protocol_parameters set max_value = 8  where param = 'cold_min' and tier = 'advanced';
update protocol_parameters set max_value = 10 where param = 'cold_min' and tier = 'pro';
update protocol_parameters set max_value = 15, note = null where param = 'sauna_min' and tier = 'beginner';
update protocol_parameters set max_value = 15 where param = 'sauna_min' and tier = 'intermediate';
update protocol_parameters set max_value = 20 where param = 'sauna_min' and tier = 'advanced';
update protocol_parameters set max_value = 25, note = null where param = 'sauna_min' and tier = 'pro';

delete from screening_keys where key in (
  'recent_heart_attack','unstable_angina','severe_aortic_stenosis','arrhythmia',
  'uncontrolled_blood_pressure','very_low_blood_pressure','pregnancy','raynauds',
  'trying_to_conceive_male');

delete from protocol_section_pillars;
drop index if exists protocol_section_pillars_one_per_pair;
alter table protocol_section_pillars drop column if exists id;
alter table protocol_section_pillars add primary key (section_no);

insert into protocol_section_pillars (section_no, section, pillar_key, note) values
  (1, '01 THE CLOCK', 'morning_daylight', 'Split. The morning light rules map here; the evening and pre-sleep light rules map to nighttime darkness.'),
  (2, '02 WATER', 'hydration', 'Clean fit.'),
  (3, '03 MOVEMENT', 'movement', 'Clean fit.'),
  (4, '04 FOOD', 'food_timing', 'The eating window maps here. What a person eats is carried by the Dietary Guidelines as education.'),
  (5, '05 HEAT AND COLD', null, 'NO PILLAR. Sauna and cold are not among the six. Both are in the medication screening table and kept as protocol instruction, and generate NO daily actions in V1.'),
  (6, '06 SLEEP', 'sleep', 'Clean fit.'),
  (7, '07 ENVIRONMENT', 'nighttime_darkness', 'Glasses, bulbs and the router timer are the tools that make evening darkness possible, so the rules land here.'),
  (8, '08 THE NINETY DAYS', null, 'Not a rule domain. Program state, covered by D1.'),
  (9, '09 EVERY DAY', null, 'Not a rule domain. This is the check-in itself, covered by D3.');

delete from pillars where key = 'heat_and_cold';
update pillars set sort_order = v.ord from (values
  ('morning_daylight',1),('hydration',2),('movement',3),
  ('food_timing',4),('sleep',5),('nighttime_darkness',6)
) as v(key,ord) where pillars.key = v.key;

commit;
