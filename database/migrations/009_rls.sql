-- =====================================================================
-- 009  Row-level security
--
-- "Each client sees only their own rows" is enforced here, at the
-- database, rather than in application code that has to be got right on
-- every query. A missed WHERE clause in a route handler becomes a
-- rejected query instead of a data leak.
--
-- Rules:
--   client  -> own rows only
--   coach   -> own rows, plus clients in a pod they lead
--   admin   -> everything
--   service key bypasses RLS entirely (used by server-side functions)
-- =====================================================================

alter table profiles            enable row level security;
alter table cohorts             enable row level security;
alter table pods                enable row level security;
alter table memberships         enable row level security;
alter table consent_documents   enable row level security;
alter table client_consents     enable row level security;
alter table demographics        enable row level security;
alter table questions           enable row level security;
alter table intake_responses    enable row level security;
alter table measurements        enable row level security;
alter table foods               enable row level security;
alter table exercises           enable row level security;
alter table circadian_practices enable row level security;
alter table lab_markers         enable row level security;
alter table recipes             enable row level security;
alter table recipe_items        enable row level security;
alter table daily_logs          enable row level security;
alter table log_foods           enable row level security;
alter table log_exercises       enable row level security;
alter table log_practices       enable row level security;
alter table log_behaviors       enable row level security;
alter table lab_panels          enable row level security;
alter table lab_results         enable row level security;
alter table score_methods       enable row level security;
alter table battery_scores      enable row level security;
alter table applications        enable row level security;
alter table payments            enable row level security;
alter table coach_notes         enable row level security;
alter table audit_log           enable row level security;
alter table data_requests       enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_self_read on profiles
  for select using (id = auth.uid() or is_staff());

create policy profiles_self_update on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_all on profiles
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Reference data — readable by every signed-in user, writable by admin
-- ---------------------------------------------------------------------
create policy foods_read on foods for select using (auth.uid() is not null);
create policy foods_admin on foods for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy exercises_read on exercises for select using (auth.uid() is not null);
create policy exercises_admin on exercises for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy practices_read on circadian_practices for select using (auth.uid() is not null);
create policy practices_admin on circadian_practices for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy markers_read on lab_markers for select using (auth.uid() is not null);
create policy markers_admin on lab_markers for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy recipes_read on recipes for select using (auth.uid() is not null);
create policy recipes_admin on recipes for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy recipe_items_read on recipe_items for select using (auth.uid() is not null);
create policy recipe_items_admin on recipe_items for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy questions_read on questions for select using (auth.uid() is not null);
create policy questions_admin on questions for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy consent_docs_read on consent_documents for select using (auth.uid() is not null);
create policy consent_docs_admin on consent_documents for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy score_methods_read on score_methods for select using (auth.uid() is not null);
create policy score_methods_admin on score_methods for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Cohorts and pods
-- ---------------------------------------------------------------------
create policy cohorts_read on cohorts
  for select using (
    is_staff()
    or exists (select 1 from memberships m
               where m.cohort_id = cohorts.id and m.client_id = auth.uid())
  );
create policy cohorts_admin on cohorts for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy pods_read on pods
  for select using (
    is_staff()
    or exists (select 1 from memberships m
               where m.pod_id = pods.id and m.client_id = auth.uid())
  );
create policy pods_admin on pods for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------
create policy memberships_read on memberships
  for select using (can_view_client(client_id));
create policy memberships_admin on memberships for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Consent — a client may grant and withdraw their own; nobody edits it
-- on their behalf except an admin.
-- ---------------------------------------------------------------------
create policy consents_read on client_consents
  for select using (can_view_client(client_id));
create policy consents_insert_self on client_consents
  for insert with check (client_id = auth.uid());
create policy consents_withdraw_self on client_consents
  for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy consents_admin on client_consents for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Client-owned records: read by self or assigned coach, written by self
-- ---------------------------------------------------------------------
create policy demographics_read on demographics
  for select using (can_view_client(client_id));
create policy demographics_write on demographics
  for all using (client_id = auth.uid() or current_role_is('admin'))
  with check (client_id = auth.uid() or current_role_is('admin'));

create policy intake_read on intake_responses
  for select using (can_view_client(client_id));
create policy intake_write on intake_responses
  for all using (client_id = auth.uid() or current_role_is('admin'))
  with check (client_id = auth.uid() or current_role_is('admin'));

create policy measurements_read on measurements
  for select using (can_view_client(client_id));
create policy measurements_write on measurements
  for all using (client_id = auth.uid() or is_staff())
  with check (client_id = auth.uid() or is_staff());

-- ---------------------------------------------------------------------
-- Daily log
-- ---------------------------------------------------------------------
create policy daily_logs_read on daily_logs
  for select using (can_view_client(client_id));
create policy daily_logs_write on daily_logs
  for all using (client_id = auth.uid() or current_role_is('admin'))
  with check (client_id = auth.uid() or current_role_is('admin'));

-- Child tables inherit access through their parent log.
create policy log_foods_access on log_foods
  for all using (
    exists (select 1 from daily_logs d
            where d.id = log_foods.daily_log_id and can_view_client(d.client_id))
  )
  with check (
    exists (select 1 from daily_logs d
            where d.id = log_foods.daily_log_id and d.client_id = auth.uid())
  );

create policy log_exercises_access on log_exercises
  for all using (
    exists (select 1 from daily_logs d
            where d.id = log_exercises.daily_log_id and can_view_client(d.client_id))
  )
  with check (
    exists (select 1 from daily_logs d
            where d.id = log_exercises.daily_log_id and d.client_id = auth.uid())
  );

create policy log_practices_access on log_practices
  for all using (
    exists (select 1 from daily_logs d
            where d.id = log_practices.daily_log_id and can_view_client(d.client_id))
  )
  with check (
    exists (select 1 from daily_logs d
            where d.id = log_practices.daily_log_id and d.client_id = auth.uid())
  );

create policy log_behaviors_access on log_behaviors
  for all using (
    exists (select 1 from daily_logs d
            where d.id = log_behaviors.daily_log_id and can_view_client(d.client_id))
  )
  with check (
    exists (select 1 from daily_logs d
            where d.id = log_behaviors.daily_log_id and d.client_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- Labs — clients read their own, staff enter them
-- ---------------------------------------------------------------------
create policy lab_panels_read on lab_panels
  for select using (can_view_client(client_id));
create policy lab_panels_staff_write on lab_panels
  for all using (is_staff()) with check (is_staff());

create policy lab_results_read on lab_results
  for select using (
    exists (select 1 from lab_panels p
            where p.id = lab_results.panel_id and can_view_client(p.client_id))
  );
create policy lab_results_staff_write on lab_results
  for all using (is_staff()) with check (is_staff());

create policy battery_scores_read on battery_scores
  for select using (can_view_client(client_id));
create policy battery_scores_staff_write on battery_scores
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- Coach notes — staff only. A client must never read these.
-- ---------------------------------------------------------------------
create policy coach_notes_staff on coach_notes
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- Payments — client reads own, admin manages
-- ---------------------------------------------------------------------
create policy payments_read on payments
  for select using (client_id = auth.uid() or current_role_is('admin'));
create policy payments_admin on payments for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Applications, audit, data requests — admin only through the API.
-- The waitlist function writes with the service key, bypassing RLS.
-- ---------------------------------------------------------------------
create policy applications_admin on applications for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

create policy audit_admin on audit_log for select
  using (current_role_is('admin'));

create policy data_requests_read on data_requests
  for select using (client_id = auth.uid() or current_role_is('admin'));
create policy data_requests_admin on data_requests for all
  using (current_role_is('admin')) with check (current_role_is('admin'));
