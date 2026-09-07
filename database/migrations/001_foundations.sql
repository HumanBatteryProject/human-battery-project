-- =====================================================================
-- 001  Foundations: extensions, enums, shared helpers
-- The Human Battery Project
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type app_role as enum ('client', 'coach', 'admin');

create type cohort_status as enum ('planning', 'enrolling', 'active', 'complete', 'cancelled');

create type membership_status as enum ('invited', 'enrolled', 'active', 'completed', 'withdrawn');

create type consent_kind as enum (
  'terms',                 -- terms of service
  'privacy',               -- general privacy policy
  'health_data',           -- consumer health data collection
  'health_data_sharing',   -- sharing with named third parties
  'research',              -- de-identified research use  (always optional)
  'participation'          -- program participation agreement
);

create type sex_at_birth as enum ('female', 'male', 'intersex', 'prefer_not_to_say');

create type meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type food_tier as enum (
  'daily',       -- on the daily non-negotiables list
  'approved',    -- eat freely within the protocol
  'occasional',  -- allowed, limited
  'excluded'     -- off protocol; logging it is a deviation, not a failure
);

create type exercise_modality as enum (
  'resistance', 'zone2', 'interval', 'mobility', 'walk', 'sport', 'other'
);

create type intensity_level as enum ('easy', 'moderate', 'hard', 'max');

create type day_part as enum ('early_am', 'am', 'midday', 'pm', 'evening');

create type subsystem as enum ('charge', 'drain', 'output', 'reserve');

-- The five behavioural domains measured from the daily log.
-- These are the second scoring axis; bloodwork is the first.
create type behavior_domain as enum (
  'connection',   -- social connection and sense of purpose
  'cognitive',    -- deliberate learning vs passive consumption
  'movement',     -- movement and muscle
  'light_sleep',  -- light exposure and sleep timing
  'emotional'     -- stress and emotional load
);

create type draw_point as enum ('day_0', 'day_90', 'interim', 'followup');

create type result_flag as enum ('low', 'normal', 'high', 'critical_low', 'critical_high');

create type payment_plan as enum ('paid_in_full', 'two_payments', 'three_payments');

create type payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'void');

create type question_kind as enum (
  'single_select', 'multi_select', 'scale', 'number', 'text', 'boolean', 'date'
);

-- ---------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at is
  'Attach as a BEFORE UPDATE trigger to maintain updated_at.';
