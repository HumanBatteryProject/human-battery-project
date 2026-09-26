-- 062: the participant's FIRST start date, as one function.
--
-- The founding price is a date window on the participant's first start date.
-- With cycle chaining, a person has several memberships with several day_zeros,
-- so "their start date" is ambiguous at exactly the moment money depends on it.
-- Passing cycle 3's day_zero to the founding window check would re-qualify
-- somebody for a founding price years later.
--
-- One function, so there is one answer.

create or replace function first_start_date(target_client uuid)
returns date
language sql stable as $$
  select day_zero from memberships
   where client_id = target_client and day_zero is not null
   order by cycle asc, day_zero asc
   limit 1;
$$;

comment on function first_start_date is
  'The day_zero of the participant''s FIRST cycle. The founding price window is '
  'measured against this and never against a later cycle, or a person would '
  'qualify again every time they continued.';

revoke execute on function first_start_date(uuid) from public;
revoke execute on function first_start_date(uuid) from anon;
grant execute on function first_start_date(uuid) to service_role;
grant execute on function first_start_date(uuid) to authenticated;
