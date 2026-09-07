-- =====================================================================
-- 005  Reference data — the controlled vocabularies
--
-- This is what makes the daily log analysable instead of a pile of
-- sentences. Every logged item points at a row here by ID. The cookbook
-- is composed from the same food IDs, so a recipe can eventually be
-- logged in one tap.
-- =====================================================================

-- ---------------------------------------------------------------------
-- foods
-- ---------------------------------------------------------------------
create table foods (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null unique,        -- 'beef-ground-grassfed'
  name          text        not null,
  category      text        not null,               -- protein, vegetable, fat, fruit, ...
  tier          food_tier   not null default 'approved',
  default_unit  text        not null default 'serving',
  -- Per default_unit. Nullable: the program is not calorie-counting,
  -- but protein is a target and needs a number.
  protein_g     numeric(6,2),
  carb_g        numeric(6,2),
  fat_g         numeric(6,2),
  kcal          numeric(7,2),
  -- Allergen flags. Needed so someone who can't eat eggs gets an
  -- alternative path rather than quitting or lying in the log.
  contains_dairy   boolean not null default false,
  contains_egg     boolean not null default false,
  contains_gluten  boolean not null default false,
  contains_soy     boolean not null default false,
  contains_nuts    boolean not null default false,
  contains_shellfish boolean not null default false,
  is_animal        boolean not null default false,
  tags          text[]      not null default '{}',
  notes         text,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index foods_category_idx on foods (category) where retired_at is null;
create index foods_tier_idx     on foods (tier)     where retired_at is null;
create index foods_tags_idx     on foods using gin (tags);

create trigger foods_updated before update on foods
  for each row execute function set_updated_at();

comment on column foods.tier is
  'daily = non-negotiable list; approved = free within protocol; '
  'occasional = limited; excluded = off protocol. Logging an excluded '
  'food is a deviation to be recorded, never a reason to hide it.';

-- ---------------------------------------------------------------------
-- exercises
-- ---------------------------------------------------------------------
create table exercises (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null unique,
  name          text        not null,
  modality      exercise_modality not null,
  -- 'lower', 'upper', 'full', 'core', null for cardio
  movement_pattern text,
  equipment     text,
  phase_min     integer     not null default 1 check (phase_min between 1 and 3),
  instructions  text,
  video_url     text,
  retired_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index exercises_modality_idx on exercises (modality) where retired_at is null;

-- ---------------------------------------------------------------------
-- circadian_practices — the light, sleep, cold and heat protocol items
-- ---------------------------------------------------------------------
create table circadian_practices (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null unique,        -- 'morning-light-10min'
  name          text        not null,
  description   text,
  phase_min     integer     not null default 1 check (phase_min between 1 and 3),
  -- Which of the four blood subsystems this practice primarily targets.
  target        subsystem,
  is_daily_five boolean     not null default false,
  sort_order    integer     not null default 0,
  retired_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- lab_markers — LOINC-coded, so results are interoperable later
-- ---------------------------------------------------------------------
create table lab_markers (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null unique,        -- 'hba1c'
  name          text        not null,
  loinc_code    text,
  unit          text        not null,
  subsystem     subsystem   not null,
  -- Reference range defaults. A result may carry its own range from the
  -- lab; these are the fallback when the report omits one.
  ref_low       numeric(12,4),
  ref_high      numeric(12,4),
  -- Which direction is an improvement, for reading day 0 vs day 90.
  -- 1 = higher is better, -1 = lower is better, 0 = optimum is a band.
  better_direction smallint not null default 0
    check (better_direction in (-1, 0, 1)),
  optimal_low   numeric(12,4),
  optimal_high  numeric(12,4),
  sort_order    integer     not null default 0,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now()
);

create index lab_markers_subsystem_idx on lab_markers (subsystem, sort_order);

comment on column lab_markers.optimal_low is
  'The program target band, which is usually narrower than the lab reference '
  'range. Used for scoring only, never presented as a diagnostic threshold.';

-- ---------------------------------------------------------------------
-- recipes — composed from food IDs so a meal can be logged in one tap
-- ---------------------------------------------------------------------
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null unique,
  title         text        not null,
  summary       text,
  method        text,
  servings      integer     not null default 2 check (servings > 0),
  prep_minutes  integer,
  cook_minutes  integer,
  phase_min     integer     not null default 1 check (phase_min between 1 and 3),
  meal_slots    meal_slot[] not null default '{}',
  image_url     text,
  retired_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger recipes_updated before update on recipes
  for each row execute function set_updated_at();

create table recipe_items (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid        not null references recipes(id) on delete cascade,
  food_id       uuid        not null references foods(id) on delete restrict,
  quantity      numeric(8,2) not null check (quantity > 0),
  unit          text        not null,
  preparation   text,                                -- 'diced', 'zested'
  sort_order    integer     not null default 0
);

create index recipe_items_recipe_idx on recipe_items (recipe_id, sort_order);
create index recipe_items_food_idx   on recipe_items (food_id);
