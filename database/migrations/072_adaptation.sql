-- 072: follow-through and adaptation. Part I Day 6, master prompt D5.
--
-- D5 asks for five things on the next check-in: review prior actions, ask about
-- barriers, SIMPLIFY AN OVERWHELMING PLAN, update suggestions within approved
-- rules, and retain an auditable record of what changed and why.
--
-- THE BOUNDARY THIS MUST NOT CROSS, stated because the two look similar and one
-- of them is gated. Choosing which APPROVED rule appears in today's plan is
-- adaptation and D5 permits it. Changing a protocol PARAMETER, the eating window
-- or the sauna dose, is a protocol change: AUTONOMY_MODE is review_all, so the
-- trend agent queues those for the owner and nothing here may do it. Adaptation
-- reorders and withholds from a list a human approved. It never edits the list.

-- A barrier and a plan that is too big are real reasons to withhold a rule, and
-- neither fits the five bases that existed. Recorded as their own basis so the
-- admin screen can tell "we held this back because you told us why you could
-- not" apart from "this is contraindicated".
alter table plan_exclusions drop constraint if exists plan_exclusions_basis_check;
alter table plan_exclusions add constraint plan_exclusions_basis_check
  check (basis in ('contraindication','screening','eligibility','coverage',
                   'stop_condition','barrier','budget'));

-- What changed since the last plan, and why, in a queryable form. audit_log gets
-- a row too, but a jsonb column on the plan is what the member's own screen and
-- the admin screen can read without trawling the audit table.
alter table daily_plans
  add column if not exists adaptations jsonb not null default '[]'::jsonb,
  add column if not exists action_budget smallint;

comment on column daily_plans.adaptations is
  'What changed since the previous plan and why, as a list of {change, reason, '
  'rule_key}. D5 requires an auditable record; this is the queryable half of it '
  'and audit_log carries the rest.';
comment on column daily_plans.action_budget is
  'How many actions this plan was allowed. Falls to 1 when somebody is skipping '
  'most of what they are given: a plan a person cannot hold is a plan they '
  'abandon, so the answer to being overwhelmed is fewer actions, not the same '
  'number reworded.';

-- Adherence over a window, computed in one place so the planner, the weekly
-- review and the admin screen cannot disagree about what adherence means.
create or replace function adherence_window(target_client uuid, days integer default 14)
returns table (total integer, completed integer, skipped integer, adjusted integer,
               answered integer, rate numeric)
language sql stable as $$
  with a as (
    select pa.status
      from plan_actions pa
      join daily_plans dp on dp.id = pa.plan_id
     where dp.client_id = target_client
       and dp.plan_date >= (current_date - days)
  )
  select count(*)::integer,
         count(*) filter (where status = 'complete')::integer,
         count(*) filter (where status = 'skip')::integer,
         count(*) filter (where status = 'adjust')::integer,
         count(*) filter (where status <> 'pending')::integer,
         -- Of the actions they ANSWERED, how many did they do. An unanswered
         -- action is not a failure: it is silence, and counting silence as a
         -- skip would shrink a plan for somebody who simply has not opened the
         -- app yet.
         case when count(*) filter (where status <> 'pending') = 0 then null
              else round(count(*) filter (where status = 'complete')::numeric
                         / count(*) filter (where status <> 'pending'), 3) end
    from a;
$$;

comment on function adherence_window is
  'Adherence over the last N days, as completed over ANSWERED. Silence is not '
  'counted as a skip: a participant who has not opened the app has not failed at '
  'anything, and treating that as non adherence would cut their plan for it. '
  'Returns a null rate when nothing has been answered, which is different from 0.';

revoke execute on function adherence_window(uuid, integer) from public;
revoke execute on function adherence_window(uuid, integer) from anon;
grant execute on function adherence_window(uuid, integer) to authenticated, service_role;
