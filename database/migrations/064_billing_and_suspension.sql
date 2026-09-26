-- 064: installments, entitlement suspension, and the weekly recovery plan.
-- Ruled 26 September.
--
-- THE SHAPE OF THE POLICY, because it is unusual and the code has to match it
-- exactly. A failed installment does not end the program and does not delete
-- anything. It offers the participant the outstanding balance divided into weekly
-- payments, where EACH WEEKLY PAYMENT BUYS ONE WEEK OF ACCESS. So access is not a
-- boolean tied to "did they pay"; it is a date that moves forward one week at a
-- time. That is why entitlements gains access_through rather than a paid flag.
--
-- Declining the plan, or failing a weekly payment, suspends access to everything.
-- Suspension is not deletion: records are kept, and account management and export
-- stay available, because D9 says cancellation is not deletion and the same logic
-- applies with more force here.

begin;

-- ---------------------------------------------------------------------
-- 1. Entitlement state. There was a cancelled_at and an access_until but no
--    status, so "suspended" could not be expressed at all.
-- ---------------------------------------------------------------------
do $$ begin
  create type entitlement_status as enum ('active','suspended','cancelled','expired');
exception when duplicate_object then null; end $$;

alter table entitlements
  add column if not exists status entitlement_status not null default 'active',
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  -- The date access is paid through. Null means "not limited by a weekly plan",
  -- which is the normal case for someone whose installments are current.
  add column if not exists access_through date;

comment on column entitlements.access_through is
  'While a weekly recovery plan is running, the date access is paid through. '
  'Each weekly payment moves it forward seven days. Null means access is not '
  'limited this way, which is the normal case.';

comment on column entitlements.status is
  'active, suspended, cancelled or expired. A suspended entitlement blocks every '
  'program surface and deletes nothing. Every gate in the product asks '
  'has_program_access(), never a column directly, so there is one answer.';

-- A suspended entitlement must say when and why, or nobody can explain it to the
-- participant who is asking why they cannot sign in.
alter table entitlements drop constraint if exists suspension_is_explained;
alter table entitlements add constraint suspension_is_explained check (
  status <> 'suspended' or (suspended_at is not null and suspended_reason is not null));

-- ---------------------------------------------------------------------
-- 2. The weekly recovery plan.
-- ---------------------------------------------------------------------
do $$ begin
  create type weekly_plan_status as enum ('offered','accepted','declined','completed','failed');
exception when duplicate_object then null; end $$;

create table if not exists weekly_plans (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references profiles(id) on delete cascade,
  entitlement_id    uuid references entitlements(id) on delete set null,
  -- What was still owed when the installment failed.
  outstanding_cents integer not null check (outstanding_cents > 0),
  weekly_cents      integer not null check (weekly_cents > 0),
  weeks_total       smallint not null check (weeks_total > 0),
  weeks_paid        smallint not null default 0,
  status            weekly_plan_status not null default 'offered',
  offered_at        timestamptz not null default now(),
  -- Acceptance is explicit consent, per the ruling, so it is a timestamp and not
  -- an assumption drawn from the first successful charge.
  accepted_at       timestamptz,
  declined_at       timestamptz,
  closed_at         timestamptz,
  created_by        uuid references profiles(id),
  constraint accepted_plans_have_a_timestamp check (
    status <> 'accepted' or accepted_at is not null),
  constraint declined_plans_have_a_timestamp check (
    status <> 'declined' or declined_at is not null),
  constraint weekly_amounts_sum check (weekly_cents * weeks_total >= outstanding_cents)
);

create index if not exists weekly_plans_open_idx
  on weekly_plans (client_id) where status in ('offered','accepted');

comment on constraint weekly_amounts_sum on weekly_plans is
  'The weekly payments must cover the balance. The last one absorbs any remainder, '
  'so the product can be greater than the balance but never less: a plan that '
  'cannot clear the debt is not a plan.';

-- Weekly payments are payments. The enum needs a value for them so they are not
-- silently filed as one of the three program options.
do $$ begin
  alter type payment_plan add value if not exists 'weekly_recovery';
exception when duplicate_object then null; end $$;

alter table payments
  add column if not exists weekly_plan_id uuid references weekly_plans(id) on delete set null,
  -- Which week of the recovery plan this payment buys.
  add column if not exists week_no smallint,
  -- Set when a charge is attempted off session against the saved method, so a
  -- retry can be told apart from a first attempt.
  add column if not exists attempts smallint not null default 0,
  add column if not exists last_attempt_at timestamptz;

-- One row per installment per plan per participant. A replayed webhook or a
-- double run of the billing job must not create a second charge for the same
-- installment, and this is what makes that true rather than the job's care.
drop index if exists payments_one_per_installment;
create unique index payments_one_per_installment
  on payments (client_id, plan, installment_no)
  where weekly_plan_id is null;

create unique index if not exists payments_one_per_week
  on payments (weekly_plan_id, week_no)
  where weekly_plan_id is not null;

-- ---------------------------------------------------------------------
-- 3. The gate. ONE function, asked by every surface.
-- ---------------------------------------------------------------------
create or replace function has_program_access(target_client uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from entitlements e
     where e.client_id = target_client
       and e.status = 'active'
       and e.effective_from <= current_date
       and (e.effective_to is null or e.effective_to >= current_date)
       -- A weekly plan limits access to the week it bought.
       and (e.access_through is null or e.access_through >= current_date)
       -- A cancelled subscription keeps access to the end of the paid period.
       and (e.access_until is null or e.access_until >= current_date)
  );
$$;

comment on function has_program_access is
  'The only question any program surface should ask. Returns false for a '
  'suspended entitlement, for a weekly plan whose week has lapsed, and for a '
  'cancelled period that has ended. Account management and data export must NOT '
  'gate on this: suspension is not deletion and a participant keeps the right to '
  'their own records.';

revoke execute on function has_program_access(uuid) from public;
revoke execute on function has_program_access(uuid) from anon;
grant execute on function has_program_access(uuid) to authenticated;
grant execute on function has_program_access(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 4. Suspend and restore, as functions, so every path audits identically.
-- ---------------------------------------------------------------------
create or replace function suspend_access(p_client uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not is_staff() and auth.uid() is not null then
    return jsonb_build_object('ok', false, 'message', 'Staff only.');
  end if;
  update entitlements
     set status = 'suspended', suspended_at = now(), suspended_reason = p_reason
   where client_id = p_client and status = 'active';
  get diagnostics v_n = row_count;
  insert into audit_log (actor_id, action, table_name, subject_id, detail)
  values (auth.uid(), 'entitlement.suspend', 'entitlements', p_client,
          jsonb_build_object('reason', p_reason, 'rows', v_n));
  return jsonb_build_object('ok', true, 'suspended', v_n);
end; $$;

create or replace function restore_access(p_client uuid, p_reason text default 'balance paid')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not is_staff() and auth.uid() is not null then
    return jsonb_build_object('ok', false, 'message', 'Staff only.');
  end if;
  update entitlements
     set status = 'active', suspended_at = null, suspended_reason = null,
         -- Clearing access_through ends the weekly limitation. History is
         -- untouched: restoring access never rewrites a record.
         access_through = null
   where client_id = p_client and status = 'suspended';
  get diagnostics v_n = row_count;
  insert into audit_log (actor_id, action, table_name, subject_id, detail)
  values (auth.uid(), 'entitlement.restore', 'entitlements', p_client,
          jsonb_build_object('reason', p_reason, 'rows', v_n));
  return jsonb_build_object('ok', true, 'restored', v_n);
end; $$;

revoke execute on function suspend_access(uuid, text) from public;
revoke execute on function restore_access(uuid, text) from public;
revoke execute on function suspend_access(uuid, text) from anon;
revoke execute on function restore_access(uuid, text) from anon;
grant execute on function suspend_access(uuid, text) to service_role;
grant execute on function restore_access(uuid, text) to service_role;
grant execute on function suspend_access(uuid, text) to authenticated;
grant execute on function restore_access(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. RLS on the new table.
-- ---------------------------------------------------------------------
alter table weekly_plans enable row level security;
drop policy if exists weekly_plans_own on weekly_plans;
create policy weekly_plans_own on weekly_plans for select using (can_view_client(client_id));
drop policy if exists weekly_plans_staff on weekly_plans;
create policy weekly_plans_staff on weekly_plans for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------
-- 6. No founding price. Removed per the ruling.
-- ---------------------------------------------------------------------
delete from program_settings where key in ('founding_price_cents', 'founding_window_ends_on');

update program_settings
   set description = 'One time program price, CONFIRMED 26 September 2026. Three payment '
                     'options, all totalling this. Must equal PROGRAM_TOTAL_CENTS in _payments.js.',
       updated_at = now()
 where key = 'program_price_cents';

commit;
