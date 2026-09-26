-- 065: suspension blocks every program surface, enforced in row level security.
--
-- The ruling: "every gate in the product checks the entitlement server-side, so
-- nothing is reachable while suspended."
--
-- WHY RLS AND NOT A CHECK IN EACH ENDPOINT. A check per endpoint is a list of
-- places to remember, and the next screen added is the one that forgets. The
-- portal talks to the database directly from the browser, so a policy is the
-- server side, and it cannot be bypassed by calling a different path. A
-- suspended participant asking for their briefs gets an empty result from
-- Postgres, not a redirect that a determined person could skip.
--
-- WHAT STAYS REACHABLE, deliberately. Suspension is not deletion:
--   profiles, client_consents, consent_documents  account management
--   payments, entitlements, weekly_plans          so they can see what is owed
--   lab_results, lab_panels, measurements,        their own records, because
--     functional_tests, daily_logs                D9 says export is a right
-- What is gated is the PROGRAM: the briefs, the plans, the documents, the
-- recipes, the food and seasonal data, the practices.

begin;

-- The daily brief.
drop policy if exists morning_briefs_read on morning_briefs;
create policy morning_briefs_read on morning_briefs for select
  using (can_view_client(client_id) and (is_staff() or has_program_access(client_id)));

-- The daily plan and its actions.
drop policy if exists daily_plans_own on daily_plans;
create policy daily_plans_own on daily_plans for select
  using (can_view_client(client_id) and (is_staff() or has_program_access(client_id)));

drop policy if exists plan_actions_own on plan_actions;
create policy plan_actions_own on plan_actions for select
  using (exists (select 1 from daily_plans p
                  where p.id = plan_id and can_view_client(p.client_id)
                    and (is_staff() or has_program_access(p.client_id))));

drop policy if exists plan_actions_member_respond on plan_actions;
create policy plan_actions_member_respond on plan_actions for update
  using (exists (select 1 from daily_plans p
                  where p.id = plan_id and can_view_client(p.client_id)
                    and (is_staff() or has_program_access(p.client_id))))
  with check (exists (select 1 from daily_plans p
                  where p.id = plan_id and can_view_client(p.client_id)
                    and (is_staff() or has_program_access(p.client_id))));

-- The weekly review.
drop policy if exists weekly_reviews_own on weekly_reviews;
create policy weekly_reviews_own on weekly_reviews for select
  using (can_view_client(client_id) and (is_staff() or has_program_access(client_id)));

-- The PDFs. program_documents already gated on is_enrolled(); access is now part
-- of being enrolled in the sense that matters.
drop policy if exists program_documents_read on program_documents;
create policy program_documents_read on program_documents for select
  using (retired_at is null
         and (is_staff()
              or (is_enrolled() and has_program_access(auth.uid()))));

-- The menus, recipes, foods, practices and seasonal data. These are the program's
-- content, not reference data a stranger should read.
drop policy if exists recipes_read on recipes;
create policy recipes_read on recipes for select
  using (is_staff() or has_program_access(auth.uid()));

drop policy if exists foods_read on foods;
create policy foods_read on foods for select
  using (is_staff() or has_program_access(auth.uid()));

drop policy if exists practices_read on circadian_practices;
create policy practices_read on circadian_practices for select
  using (is_staff() or has_program_access(auth.uid()));

drop policy if exists seasonality_read on food_seasonality;
create policy seasonality_read on food_seasonality for select
  using (is_staff() or has_program_access(auth.uid()));

-- The coach's corpus. A suspended participant must not be able to keep asking.
drop policy if exists knowledge_passages_read on knowledge_passages;
create policy knowledge_passages_read on knowledge_passages for select
  using (is_staff() or has_program_access(auth.uid()));

comment on function has_program_access is
  'The only question any PROGRAM surface should ask, and it is asked inside row '
  'level security rather than in application code so a new screen cannot forget '
  'it. Account management, consent and the participant''s own records are '
  'deliberately NOT gated on this: suspension is not deletion.';

commit;
