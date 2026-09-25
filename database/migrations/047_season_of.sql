-- 047: which season it is, for a member, computed hemisphere-aware.
--
-- The naive version keys on month alone, which is right for half the planet
-- and exactly six months wrong for the other half. A member in Sydney in
-- January is in high summer, and a seasonal list that hands them winter squash
-- is not a small error: it is the feature telling them something false about
-- the place they live.
--
-- Hemisphere is stored rather than derived from the sign of the latitude at
-- every call site, because a call site that forgets is silently wrong.

create or replace function season_of(d date, hemi text default 'N')
returns text
language sql immutable as $$
  select case
    when upper(coalesce(hemi,'N')) = 'S' then
      case extract(month from d)::int
        when 12 then 'summer' when 1 then 'summer' when 2 then 'summer'
        when 3 then 'fall'   when 4 then 'fall'   when 5 then 'fall'
        when 6 then 'winter' when 7 then 'winter' when 8 then 'winter'
        else 'spring' end
    else
      case extract(month from d)::int
        when 12 then 'winter' when 1 then 'winter' when 2 then 'winter'
        when 3 then 'spring' when 4 then 'spring' when 5 then 'spring'
        when 6 then 'summer' when 7 then 'summer' when 8 then 'summer'
        else 'fall' end
  end
$$;

comment on function season_of is
  'Meteorological seasons, hemisphere aware. A member in the southern '
  'hemisphere in January is in summer, not winter, and a seasonal list that '
  'gets that backwards tells them something false about where they live.';

-- What is in season for a member right now, with the source attached so the
-- screen can say where the claim comes from.
create or replace function in_season_for(client uuid, on_date date default current_date)
returns table (food text, season text, source_name text, source_url text, retrieved_on date)
language sql stable as $$
  select s.food, s.season, s.source_name, s.source_url, s.retrieved_on
    from profiles p
    join food_seasonality s
      on s.season = season_of(on_date, coalesce(p.hemisphere, 'N'))
     and s.region = 'US'
   where p.id = client
   order by s.food
$$;
