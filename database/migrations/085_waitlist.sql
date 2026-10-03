-- 085: the waitlist.
--
-- Applying is on hold. People still answer the placement questions, but what
-- happens next is a waitlist entry and an email, not an application, not a
-- portal account and not a payment.
--
-- WHY A SEPARATE TABLE AND NOT A STATUS ON applications. An application is a
-- request to join that something downstream acts on: it has a cohort, a
-- converted_client_id, a panel, a suggested tier that the onboarding agent
-- reads. A waitlist entry is a name and an answer sheet that nothing acts on
-- until a human decides to open a group. Putting them in one table means every
-- query that looks for applicants has to remember to exclude the waitlist, and
-- the first one that forgets creates a member who never applied.

begin;

create table if not exists waitlist (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null check (length(btrim(first_name)) between 1 and 80),
  last_name     text not null check (length(btrim(last_name))  between 1 and 80),
  email         text not null check (position('@' in email) > 1),
  -- The seven placement answers, exactly as the form sends them, plus the tier
  -- the database suggests from them. Stored as given so a later reading of the
  -- answers cannot disagree with the suggestion made at the time.
  placement         jsonb not null default '{}'::jsonb,
  placement_version text,
  suggested_tier    program_tier,
  -- Where they are, for the group they eventually join and for nothing else.
  state         text,
  postal_code   text,
  country       text,
  timezone      text,
  source        text,
  consent_contact    boolean not null default false,
  consent_version    text,
  ip            text,
  notified_at   timestamptz,          -- when we emailed them that a group opened
  converted_application_id uuid references applications(id),
  joined_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- One entry per person. A second attempt updates rather than piling up, which is
-- what the apply form already does for applications.
create unique index if not exists waitlist_one_per_email on waitlist (lower(email));
create index if not exists waitlist_joined_idx on waitlist (joined_at desc);

-- ROW LEVEL SECURITY FROM THE MIGRATION THAT CREATES THE TABLE, not added later.
-- The portal talks to Supabase from the browser, so RLS is the server side.
alter table waitlist enable row level security;
alter table waitlist force row level security;

-- No policy for anon and none for authenticated. A waitlist entry is a list of
-- people who have not joined anything: there is no member it belongs to, so
-- there is no participant who should ever read it. Only the service role, which
-- bypasses RLS, and staff through an explicit policy.
drop policy if exists waitlist_staff_read on waitlist;
create policy waitlist_staff_read on waitlist for select
  using (current_role_is('admin'));

drop policy if exists waitlist_staff_write on waitlist;
create policy waitlist_staff_write on waitlist for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- The anon key must hold nothing at all on this table, not even a grant that a
-- policy would then have to refuse.
revoke all on waitlist from anon, authenticated;
grant select, insert, update, delete on waitlist to service_role;

comment on table waitlist is
  'People who answered the placement questions while applying is closed. No '
  'portal account, no tier email, no payment, and the onboarding agent does not '
  'run for these rows. Created by migration 085.';

commit;
