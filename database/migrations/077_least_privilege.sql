-- 077: two real privilege defects, found by the Day 11 security pass.
-- Part G: cross-user isolation, server-side authorization, least privilege.
--
-- ============================================================
-- DEFECT ONE: A PARTICIPANT COULD MAKE THEMSELVES AN ADMIN.
-- ============================================================
-- Reachable, proved, and the most serious kind there is. The policy was:
--
--   profiles_self_update  for update  using (id = auth.uid()) with check (id = auth.uid())
--
-- which says a person may update their own row and says NOTHING ABOUT WHICH
-- COLUMNS. profiles.role is a column on that row. So one PATCH through the same
-- public API the portal uses, setting role to 'admin', succeeded: an ordinary
-- client became an admin, and can_view_client returns true for an admin, which
-- means every other participant's records became readable in the same instant.
--
-- Row level security decides WHICH ROWS. It does not decide which columns. That
-- is what column privileges are for, and nothing had ever set them, so the
-- blanket UPDATE grant covered every column including this one.
--
-- WHY THIS IS NOT FIXED WITH A BETTER POLICY. Postgres policies cannot see which
-- columns an UPDATE touched, so a WITH CHECK cannot say "unless they changed
-- role". A trigger can, and there is one below as well, but the boundary belongs
-- in the grant: a right never given cannot be checked for incorrectly.
--
-- AND WHY ADMINS LOSE THE COLUMN TOO. Members and admins are the same Postgres
-- role, 'authenticated'. Admin-ness is a value in this very column, read by RLS.
-- So a column privilege cannot distinguish them, and revoking the column from
-- authenticated revokes it from admins as well. Role changes therefore move to an
-- audited function, which is where a privilege change belonged anyway: "the tier
-- changed" and "the tier changed, from this to that, by this person, at this
-- time" are different records, and only the second answers a question later.

revoke update on profiles from authenticated;

-- Exactly the columns a person edits about themselves. account.html writes
-- full_name and state; phone is included because it is theirs to correct.
-- Everything else is either identity (id, email, role), lifecycle (is_active,
-- created_at, updated_at) or DERIVED (latitude, hemisphere, region,
-- tz_confidence, postal_code, timezone, country). The derived ones matter: season
-- and light timing are computed from latitude and hemisphere, so a member who
-- could set their own latitude could quietly move their own protocol.
grant update (full_name, phone, state) on profiles to authenticated;

-- Belt and braces, and a clear message rather than a permission error, for any
-- path that reaches the column another way: a future grant, a definer function
-- written without thinking, or service_role used carelessly from a server route.
create or replace function profiles_guard_role()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.role is distinct from old.role then
    -- set_client_role is the only sanctioned path, and it sets this flag.
    if coalesce(current_setting('hbp.role_change_authorised', true), '') <> 'yes' then
      raise exception
        'role cannot be changed by a direct update. Use set_client_role, which records who did it and why.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $fn$;

revoke execute on function profiles_guard_role() from public;
revoke execute on function profiles_guard_role() from anon;

drop trigger if exists profiles_guard_role_trg on profiles;
create trigger profiles_guard_role_trg
  before update of role on profiles
  for each row execute function profiles_guard_role();

-- The sanctioned path. Admin only, audited, and it records what the role WAS.
create or replace function set_client_role(p_client uuid, p_role app_role, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare was app_role;
begin
  if not current_role_is('admin') then
    raise exception 'only an admin may change a role' using errcode = '42501';
  end if;
  if p_client = auth.uid() then
    -- An admin editing their own role is how an account is locked out of itself,
    -- and it is also how a compromised admin session would entrench.
    raise exception 'an admin cannot change their own role' using errcode = '42501';
  end if;

  select role into was from profiles where id = p_client;
  if was is null then
    raise exception 'no such profile' using errcode = 'P0002';
  end if;

  perform set_config('hbp.role_change_authorised', 'yes', true);
  update profiles set role = p_role, updated_at = now() where id = p_client;
  perform set_config('hbp.role_change_authorised', '', true);

  perform admin_audit('profile.role_changed', 'profiles', p_client, p_client,
                      jsonb_build_object('role', was),
                      jsonb_build_object('role', p_role), p_reason);

  return jsonb_build_object('ok', true, 'client_id', p_client,
                            'was', was, 'now', p_role);
end $fn$;

revoke execute on function set_client_role(uuid, app_role, text) from public;
revoke execute on function set_client_role(uuid, app_role, text) from anon;
grant execute on function set_client_role(uuid, app_role, text) to authenticated, service_role;

-- ============================================================
-- DEFECT TWO: EVERY SIGNED-IN USER HELD TRUNCATE ON ALL 77 TABLES.
-- ============================================================
-- PRESENT AND PROVED, NOT CURRENTLY REACHABLE, and both halves of that matter.
--
-- Proved: acting as the authenticated role, TRUNCATE client_consents CASCADE
-- emptied client_consents, entitlements, weekly_plans and payments, and a second
-- statement emptied lab_results. Inside a transaction that was rolled back, so
-- nothing was lost.
--
-- ROW LEVEL SECURITY DOES NOT APPLY TO TRUNCATE. Every policy in this database
-- restricts which ROWS a person may see or change, and TRUNCATE does not operate
-- on rows: it empties the table. So the careful per-row isolation on 77 tables was
-- sitting next to a grant that ignored all of it.
--
-- Not reachable today because nothing exposes raw SQL to the authenticated role:
-- the portal goes through PostgREST, which has no TRUNCATE, and a direct Postgres
-- connection needs database credentials rather than a JWT. So this was a standing
-- capability waiting for one new RPC or one SQL-executing endpoint to become a way
-- for any participant to empty the database. That is worth removing on its own.
--
-- TRIGGER and REFERENCES go too, by the same principle. TRIGGER is the weaker of
-- the two: it was already useless because authenticated cannot create a function
-- in this schema, which I checked rather than assumed ("permission denied for
-- schema public"). REFERENCES lets a foreign key be pointed at a table, which
-- constrains what the referenced table may delete.
--
-- SELECT, INSERT, UPDATE and DELETE stay, because those ARE filtered by row level
-- security and are how the portal works.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from authenticated', t.tablename);
    execute format('revoke truncate, trigger, references on public.%I from anon', t.tablename);
  end loop;
end $$;

-- And for every table created from now on, so this does not come back the next
-- time a migration adds one.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated;
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon;

-- The five views as well. pg_tables lists only tables, so the first pass left
-- them holding TRUNCATE, TRIGGER and REFERENCES. None of the three means anything
-- on a view, but a grant that means nothing today is still a grant somebody has to
-- reason about later, and "why do the views have TRUNCATE" is not a question worth
-- anybody's time.
do $$
declare v record;
begin
  for v in select viewname from pg_views where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from authenticated', v.viewname);
    execute format('revoke truncate, trigger, references on public.%I from anon', v.viewname);
  end loop;
end $$;
