-- =====================================================================
-- 010  Seed data
--
-- Reference vocabularies only. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lab markers, grouped by subsystem
-- better_direction: 1 = higher is better, -1 = lower is better, 0 = band
-- ---------------------------------------------------------------------
insert into lab_markers (slug, name, loinc_code, unit, subsystem, ref_low, ref_high, better_direction, optimal_low, optimal_high, sort_order) values
  -- CHARGE — fuel handling
  ('glucose-fasting',  'Glucose, fasting',            '1558-6',  'mg/dL',   'charge',  70,   99,   -1, 75,   90,   10),
  ('insulin-fasting',  'Insulin, fasting',            '1986-9',  'uIU/mL',  'charge',  2,    19.6, -1, 2,    6,    20),
  ('hba1c',            'Hemoglobin A1c',              '4548-4',  '%',       'charge',  4.0,  5.6,  -1, 4.6,  5.3,  30),
  ('homa-ir',          'HOMA-IR (calculated)',        null,      'index',   'charge',  null, 2.0,  -1, 0.5,  1.5,  40),
  ('triglycerides',    'Triglycerides',               '2571-8',  'mg/dL',   'charge',  null, 150,  -1, 40,   90,   50),
  ('trig-hdl-ratio',   'Triglyceride:HDL ratio',      null,      'ratio',   'charge',  null, 3.0,  -1, 0.5,  1.5,  60),

  -- DRAIN — what consumes capacity
  ('hs-crp',           'hs-CRP',                      '30522-7', 'mg/L',    'drain',   null, 3.0,  -1, 0,    0.8,  10),
  ('ggt',              'GGT',                         '2324-2',  'U/L',     'drain',   0,    65,   -1, 5,    20,   20),
  ('alt',              'ALT',                         '1742-6',  'U/L',     'drain',   0,    55,   -1, 10,   25,   30),
  ('ast',              'AST',                         '1920-8',  'U/L',     'drain',   0,    48,   -1, 10,   25,   40),
  ('uric-acid',        'Uric acid',                   '3084-1',  'mg/dL',   'drain',   3.5,  7.2,  -1, 3.5,  5.5,  50),
  ('wbc',              'White blood cell count',      '6690-2',  'K/uL',    'drain',   3.4,  10.8,  0, 4.5,  6.5,  60),
  ('homocysteine',     'Homocysteine',                '13965-9', 'umol/L',  'drain',   0,    15,   -1, 5,    8,    70),

  -- OUTPUT — what you can spend
  ('tsh',              'TSH',                         '3016-3',  'uIU/mL',  'output',  0.45, 4.5,   0, 0.8,  2.0,  10),
  ('free-t3',          'Free T3',                     '3051-0',  'pg/mL',   'output',  2.0,  4.4,   1, 3.0,  4.2,  20),
  ('free-t4',          'Free T4',                     '3024-7',  'ng/dL',   'output',  0.82, 1.77,  0, 1.0,  1.5,  30),
  ('testosterone-total','Testosterone, total',        '2986-8',  'ng/dL',   'output',  264,  916,   1, 500,  900,  40),
  ('testosterone-free','Testosterone, free',          '2991-8',  'pg/mL',   'output',  6.6,  18.1,  1, 12,   25,   50),
  ('dhea-s',           'DHEA-S',                      '2191-5',  'ug/dL',   'output',  70,   495,   1, 200,  450,  60),
  ('cortisol-am',      'Cortisol, morning',           '2143-6',  'ug/dL',   'output',  6.2,  19.4,  0, 10,   16,   70),
  ('igf-1',            'IGF-1',                       '2484-4',  'ng/mL',   'output',  50,   300,   0, 120,  200,  80),
  ('shbg',             'SHBG',                        '13967-5', 'nmol/L',  'output',  10,   50,    0, 20,   45,   90),

  -- RESERVE — the raw material
  ('vitamin-d',        '25-OH Vitamin D',             '14635-7', 'ng/mL',   'reserve', 30,   100,   1, 40,   70,   10),
  ('ferritin',         'Ferritin',                    '2276-4',  'ng/mL',   'reserve', 30,   400,   0, 50,   150,  20),
  ('iron-saturation',  'Iron saturation',             '2502-3',  '%',       'reserve', 15,   55,    0, 25,   40,   30),
  ('vitamin-b12',      'Vitamin B12',                 '2132-9',  'pg/mL',   'reserve', 232,  1245,  1, 500,  900,  40),
  ('folate',           'Folate, serum',               '2284-8',  'ng/mL',   'reserve', 3.0,  20.0,  1, 10,   20,   50),
  ('magnesium-rbc',    'Magnesium, RBC',              '2593-2',  'mg/dL',   'reserve', 4.0,  6.4,   1, 5.5,  6.4,  60),
  ('albumin',          'Albumin',                     '1751-7',  'g/dL',    'reserve', 3.9,  4.9,   1, 4.3,  4.9,  70),
  ('hdl',              'HDL cholesterol',             '2085-9',  'mg/dL',   'reserve', 39,   null,  1, 55,   90,   80)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Circadian and protocol practices
-- ---------------------------------------------------------------------
insert into circadian_practices (slug, name, description, phase_min, target, is_daily_five, sort_order) values
  ('morning-light',      'Morning light',        'Outdoor light within 60 minutes of waking. Ten minutes minimum, longer on overcast days. No sunglasses, no window glass.', 1, 'output', true,  10),
  ('fixed-sleep-window', 'Fixed sleep window',   'Same bedtime and waketime, seven days. The window matters more than the total.', 1, 'output', true, 20),
  ('screens-off',        'Screens off',          'No bright screens in the 90 minutes before your bedtime.', 1, 'output', false, 30),
  ('protein-target',     'Protein target',       'Hit the daily protein floor set for you in onboarding.', 2, 'reserve', true, 40),
  ('eating-window',      'Eating window',        'All food inside your assigned window, aligned to your own clock.', 2, 'charge', true, 50),
  ('training',           'Training',             'The session prescribed for today. Logging a rest day counts as adherence.', 2, 'charge', true, 60),
  ('midday-sun',         'Midday sun exposure',  'Modest unprotected exposure at solar noon, sized to your skin type and never to burning.', 2, 'reserve', false, 70),
  ('cold-exposure',      'Cold exposure',        'Cold shower or immersion per your phase protocol.', 2, 'drain', false, 80),
  ('heat-exposure',      'Heat exposure',        'Sauna or hot bath per your phase protocol.', 3, 'drain', false, 90),
  ('walk-after-meal',    'Post-meal walk',       'Ten to fifteen minutes of walking after your largest meal.', 1, 'charge', false, 100)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Food starter list. Deliberately small — the full list is content work,
-- not schema work. Tier drives the daily non-negotiables and the
-- off-protocol flag on logging.
-- ---------------------------------------------------------------------
insert into foods (slug, name, category, tier, default_unit, protein_g, is_animal, contains_dairy, contains_egg, contains_gluten, contains_soy, contains_nuts, contains_shellfish, tags) values
  -- Daily non-negotiables
  ('leafy-greens',        'Leafy greens',              'vegetable', 'daily',    'cup',      2,  false,false,false,false,false,false,false, '{"fiber","folate"}'),
  ('fermented-vegetable', 'Fermented vegetables',      'vegetable', 'daily',    'serving',  1,  false,false,false,false,false,false,false, '{"fermented","gut"}'),
  ('eggs-pastured',       'Eggs, pastured',            'protein',   'daily',    'egg',      6,  true, false,true, false,false,false,false, '{"choline"}'),
  ('olive-oil-evoo',      'Extra virgin olive oil',    'fat',       'daily',    'tbsp',     0,  false,false,false,false,false,false,false, '{"monounsaturated"}'),
  ('salmon-wild',         'Salmon, wild',              'protein',   'daily',    'oz',       6,  true, false,false,false,false,false,false, '{"omega3","vitamin-d"}'),

  -- Approved
  ('beef-grassfed',       'Beef, grass-fed',           'protein',   'approved', 'oz',       7,  true, false,false,false,false,false,false, '{"heme-iron","b12"}'),
  ('chicken-thigh',       'Chicken thigh',             'protein',   'approved', 'oz',       6,  true, false,false,false,false,false,false, '{}'),
  ('sardines',            'Sardines',                  'protein',   'approved', 'tin',     22,  true, false,false,false,false,false,false, '{"omega3","calcium"}'),
  ('liver-beef',          'Beef liver',                'protein',   'approved', 'oz',       6,  true, false,false,false,false,false,false, '{"retinol","b12","copper"}'),
  ('broccoli',            'Broccoli',                  'vegetable', 'approved', 'cup',      3,  false,false,false,false,false,false,false, '{"sulforaphane"}'),
  ('avocado',             'Avocado',                   'fat',       'approved', 'half',     2,  false,false,false,false,false,false,false, '{"potassium"}'),
  ('berries-mixed',       'Berries, mixed',            'fruit',     'approved', 'cup',      1,  false,false,false,false,false,false,false, '{"polyphenol"}'),
  ('butter-grassfed',     'Butter, grass-fed',         'fat',       'approved', 'tbsp',     0,  true, true, false,false,false,false,false, '{}'),
  ('sea-salt',            'Unrefined sea salt',        'seasoning', 'approved', 'tsp',      0,  false,false,false,false,false,false,false, '{"minerals","electrolyte"}'),
  ('sweet-potato',        'Sweet potato',              'starch',    'approved', 'cup',      2,  false,false,false,false,false,false,false, '{}'),
  ('lentils',             'Lentils',                   'protein',   'approved', 'cup',     18,  false,false,false,false,false,false,false, '{"fiber","plant-protein"}'),
  ('walnuts',             'Walnuts',                   'fat',       'approved', 'oz',       4,  false,false,false,false,true, false,false, '{"omega3"}'),

  -- Occasional
  ('rice-white',          'White rice',                'starch',    'occasional','cup',     4,  false,false,false,false,false,false,false, '{}'),
  ('cheese-aged',         'Aged cheese',               'dairy',     'occasional','oz',      7,  true, true, false,false,false,false,false, '{}'),
  ('dark-chocolate',      'Dark chocolate, 85%+',      'treat',     'occasional','square',  1,  false,false,false,false,false,false,false, '{"polyphenol"}'),
  ('coffee',              'Coffee',                    'beverage',  'occasional','cup',     0,  false,false,false,false,false,false,false, '{"caffeine"}'),

  -- Excluded — logging these is a deviation, recorded not punished
  ('added-sugar',         'Added sugar',               'excluded',  'excluded', 'serving',  0,  false,false,false,false,false,false,false, '{"deviation"}'),
  ('seed-oil',            'Industrial seed oil',       'excluded',  'excluded', 'serving',  0,  false,false,false,false,false,false,false, '{"deviation"}'),
  ('alcohol',             'Alcohol',                   'excluded',  'excluded', 'unit',     0,  false,false,false,false,false,false,false, '{"deviation"}'),
  ('ultraprocessed',      'Ultra-processed food',      'excluded',  'excluded', 'serving',  0,  false,false,false,false,false,false,false, '{"deviation"}')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Scoring method v1
-- ---------------------------------------------------------------------
insert into score_methods (version, description, weights) values
  ('bs-v1',
   'Battery Score v1. Each marker is scored 0-100 by distance from its optimal band, '
   'averaged within subsystem, then combined by the weights below. Markers absent from '
   'a panel are excluded rather than imputed. Tracking index only — not diagnostic.',
   '{"charge":0.30,"drain":0.25,"output":0.25,"reserve":0.20}'::jsonb)
on conflict (version) do nothing;
