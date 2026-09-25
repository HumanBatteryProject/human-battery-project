-- 046: seasonality, at the resolution the source actually has.
--
-- WHAT THE SOURCE GIVES, AND WHAT IT DOES NOT.
-- Brief 06A A6 asks for seasonality "by US region and month". The stated
-- source, the USDA SNAP-Ed Seasonal Produce Guide, is organised by SEASON and
-- is NATIONAL. It has no region and no month, and it says so on its own front
-- page: "Seasonal produce in your area will vary by growing conditions and
-- weather."
--
-- So the table holds region and month columns, because state extension guides
-- do carry that and can be loaded later, and the rows loaded today say
-- region = 'US' and carry a season rather than a month. The precision the
-- source has is recorded; the precision it does not have is left null rather
-- than invented, which is the whole instruction.
--
-- A food with no sourced entry is NOT in this table. It is reported as
-- unknown, and unknown is shown to the member as unknown. An empty table
-- presented as "nothing is in season" would be a lie told by omission.

create table if not exists food_seasonality (
  id           uuid primary key default gen_random_uuid(),
  food         text not null,
  source_name  text not null,
  source_url   text not null,
  region       text not null default 'US',
  season       text check (season in ('spring','summer','fall','winter')),
  month        smallint check (month between 1 and 12),
  retrieved_on date not null,
  note         text,
  unique (food, region, season, month)
);

comment on table food_seasonality is
  'One row per food per region per season, from a NAMED source with the date '
  'it was retrieved. Nothing is inferred: a food absent from this table is '
  'unknown, and unknown is shown as unknown rather than as out of season.';

comment on column food_seasonality.month is
  'Null for a season-level source. The USDA SNAP-Ed guide is season-level and '
  'national, so every row loaded from it has a season and no month. State '
  'extension guides carry months and would populate this.';

create index if not exists food_seasonality_lookup
  on food_seasonality (region, season);

-- The member's region, derived at intake from the postal code. Coarse on
-- purpose: a state is enough to pick a seasonal list and an extension guide,
-- and nothing here needs an address.
alter table profiles add column if not exists region text;
comment on column profiles.region is
  'US state code, derived from the postal code at intake. Used to choose a '
  'seasonal list and a state extension guide. Never a street address.';
