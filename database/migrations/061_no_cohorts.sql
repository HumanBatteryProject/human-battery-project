-- 061: remove the cohort concept from membership. Ruled 26 September.
--
-- THE RULING, and why it changes the schema rather than only the wording.
-- There are no cohorts. Every participant is an N of 1. The 1st and the 15th
-- exist for one reason: to give a person enough time to get their labs drawn
-- before day 0. They are start dates, not groups, and nothing about the program
-- compares one participant to another.
--
-- The old schema disagreed in a way that had already broken something. memberships
-- was NOT NULL on cohort_id and UNIQUE on (client_id, cohort_id), which encodes
-- "a person belongs to exactly one wave". Cycle chaining then could not create
-- cycle 2, because the second cycle would have been the same person in the same
-- wave. That defect was found by the smoke test on Day 1 and left open pending
-- this ruling. Removing the concept is what fixes it.
--
-- WHAT REPLACES IT. A membership belongs to a participant, has a start date
-- (day_zero) and a cycle number, and cycle 2 is a new row for the same
-- participant with the next start date. The invariant that actually matters is
-- one membership per participant per cycle.

begin;

-- 1. The constraint that made cycle 2 impossible.
alter table memberships drop constraint if exists memberships_client_id_cohort_id_key;

-- 2. The invariant that is true.
alter table memberships drop constraint if exists memberships_client_cycle_key;
alter table memberships add constraint memberships_client_cycle_key unique (client_id, cycle);

-- 3. The view has to stop selecting the column before the column can go.
drop view if exists participant_memberships;

-- 3b. A policy on cohorts depended on the column: "a member may read the cohort
--     they belong to". With no cohorts that sentence has no meaning, and it is
--     what blocked the column drop. cohorts is deprecated and becomes staff only.
--     A member has nothing to read there.
drop policy if exists cohorts_read on cohorts;
create policy cohorts_read on cohorts for select using (is_staff());

-- 4. And the column itself. Made to go rather than made nullable: a nullable
--    cohort_id is the concept still sitting there waiting to be used again, and
--    the next person to write an insert would fill it in.
alter table memberships drop column if exists cohort_id;

-- 5. Rebuilt without it. security_invoker per 053, because a view without it
--    reads its base table with the owner's rights and ignores row level security.
create view participant_memberships with (security_invoker = on) as
  select id, client_id, pod_id, status, day_zero, completed_on, withdrawn_on,
         withdrawn_reason, created_at, updated_at, arm, baseline_start, tier,
         tier_assigned_at, tier_assigned_by, cycle, intensity_multiplier,
         previous_membership_id, omega3_kit_posted_at, day_zero_deferrals,
         omega3_baseline_waived_at, omega3_collected_on, onboarded_at,
         completion_summary_id, panel_id, is_internal
    from memberships
   where is_internal = false;

comment on view participant_memberships is
  'Real participants only. Carries no cohort: there are none. Counts are by '
  'start date and by status.';

-- 6. Start dates, computed. This is what the cohorts table was really being used
--    for by the time it was used at all, and a function cannot drift from itself
--    the way twenty five rows can.
create or replace function program_start_dates(p_count integer default 6, p_from date default current_date)
returns setof date
language sql stable as $$
  with lead as (
    select coalesce((select value::int from program_settings where key = 'minimum_lead_days'), 14) as lead_days
  ),
  candidates as (
    select generate_series(date_trunc('month', p_from),
                           date_trunc('month', p_from) + interval '12 months',
                           interval '1 month')::date d
    union all
    select (generate_series(date_trunc('month', p_from),
                            date_trunc('month', p_from) + interval '12 months',
                            interval '1 month') + interval '14 days')::date
  )
  select c.d from candidates c, lead
   where c.d >= p_from + lead.lead_days
   order by c.d
   limit p_count;
$$;

comment on function program_start_dates is
  'The next N start dates: the 1st and the 15th, excluding any that do not leave '
  'minimum_lead_days for the labs to be drawn. Not a cohort list. The only '
  'reason the dates exist is the lead time.';

revoke execute on function program_start_dates(integer, date) from public;
revoke execute on function program_start_dates(integer, date) from anon;
grant execute on function program_start_dates(integer, date) to authenticated;
grant execute on function program_start_dates(integer, date) to service_role;

-- 7. The cohorts table stays only because applications.cohort_id and pods
--    reference it and both are historical. It governs nothing.
comment on table cohorts is
  'DEPRECATED, 061. There are no cohorts: every participant is an N of 1. This '
  'table no longer governs membership, pricing, or any count. Retained only '
  'because applications and pods still reference it. Use '
  'program_start_dates() for start dates and program_settings for price.';

commit;
