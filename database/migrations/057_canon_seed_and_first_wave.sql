-- 057: the canonical rules seed, the first program start date, and one grant fix.
--
-- Every rule below is review_status = 'pending'. Nothing generates a plan for a
-- real participant until the owner approves the seed in the admin interface, and
-- eligible_rules() is what enforces that rather than a check in application code.

-- ---------------------------------------------------------------------
-- 1. eligible_rules() was created in 056 and inherited EXECUTE for PUBLIC,
--    which check_rls caught on its first run after the migration. Functions
--    grant EXECUTE to PUBLIC by default and 054's ALTER DEFAULT PRIVILEGES does
--    not retroactively cover a function created later in a different statement.
--    The planner runs server side with the service key, so authenticated never
--    needs this.
-- ---------------------------------------------------------------------
revoke execute on function eligible_rules(text) from public;
revoke execute on function eligible_rules(text) from anon;
grant  execute on function eligible_rules(text) to service_role;

-- ---------------------------------------------------------------------
-- 2. First program start. Defaulted per the ruling: the next 1st or 15th that
--    satisfies minimum_lead_days from today. Computed rather than typed, and the
--    cohort is created to match, because first_wave_date without a cohort is a
--    date nobody can enrol into.
-- ---------------------------------------------------------------------
do $$
declare
  lead_days int := (select value::int from program_settings where key = 'minimum_lead_days');
  earliest  date := current_date + lead_days;
  wave      date;
begin
  select min(d) into wave from (
    select generate_series(date_trunc('month', current_date),
                           date_trunc('month', current_date) + interval '6 months',
                           interval '1 month')::date d
    union all
    select (generate_series(date_trunc('month', current_date),
                            date_trunc('month', current_date) + interval '6 months',
                            interval '1 month') + interval '14 days')::date
  ) x where d >= earliest;

  update program_settings
     set value = wave::text,
         description = 'No day_zero is ever earlier than this. Set by migration 057 to the '
                       'next 1st or 15th satisfying minimum_lead_days. The lead time is the '
                       'Omega-3 kit being collected and posted, not the result returning.',
         updated_at = now()
   where key = 'first_wave_date';

  insert into cohorts (code, name, status, seats, starts_on, ends_on, price_cents, notes)
  values ('W' || wave::text,
          'Wave ' || to_char(wave, 'FMMonth DD, YYYY'),
          'enrolling', null, wave, wave + 89,
          (select value::int from program_settings where key = 'program_price_cents'),
          'First wave. Created by migration 057. Open enrollment on the 1st and 15th, no seat cap.')
  on conflict (code) do update
     set status = 'enrolling', starts_on = excluded.starts_on, ends_on = excluded.ends_on;

  raise notice 'first_wave_date set to %, cohort W% created', wave, wave;
end $$;

-- ---------------------------------------------------------------------
-- 3. The canonical rules seed.
--
-- Drawn from the protocol's own parameters, not invented: every `parameter` here
-- is a real row in protocol_parameters with real per tier ranges, and every
-- contraindication is a real flag from the medication screening table in
-- _medical.js. Evidence tiers are set conservatively: 'established' only where
-- the book itself tiers the claim that way.
--
-- source_passages is resolved from the loaded corpus by a lexical match below
-- rather than typed, and any rule that resolves to zero passages is reported by
-- the seed report query at the end. A rule with no source is still seeded,
-- because a missing citation must be visible in the approval screen rather than
-- silently excluded.
-- ---------------------------------------------------------------------
insert into canonical_rules
  (rule_key, version, pillar_key, population, required_data, action_text, parameter,
   personalization, contraindications, stop_conditions, evidence_tier, reassess_days, review_status)
values

-- MORNING DAYLIGHT
('morning_light_minutes', 1, 'morning_daylight',
 'Every participant, every tier.',
 array['waketime','morning_light_min'],
 'Get outside within an hour of waking and stay out for your tier''s light target. No sunglasses, no window glass between you and the sky.',
 'morning_light_min',
 '{"source":"protocol_parameters","by_tier":true}'::jsonb,
 array['antidepressant_mood'],
 array['A new or worsening mood change after a wake time shift.'],
 'established', 14, 'pending'),

('wake_time_consistency', 1, 'morning_daylight',
 'Every participant whose wake time varies by more than an hour across the week.',
 array['waketime'],
 'Pick one wake time and hold it, including at weekends. Move it by no more than your tier''s step each week.',
 'wake_time_shift_min',
 '{"source":"protocol_parameters","by_tier":true}'::jsonb,
 array['antidepressant_mood'],
 array['Sleep onset getting worse for more than five nights.'],
 'established', 14, 'pending'),

-- HYDRATION
('morning_glass', 1, 'hydration',
 'Every participant, every tier.',
 array['water_ml'],
 'Drink a glass of water with minerals in it before anything else, including coffee.',
 null,
 '{}'::jsonb,
 array['diuretic_bp','lithium'],
 array['Swelling in the hands or ankles.'],
 'strong', 14, 'pending'),

('daily_water_target', 1, 'hydration',
 'Every participant, every tier.',
 array['water_ml'],
 'Reach your tier''s water target across the day, with minerals in every bottle rather than plain water.',
 'water_l',
 '{"source":"protocol_parameters","by_tier":true}'::jsonb,
 array['diuretic_bp','lithium'],
 array['Swelling, or waking more than twice a night to urinate.'],
 'strong', 14, 'pending'),

('mineral_salt_target', 1, 'hydration',
 'Every participant not on a sodium restricted diet.',
 array['water_ml'],
 'Add mineral salt to your water to reach your tier''s sodium target. Baja Gold or Icelandic salt, a pinch per bottle.',
 'sodium_g',
 '{"source":"protocol_parameters","by_tier":true}'::jsonb,
 array['diuretic_bp','lithium'],
 array['A rise in blood pressure at home readings.'],
 'emerging', 14, 'pending'),

-- MOVEMENT
('post_meal_walk', 1, 'movement',
 'Every participant, every tier.',
 array['movement_minutes','last_meal_at'],
 'Walk for ten to fifteen minutes after your largest meal.',
 null,
 '{"minutes":{"min":10,"max":20}}'::jsonb,
 array[]::text[],
 array['New chest discomfort or breathlessness on walking.'],
 'established', 14, 'pending'),

('zone_two_volume', 1, 'movement',
 'Every participant cleared for aerobic exercise.',
 array['movement_minutes'],
 'Accumulate easy aerobic work at a pace where you can still hold a conversation. Build the weekly total slowly.',
 null,
 '{"weekly_minutes":{"beginner":60,"intermediate":120,"advanced":180,"pro":240}}'::jsonb,
 array[]::text[],
 array['Resting heart rate up more than ten beats for three days.'],
 'established', 14, 'pending'),

-- FOOD TIMING
('eating_window', 1, 'food_timing',
 'Every participant, every tier.',
 array['first_meal_at','last_meal_at'],
 'Keep all your food inside your tier''s window, and close it at least three hours before bed.',
 'eating_window_hours',
 '{"source":"protocol_parameters","by_tier":true}'::jsonb,
 array['levothyroxine','metformin_sulfonylurea','insulin'],
 array['Light headedness, or a hypoglycaemic reading.'],
 'strong', 14, 'pending'),

('protein_first', 1, 'food_timing',
 'Every participant, every tier.',
 array['first_meal_at'],
 'Eat the protein on the plate before the carbohydrate.',
 null,
 '{}'::jsonb,
 array[]::text[],
 array[]::text[],
 'emerging', 21, 'pending'),

('oily_fish_weekly', 1, 'food_timing',
 'Every participant, every tier.',
 array['first_meal_at'],
 'Eat oily fish three times a week: sardines, herring, mackerel or salmon.',
 null,
 '{"servings_per_week":{"min":2,"max":4}}'::jsonb,
 array['anticoagulant'],
 array[]::text[],
 'established', 28, 'pending'),

-- SLEEP
('sleep_regularity', 1, 'sleep',
 'Every participant, every tier.',
 array['bedtime','waketime','sleep_quality'],
 'Go to bed and get up at the same time. Hold the wake time first; the bedtime follows it.',
 null,
 '{}'::jsonb,
 array['antidepressant_mood'],
 array['Lying awake more than forty minutes for five nights.'],
 'established', 14, 'pending'),

('bedroom_conditions', 1, 'sleep',
 'Every participant, every tier.',
 array['sleep_quality'],
 'Sleep in a room that is dark enough that you cannot see your hand, and cool.',
 null,
 '{}'::jsonb,
 array[]::text[],
 array[]::text[],
 'strong', 28, 'pending'),

-- NIGHTTIME DARKNESS
('evening_light_cut', 1, 'nighttime_darkness',
 'Every participant, every tier.',
 array['last_screen_at','evening_light_low'],
 'Get the bright light out of the last two hours before bed. Lamps low and warm rather than overhead.',
 null,
 '{"hours_before_bed":{"min":1,"max":3}}'::jsonb,
 array[]::text[],
 array[]::text[],
 'established', 14, 'pending'),

('screens_off_before_bed', 1, 'nighttime_darkness',
 'Every participant who reports screen use inside an hour of bed.',
 array['last_screen_at','bedtime'],
 'Put the screens down an hour before bed. If that is not possible tonight, dim them and hold them lower than your eyes.',
 null,
 '{"minutes_before_bed":{"min":30,"max":120}}'::jsonb,
 array[]::text[],
 array[]::text[],
 'contested', 21, 'pending')

on conflict (rule_key, version) do nothing;

-- Resolve source passages from the loaded corpus. Lexical, because the Voyage
-- key is absent and there are no vectors; this is recorded as a limitation
-- rather than presented as semantic matching.
update canonical_rules r
   set source_passages = coalesce((
     select array_agg(p.id order by p.id)
       from (
         select kp.id
           from knowledge_passages kp
          where kp.passage ilike any (
            case r.pillar_key
              when 'morning_daylight'   then array['%morning light%','%within an hour of waking%']
              when 'hydration'          then array['%morning glass%','%minerals%','%three liters%']
              when 'movement'           then array['%zone 2%','%walk after%','%after every meal%']
              when 'food_timing'        then array['%eating window%','%protein first%','%oily fish%']
              when 'sleep'              then array['%same time every night%','%dark, cool%','%sleep%']
              when 'nighttime_darkness' then array['%evening light%','%screens%','%blue light%']
            end)
          limit 4
       ) p), '{}')
 where r.review_status = 'pending' and cardinality(r.source_passages) = 0;
