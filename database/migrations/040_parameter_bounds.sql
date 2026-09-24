-- 040: the published ranges and weekly step limits, per tier.
--
-- DECISIONS LEFT TO THE OWNER, set conservatively and listed in the report.
-- Every step is small enough that a wrong direction costs a week rather than a
-- month, and every range is inside what the tier protocols already prescribe,
-- so the agent can never add an intervention a tier does not include.
--
-- The rule that makes this safe is not any single number: it is that the agent
-- reads these rows rather than holding them, so widening a bound is a
-- deliberate database change by a person.

insert into protocol_parameters (param, tier, unit, min_value, max_value, weekly_step, intervention, note) values
  -- eating window length, hours. Narrowing is the direction of travel, so the
  -- floor is the tightest the tier prescribes and the ceiling its starting point.
  ('eating_window_hours','pro',         'hours', 6,  10, 0.5, 'eating window','Pro runs 7am to 1pm at target'),
  ('eating_window_hours','advanced',    'hours', 8,  12, 0.5, 'eating window','Advanced runs 7am to 3pm at target'),
  ('eating_window_hours','intermediate','hours', 9,  13, 0.5, 'eating window','Intermediate runs 8am to 5pm at target'),
  ('eating_window_hours','beginner',    'hours', 10, 14, 0.5, 'eating window','Beginner has no window until month two'),

  -- morning light, minutes. Up is the direction of travel.
  ('morning_light_min','pro',         'minutes', 20, 45, 5, 'morning light','Pro target is 30 to 45'),
  ('morning_light_min','advanced',    'minutes', 15, 40, 5, 'morning light','Advanced target is 20 to 40'),
  ('morning_light_min','intermediate','minutes', 10, 30, 5, 'morning light','Intermediate target is 10 to 15'),
  ('morning_light_min','beginner',    'minutes', 10, 20, 5, 'morning light','Beginner target is 15'),

  -- wake time, minutes from the member's current fixed wake. Both directions.
  ('wake_time_shift_min','pro',         'minutes', -60, 60, 15, 'sleep schedule','Fixed wake time, moved gradually'),
  ('wake_time_shift_min','advanced',    'minutes', -60, 60, 15, 'sleep schedule',null),
  ('wake_time_shift_min','intermediate','minutes', -60, 60, 15, 'sleep schedule',null),
  ('wake_time_shift_min','beginner',    'minutes', -45, 45, 15, 'sleep schedule',null),

  -- sauna, minutes per session. Capped by the intensity ceiling in CLAUDE.md.
  ('sauna_min','pro',         'minutes', 0, 25, 5, 'sauna','Hard cap 25 minutes'),
  ('sauna_min','advanced',    'minutes', 0, 20, 5, 'sauna',null),
  ('sauna_min','intermediate','minutes', 0, 15, 5, 'sauna',null),
  ('sauna_min','beginner',    'minutes', 0, 15, 5, 'sauna','Physician clearance first'),

  -- cold, minutes. Hard cap 10 minutes, never below 38F.
  ('cold_min','pro',         'minutes', 0, 10, 1, 'cold','Hard cap 10 minutes'),
  ('cold_min','advanced',    'minutes', 0, 8,  1, 'cold',null),
  ('cold_min','intermediate','minutes', 0, 5,  1, 'cold',null),
  ('cold_min','beginner',    'minutes', 0, 2,  0.5,'cold','Cold finish on the shower only'),

  -- water, liters
  ('water_l','pro',         'liters', 3, 5, 0.5, 'water',null),
  ('water_l','advanced',    'liters', 3, 4.5,0.5,'water',null),
  ('water_l','intermediate','liters', 3, 4, 0.5, 'water',null),
  ('water_l','beginner',    'liters', 2.5,3.5,0.5,'water',null),

  -- sodium, grams per day added as unrefined salt
  ('sodium_g','pro',         'grams', 2, 6, 0.5, 'sodium',null),
  ('sodium_g','advanced',    'grams', 2, 5, 0.5, 'sodium',null),
  ('sodium_g','intermediate','grams', 2, 5, 0.5, 'sodium',null),
  ('sodium_g','beginner',    'grams', 2, 4, 0.5, 'sodium',null)
on conflict (param, tier) do update
  set min_value=excluded.min_value, max_value=excluded.max_value,
      weekly_step=excluded.weekly_step, intervention=excluded.intervention,
      note=excluded.note;
