-- 053: close the anon hole. Part G, ruled on 25 September.
--
-- WHAT WAS WRONG, measured rather than assumed.
-- The anon key is published in public/portal/config.js, which is correct: it is
-- designed to be public, and row level security is what makes that safe. On six
-- tables row level security was never switched on, and both PostgREST roles
-- held every privilege including TRUNCATE. A plain GET carrying only the
-- published key returned real participant laboratory values with a client_id
-- attached. No session, no password, no staff role.
--
-- THREE FURTHER HOLES OF THE SAME CLASS, found by asking what else could be
-- true rather than by fixing only what was reported:
--
--   1. All five views are owned by postgres and none sets security_invoker, so
--      each one reads its base tables with the owner's rights and bypasses row
--      level security completely. They return nothing TODAY only because the
--      single member is internal and participant_memberships filters
--      is_internal = false. None of them filters by identity. The first real
--      participant would have been readable by anyone holding the published key.
--      This was safe by accident, not by design.
--
--   2. Default privileges in this schema grant anon every DML privilege on
--      every table created in future. Revoking today without changing that
--      means migration 054 reopens the hole and nothing says so.
--
--   3. Eleven SECURITY DEFINER functions were executable by anon. Each one was
--      tested and each defends itself (is_staff() returns false, my_program_tier
--      returns null, verify_client_result answers "Staff only."), so none was
--      exploitable. A function that bypasses row level security by design is
--      still not something the anonymous role needs to reach.
--
-- WHAT anon LEGITIMATELY NEEDS: nothing. Every page that runs before sign-in,
-- login.html and confirm.html, uses only the auth endpoints and reads no table.
-- Verified by enumerating every from() and rpc() call in public/.

begin;

-- ---------------------------------------------------------------------
-- 1. Row level security on the two tables holding participant data.
--    Same shape as lab_results: the participant reads their own, staff read all,
--    staff write. The service key bypasses all of this, which is how the
--    /api endpoints keep working.
-- ---------------------------------------------------------------------
alter table lab_results_held enable row level security;

drop policy if exists held_read on lab_results_held;
create policy held_read on lab_results_held for select
  using (can_view_client(client_id));

drop policy if exists held_staff_write on lab_results_held;
create policy held_staff_write on lab_results_held for all
  using (is_staff()) with check (is_staff());

alter table completion_summaries enable row level security;

drop policy if exists completion_read on completion_summaries;
create policy completion_read on completion_summaries for select
  using (can_view_client(client_id));

drop policy if exists completion_staff_write on completion_summaries;
create policy completion_staff_write on completion_summaries for all
  using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- 2. Row level security on the four reference tables. These hold no
--    participant data, so the rule is the same as lab_markers: any signed in
--    person may read, only an admin may write. They are not left open, because
--    "it is only reference data" is how a table stops being audited.
-- ---------------------------------------------------------------------
alter table food_seasonality    enable row level security;
alter table lab_panel_defs      enable row level security;
alter table lab_panel_markers   enable row level security;
alter table protocol_parameters enable row level security;

drop policy if exists seasonality_read on food_seasonality;
create policy seasonality_read on food_seasonality for select using (auth.uid() is not null);
drop policy if exists seasonality_admin on food_seasonality;
create policy seasonality_admin on food_seasonality for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

drop policy if exists panel_defs_read on lab_panel_defs;
create policy panel_defs_read on lab_panel_defs for select using (auth.uid() is not null);
drop policy if exists panel_defs_admin on lab_panel_defs;
create policy panel_defs_admin on lab_panel_defs for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

drop policy if exists panel_markers_read on lab_panel_markers;
create policy panel_markers_read on lab_panel_markers for select using (auth.uid() is not null);
drop policy if exists panel_markers_admin on lab_panel_markers;
create policy panel_markers_admin on lab_panel_markers for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

drop policy if exists protocol_params_read on protocol_parameters;
create policy protocol_params_read on protocol_parameters for select using (auth.uid() is not null);
drop policy if exists protocol_params_admin on protocol_parameters;
create policy protocol_params_admin on protocol_parameters for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- 3. Make every view honour the row level security of its base tables.
--    Without security_invoker a view is a hole with a name on it.
-- ---------------------------------------------------------------------
alter view participant_memberships set (security_invoker = on);
alter view participant_proposals   set (security_invoker = on);
alter view marker_deltas           set (security_invoker = on);
alter view score_progress          set (security_invoker = on);
alter view functional_progress     set (security_invoker = on);

-- ---------------------------------------------------------------------
-- 4. Strip anon. It needs no table, no view, no sequence and no function.
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all routines  in schema public from anon;

-- ---------------------------------------------------------------------
-- 5. And stop the hole reopening. Without this, the next migration grants
--    anon full DML on whatever it creates and nothing reports it.
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

commit;
