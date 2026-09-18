-- =====================================================================
-- 020  The Omega-3 kit gate
--
-- Why minimum_lead_days is 14 and not 28, written down so it does not
-- drift back:
--
--   The dried blood spot fixes the sample at collection. A result that
--   arrives later is not a less valid day 0 number. What has to be true
--   before day 1 is that the drop is on the card and the card is in the
--   mail, not that the result is back. The result lands during the first
--   two weeks and that is fine.
--
-- The Omega-3 Index is the most responsive marker on the panel. Starting
-- the protocol without a baseline means that comparison is gone for
-- good, and no amount of later testing recovers it. So if the kit has
-- not been posted by day 1, the client is offered a move to the next
-- wave rather than starting without it.
-- =====================================================================

alter table memberships
  add column if not exists omega3_kit_posted_at timestamptz,
  add column if not exists day_zero_deferrals   integer not null default 0;

comment on column memberships.omega3_kit_posted_at is
  'Client confirmation that the dried blood spot card is in the mail. The gate is posting, not the result.';
comment on column memberships.day_zero_deferrals is
  'How many times day zero moved because the kit was not posted in time.';

update program_settings
   set value = '14',
       description = 'Clear days between paying and day zero. The gate is the Omega-3 kit being collected and posted, not the result returning. The dried blood spot fixes the sample at collection.',
       updated_at = now()
 where key = 'minimum_lead_days';

-- ---------------------------------------------------------------------
-- Move a membership to the next wave after its current day zero.
-- Used when day 1 arrives and the kit has not been posted.
-- ---------------------------------------------------------------------
create or replace function defer_day_zero(p_membership_id uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  current_zero date;
  new_zero     date;
  wave_id      uuid;
begin
  select day_zero into current_zero from memberships where id = p_membership_id;
  if current_zero is null then
    raise exception 'membership % has no day_zero to defer', p_membership_id;
  end if;

  -- The next wave strictly after the current one. Lead time does not
  -- apply here; the person has already been waiting.
  if extract(day from current_zero) < 15 then
    new_zero := (date_trunc('month', current_zero) + interval '14 days')::date;
  else
    new_zero := (date_trunc('month', current_zero) + interval '1 month')::date;
  end if;

  select id into wave_id from cohorts where starts_on = new_zero limit 1;

  update memberships
     set day_zero        = new_zero,
         cohort_id       = coalesce(wave_id, cohort_id),
         day_zero_deferrals = day_zero_deferrals + 1,
         updated_at      = now()
   where id = p_membership_id;

  return new_zero;
end;
$$;

comment on function defer_day_zero(uuid) is
  'Moves a membership to the next wave when the Omega-3 kit was not posted before day 1.';

revoke all on function defer_day_zero(uuid) from public;
grant execute on function defer_day_zero(uuid) to authenticated;
