-- 083: the seven canonical pillars.
--
-- Ruling of the owner, superseding the six pillar list in HBP-V1-Master.md and
-- the mapping recorded in migration 057. Heat and cold is a pillar in its own
-- right. The protocol's nine sections are document sections, not pillars, and
-- this migration records the mapping between them.
--
-- Three things in the existing database contradicted the ruling and are
-- corrected here, not preserved:
--   1. protocol_section_pillars section 5 carried the note "NO PILLAR. Sauna
--      and cold are not among the six ... generate NO daily actions in V1".
--      The ruling reverses that.
--   2. protocol_parameters.cold_min allowed a maximum of 8 minutes at advanced
--      and 10 at pro. The ruling's hard ceiling is 5 minutes at every tier.
--   3. No parameter recorded a water temperature, so nothing could enforce the
--      7 C floor. cold_temp_c is added for that purpose.

begin;

-- ---------------------------------------------------------------------------
-- 1. The seventh pillar, and the ruling's order.
-- ---------------------------------------------------------------------------

insert into pillars (key, label, sort_order, description) values
  ('heat_and_cold', 'Heat and cold', 5,
   'Deliberate heat and deliberate cold, dosed by tier and timed away from strength training and from bed. A hormetic stress: the dose is the point, and the ceiling is a safety bound, not a target.')
on conflict (key) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      description = excluded.description;

-- The ruling states the order. Renumber all seven so the order in the database
-- is the order in the ruling, rather than whatever the first six happened to be.
update pillars set sort_order = v.ord
  from (values
    ('morning_daylight', 1), ('hydration', 2), ('movement', 3),
    ('food_timing', 4), ('heat_and_cold', 5), ('sleep', 6),
    ('nighttime_darkness', 7)
  ) as v(key, ord)
 where pillars.key = v.key;

-- ---------------------------------------------------------------------------
-- 2. Section to pillar. A section may now feed more than one pillar, because
--    the ruling splits 01 The Clock between morning daylight and nighttime
--    darkness. The primary key on section_no cannot express that.
-- ---------------------------------------------------------------------------

alter table protocol_section_pillars drop constraint if exists protocol_section_pillars_pkey;
alter table protocol_section_pillars add column if not exists id bigserial;
-- One row per section per pillar, and at most one "support section" row per
-- section. coalesce rather than nulls not distinct, which needs PG15.
drop index if exists protocol_section_pillars_one_per_pair;
create unique index protocol_section_pillars_one_per_pair
  on protocol_section_pillars (section_no, coalesce(pillar_key, '(support)'));

delete from protocol_section_pillars;

insert into protocol_section_pillars (section_no, section, pillar_key, note) values
  (1, '01 THE CLOCK', 'morning_daylight',
   'Split by the ruling. Morning and daytime sun, and grounding, map here.'),
  (1, '01 THE CLOCK', 'nighttime_darkness',
   'Split by the ruling. Light at night maps here.'),
  (2, '02 WATER', 'hydration', 'Clean fit.'),
  (3, '03 MOVEMENT', 'movement', 'Clean fit.'),
  (4, '04 FOOD', 'food_timing',
   'The eating window maps here. What a person eats is carried by the Dietary Guidelines as education, not as a pillar rule.'),
  (5, '05 HEAT AND COLD', 'heat_and_cold',
   'A pillar in its own right by the ruling. This supersedes the earlier note that heat and cold had no pillar and generated no daily actions.'),
  (6, '06 SLEEP', 'sleep', 'Clean fit.'),
  (7, '07 ENVIRONMENT', null,
   'Support section, no rules of its own. Its rules go to the pillar they serve: glasses, bulbs and the router timer serve nighttime_darkness; water and minerals serve hydration.'),
  (8, '08 THE NINETY DAYS', null,
   'Support section. Program state, not a rule domain.'),
  (9, '09 EVERY DAY', null,
   'Support section. The check-in itself, not a rule domain.');

-- ---------------------------------------------------------------------------
-- 3. The daily checklist knows which pillar each practice serves.
-- ---------------------------------------------------------------------------

alter table circadian_practices add column if not exists pillar_key text references pillars(key);

update circadian_practices set pillar_key = v.pillar from (values
  ('morning-light',       'morning_daylight'),
  ('midday-sun',          'morning_daylight'),
  ('fixed-sleep-window',  'sleep'),
  ('screens-off',         'nighttime_darkness'),
  ('protein-target',      'food_timing'),
  ('eating-window',       'food_timing'),
  ('walk-after-meal',     'movement'),
  ('training',            'movement'),
  ('cold-exposure',       'heat_and_cold'),
  ('heat-exposure',       'heat_and_cold')
) as v(slug, pillar) where circadian_practices.slug = v.slug;

-- Every live practice must now belong to a pillar, or the checklist cannot
-- group it and the omission would be invisible.
do $$
declare orphan text;
begin
  select string_agg(slug, ', ') into orphan
    from circadian_practices where retired_at is null and pillar_key is null;
  if orphan is not null then
    raise exception 'practices with no pillar: %', orphan;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Parameters. The hard ceilings from the ruling, as data.
-- ---------------------------------------------------------------------------

-- "no single plunge over 5 minutes", at every tier, including after the pro
-- 20 percent per cycle increase. 8 and 10 were above the ceiling.
update protocol_parameters set max_value = 5
 where param = 'cold_min' and max_value > 5;

-- Sauna duration by tier, from the ruling: beginner 8 to 10 min, intermediate
-- 15, advanced 15 to 20, pro 20 and above in 2 to 3 rounds. The existing rows
-- allowed 15/15/20/25; beginner and pro are corrected.
update protocol_parameters set max_value = 10 where param = 'sauna_min' and tier = 'beginner';
update protocol_parameters set max_value = 15 where param = 'sauna_min' and tier = 'intermediate';
update protocol_parameters set max_value = 20 where param = 'sauna_min' and tier = 'advanced';
update protocol_parameters set max_value = 30, note = 'Per round. The ruling says 20 or more minutes in 2 to 3 rounds; 30 is the per-round ceiling.'
 where param = 'sauna_min' and tier = 'pro';

insert into protocol_parameters (param, tier, unit, min_value, max_value, weekly_step, intervention, note) values
  -- Air temperature. The ruling gives a ceiling per tier and, except at pro, no
  -- floor, so min_value is 0: bounded autonomy may always lower a dose, never
  -- raise it past the tier ceiling.
  ('sauna_temp_c', 'beginner',     'celsius', 0,  80,  5, 'sauna', 'Ruling: up to 80 C. No floor stated.'),
  ('sauna_temp_c', 'intermediate', 'celsius', 0,  85,  5, 'sauna', 'Ruling: about 80 C. 85 is the ceiling.'),
  ('sauna_temp_c', 'advanced',     'celsius', 0,  90,  5, 'sauna', 'Ruling: 80 to 90 C.'),
  ('sauna_temp_c', 'pro',          'celsius', 85, 100, 5, 'sauna', 'Ruling: 85 to 100 C.'),
  -- Water temperature. This one inverts: colder is a larger dose, so min_value
  -- is the safety bound. 7 C is the hard floor at every tier and is never
  -- lowered by any tier, multiplier or adaptation.
  ('cold_temp_c', 'beginner',     'celsius', 7, 15, 1, 'cold',
   'Beginner does not plunge; the dose is the cold end of a shower, whose temperature is not controllable. Bounds recorded so the 7 C floor still binds if a beginner plunges anyway.'),
  ('cold_temp_c', 'intermediate', 'celsius', 7, 15, 1, 'cold', 'Ruling: 12 to 15 C for a plunge. 7 C is the hard floor.'),
  ('cold_temp_c', 'advanced',     'celsius', 7, 13, 1, 'cold', 'Ruling: 10 to 13 C. 7 C is the hard floor.'),
  ('cold_temp_c', 'pro',          'celsius', 7, 10, 1, 'cold', 'Ruling: 7 to 10 C. 7 C is the hard floor and the pro band reaches it.'),
  -- Sessions per week.
  ('sauna_per_week', 'beginner',     'sessions', 0, 2, 1, 'sauna', 'Ruling: 2x per week.'),
  ('sauna_per_week', 'intermediate', 'sessions', 0, 3, 1, 'sauna', 'Ruling: 3x per week.'),
  ('sauna_per_week', 'advanced',     'sessions', 0, 4, 1, 'sauna', 'Ruling: 4x per week.'),
  ('sauna_per_week', 'pro',          'sessions', 0, 7, 1, 'sauna', 'Ruling: 4 to 7x per week.'),
  ('cold_per_week', 'beginner',     'sessions', 0, 5, 1, 'cold', 'Ruling: 3 to 5 days per week, shower cold.'),
  ('cold_per_week', 'intermediate', 'sessions', 0, 7, 1, 'cold', 'Ruling: daily shower cold, or a plunge 2 to 3x per week.'),
  ('cold_per_week', 'advanced',     'sessions', 0, 4, 1, 'cold', 'Ruling: 3 to 4x per week.'),
  ('cold_per_week', 'pro',          'sessions', 0, 5, 1, 'cold', 'Ruling: 4 to 5x per week.')
on conflict (param, tier) do update
  set unit = excluded.unit, min_value = excluded.min_value,
      max_value = excluded.max_value, weekly_step = excluded.weekly_step,
      intervention = excluded.intervention, note = excluded.note;

commit;

-- ---------------------------------------------------------------------------
-- 5. Safety exclusions for heat and cold, as screening keys.
--
-- These must stay identical to SCREENING_ROWS in functions/api/_medical.js:
-- check_canon.py fails the commit if the two lists differ. The duplication is
-- deliberate, so the coach's safety routing still works when the database is
-- unreachable, and the check is what stops the duplication becoming drift.
-- ---------------------------------------------------------------------------

begin;

insert into screening_keys (key, on_this) values
  ('recent_heart_attack',         'A heart attack in the last twelve months'),
  ('unstable_angina',             'Unstable chest pain'),
  ('severe_aortic_stenosis',      'Severe aortic stenosis'),
  ('arrhythmia',                  'An arrhythmia'),
  ('uncontrolled_blood_pressure', 'Blood pressure that is not controlled'),
  ('very_low_blood_pressure',     'Very low blood pressure'),
  ('pregnancy',                   'Pregnancy'),
  ('raynauds',                    'Raynaud''s'),
  ('trying_to_conceive_male',     'A man trying to conceive')
on conflict (key) do update set on_this = excluded.on_this;

-- ---------------------------------------------------------------------------
-- 6. The heat and cold canonical rules.
--
-- Evidence tiers are set by the ruling: sauna frequency and duration are
-- strong, and the ruling states the basis is observational. Cold exposure is
-- emerging. Both enter at review_status pending, like every other rule: no
-- participant receives a plan until the owner approves the seed.
--
-- The fixed rules live in eligibility, which is the machine-readable half of a
-- rule, so functions/api/_heatcold.js can enforce them rather than restating
-- them. stop_conditions carries what a participant should stop for.
-- ---------------------------------------------------------------------------

insert into canonical_rules (
  rule_key, version, pillar_key, population, eligibility, required_data,
  action_text, parameter, personalization, contraindications, stop_conditions,
  evidence_tier, source_passages, reassess_days, review_status
) values
(
  'sauna_session', 1, 'heat_and_cold',
  'Every tier. The dose differs by tier; the timing rules and the ceiling do not.',
  jsonb_build_object(
    'finish_before_bed_hours', jsonb_build_array(1, 2),
    'no_alcohol_before_or_during', true,
    'mineral_water_after', true,
    'reduced_dose_when_flagged', jsonb_build_array('trying_to_conceive_male'),
    'evidence_basis', 'observational'
  ),
  array['sauna_minutes','sauna_at'],
  'Take your tier''s sauna dose, and finish one to two hours before bed. No alcohol before or during. Mineral water after.',
  'sauna_min',
  jsonb_build_object('source', 'protocol_parameters', 'by_tier', true,
                     'also', jsonb_build_array('sauna_temp_c', 'sauna_per_week')),
  array['recent_heart_attack','unstable_angina','severe_aortic_stenosis','arrhythmia',
        'uncontrolled_blood_pressure','very_low_blood_pressure','pregnancy',
        'blood_pressure_medication','lithium','diuretics_or_sodium_restriction',
        'heart_failure_or_fluid_restriction','trying_to_conceive_male'],
  array['Light headedness, chest discomfort, a racing or irregular heartbeat, or nausea. Get out, sit down, and drink mineral water.'],
  'strong',
  array['15c2ffeb-00b7-4cd3-be2f-9f4dc7f5ffd7'::uuid,
        '495550fc-9991-4f19-8003-eb8a612b15e5'::uuid,
        '50ff385c-f827-4df8-bc17-281cb40639ac'::uuid],
  14, 'pending'
),
(
  'cold_exposure', 1, 'heat_and_cold',
  'Every tier. Beginner and intermediate may do the whole dose as the cold end of a shower.',
  jsonb_build_object(
    'never_within_hours_after', jsonb_build_object('strength_training', 6),
    'hard_ceiling_minutes', 5,
    'hard_floor_celsius', 7,
    'never_alone_in_open_water', true,
    'never_head_under_or_breath_held', true,
    'evidence_basis', 'emerging'
  ),
  array['cold_minutes','cold_at','strength_at'],
  'Take your tier''s cold dose. Never within six hours after strength training. Never head under, never holding your breath, and never alone in open water.',
  'cold_min',
  jsonb_build_object('source', 'protocol_parameters', 'by_tier', true,
                     'also', jsonb_build_array('cold_temp_c', 'cold_per_week')),
  array['recent_heart_attack','unstable_angina','severe_aortic_stenosis','arrhythmia',
        'uncontrolled_blood_pressure','very_low_blood_pressure','pregnancy','raynauds',
        'blood_pressure_medication'],
  array['Chest pain, an irregular heartbeat, numbness that does not pass, or fingers and toes that stay white. Get out and warm up slowly.'],
  'emerging',
  array['15c2ffeb-00b7-4cd3-be2f-9f4dc7f5ffd7'::uuid,
        '495550fc-9991-4f19-8003-eb8a612b15e5'::uuid,
        '50ff385c-f827-4df8-bc17-281cb40639ac'::uuid],
  14, 'pending'
)
on conflict (rule_key, version) do update
  set pillar_key = excluded.pillar_key, population = excluded.population,
      eligibility = excluded.eligibility, required_data = excluded.required_data,
      action_text = excluded.action_text, parameter = excluded.parameter,
      personalization = excluded.personalization,
      contraindications = excluded.contraindications,
      stop_conditions = excluded.stop_conditions,
      evidence_tier = excluded.evidence_tier,
      source_passages = excluded.source_passages,
      reassess_days = excluded.reassess_days;

commit;
