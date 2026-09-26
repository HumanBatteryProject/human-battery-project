-- 066: no founding price, and a discount mechanism instead. Ruled 26 September.
--
-- REMOVAL FIRST. first_start_date() was created in 062 for one purpose: to key a
-- founding price window on the participant's first cycle. There is no founding
-- price, nothing else references the function, and a live helper for a retired
-- concept is the concept waiting to come back. It goes.
--
-- WHAT REPLACES IT. Not a price, a mechanism. Discounts the owner creates, one at
-- a time, with a name, an amount, what they apply to, a window, a use limit and
-- an audit trail on both ends. NOTHING is discounted unless a discount exists,
-- which is the opposite of a founding price that applies to whoever turns up
-- before a date.

begin;

drop function if exists first_start_date(uuid);

-- ---------------------------------------------------------------------
-- Discounts. One table for both shapes, because they differ in one column and
-- two tables would mean two validation paths and two places to forget the use
-- limit.
--   a CODE discount:       code is set, client_id is null, anyone may redeem
--   a PER MEMBER discount: client_id is set, code is null, only they may redeem
-- ---------------------------------------------------------------------
do $$ begin
  create type discount_kind as enum ('fixed','percent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type discount_target as enum ('program','continuation_monthly','continuation_annual');
exception when duplicate_object then null; end $$;

create table if not exists discounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  -- Codes are compared case insensitively, so they are stored upper case and the
  -- unique index is on the stored form. A code that differs only in case is the
  -- same code to the person typing it.
  code          text,
  client_id     uuid references profiles(id) on delete cascade,
  kind          discount_kind not null,
  -- For 'fixed' this is cents off. For 'percent' it is whole percent, 1 to 100.
  amount        integer not null check (amount > 0),
  applies_to    discount_target not null,
  valid_from    date not null default current_date,
  valid_to      date,
  use_limit     integer check (use_limit is null or use_limit > 0),
  times_used    integer not null default 0 check (times_used >= 0),
  revoked_at    timestamptz,
  -- Stripe carries the discount so the charge and the record cannot disagree.
  -- Null until Stripe is configured; the endpoint refuses to redeem a discount
  -- with no Stripe object once Stripe IS configured.
  stripe_coupon_id         text,
  stripe_promotion_code_id text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),

  -- Exactly one of the two shapes.
  constraint discount_is_code_or_member check (
    (code is not null and client_id is null) or
    (code is null and client_id is not null)),
  -- A percent discount above 100 would pay the participant.
  constraint percent_is_a_percent check (
    kind <> 'percent' or amount between 1 and 100),
  -- A fixed discount at or above the program price would make it free, which may
  -- be intended, but never negative.
  constraint window_is_ordered check (valid_to is null or valid_to >= valid_from),
  constraint use_limit_not_already_exceeded check (
    use_limit is null or times_used <= use_limit)
);

create unique index if not exists discounts_code_key
  on discounts (upper(code)) where code is not null and revoked_at is null;

comment on table discounts is
  'Discounts the owner creates. Nothing is discounted unless a row exists here. '
  'This replaces the founding price, which applied to whoever happened to start '
  'before a date and could not be turned off.';
comment on column discounts.amount is
  'Cents off for kind=fixed. Whole percent for kind=percent. Never a float: a '
  'percentage stored as 0.2 and read as 20 is the same class of error as dollars '
  'read as cents.';

-- ---------------------------------------------------------------------
-- Redemptions. Who redeemed what, and what it was worth at the time.
-- ---------------------------------------------------------------------
create table if not exists discount_redemptions (
  id             uuid primary key default gen_random_uuid(),
  discount_id    uuid not null references discounts(id) on delete restrict,
  client_id      uuid not null references profiles(id) on delete cascade,
  applied_to     discount_target not null,
  plan           payment_plan,
  -- Recorded in cents at redemption time, because a percent discount's value
  -- depends on a price that may change later. "20 percent" does not tell you
  -- what came off.
  list_cents     integer not null,
  discount_cents integer not null check (discount_cents >= 0),
  charged_cents  integer not null check (charged_cents >= 0),
  redeemed_at    timestamptz not null default now(),
  constraint redemption_arithmetic check (list_cents - discount_cents = charged_cents),
  -- One redemption per participant per discount. A code is not a repeat coupon.
  unique (discount_id, client_id)
);

comment on constraint redemption_arithmetic on discount_redemptions is
  'The three numbers must agree. A redemption row that does not balance is a '
  'record nobody can reconcile against a bank statement.';

-- ---------------------------------------------------------------------
-- Validation, in the database, so the answer cannot differ between callers.
-- ---------------------------------------------------------------------
create or replace function validate_discount(
  p_code text, p_client uuid, p_target discount_target)
returns table (ok boolean, reason text, discount_id uuid, kind discount_kind,
               amount integer, name text)
language plpgsql stable security definer set search_path = public as $$
declare d record;
begin
  if p_code is not null and length(trim(p_code)) > 0 then
    select * into d from discounts
     where upper(code) = upper(trim(p_code)) and revoked_at is null
     limit 1;
  else
    select * into d from discounts
     where client_id = p_client and revoked_at is null
       and applies_to = p_target
     order by created_at desc limit 1;
  end if;

  if d.id is null then
    return query select false, 'No discount by that code.'::text, null::uuid, null::discount_kind, null::integer, null::text;
    return;
  end if;
  if d.applies_to <> p_target then
    return query select false, ('That discount applies to ' || d.applies_to || ', not this.')::text,
                        d.id, d.kind, d.amount, d.name;
    return;
  end if;
  if d.client_id is not null and d.client_id <> p_client then
    return query select false, 'That discount belongs to somebody else.'::text, d.id, d.kind, d.amount, d.name;
    return;
  end if;
  if d.valid_from > current_date then
    return query select false, ('That discount is not valid until ' || d.valid_from || '.')::text, d.id, d.kind, d.amount, d.name;
    return;
  end if;
  if d.valid_to is not null and d.valid_to < current_date then
    return query select false, ('That discount expired on ' || d.valid_to || '.')::text, d.id, d.kind, d.amount, d.name;
    return;
  end if;
  if d.use_limit is not null and d.times_used >= d.use_limit then
    return query select false, 'That discount has been used the maximum number of times.'::text, d.id, d.kind, d.amount, d.name;
    return;
  end if;
  if exists (select 1 from discount_redemptions r where r.discount_id = d.id and r.client_id = p_client) then
    return query select false, 'You have already used that discount.'::text, d.id, d.kind, d.amount, d.name;
    return;
  end if;

  return query select true, null::text, d.id, d.kind, d.amount, d.name;
end; $$;

-- Redeem, atomically. The use limit is enforced by re-checking inside the same
-- statement that increments it, so two simultaneous redemptions of a
-- single-use code cannot both succeed.
create or replace function redeem_discount(
  p_discount uuid, p_client uuid, p_target discount_target,
  p_plan payment_plan, p_list_cents integer, p_discount_cents integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rows integer; v_name text;
begin
  update discounts
     set times_used = times_used + 1
   where id = p_discount
     and revoked_at is null
     and valid_from <= current_date
     and (valid_to is null or valid_to >= current_date)
     and (use_limit is null or times_used < use_limit)
   returning name into v_name;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'message',
      'That discount could not be redeemed: it is revoked, outside its window, or at its use limit.');
  end if;

  insert into discount_redemptions
    (discount_id, client_id, applied_to, plan, list_cents, discount_cents, charged_cents)
  values (p_discount, p_client, p_target, p_plan, p_list_cents, p_discount_cents,
          p_list_cents - p_discount_cents);

  insert into audit_log (actor_id, action, table_name, record_id, subject_id, detail)
  values (auth.uid(), 'discount.redeemed', 'discount_redemptions', p_discount, p_client,
          jsonb_build_object('name', v_name, 'target', p_target, 'plan', p_plan,
                             'list_cents', p_list_cents, 'discount_cents', p_discount_cents,
                             'charged_cents', p_list_cents - p_discount_cents));

  return jsonb_build_object('ok', true, 'name', v_name,
                            'discount_cents', p_discount_cents,
                            'charged_cents', p_list_cents - p_discount_cents);
end; $$;

revoke execute on function validate_discount(text, uuid, discount_target) from public;
revoke execute on function redeem_discount(uuid, uuid, discount_target, payment_plan, integer, integer) from public;
revoke execute on function validate_discount(text, uuid, discount_target) from anon;
revoke execute on function redeem_discount(uuid, uuid, discount_target, payment_plan, integer, integer) from anon;
grant execute on function validate_discount(text, uuid, discount_target) to authenticated, service_role;
grant execute on function redeem_discount(uuid, uuid, discount_target, payment_plan, integer, integer) to service_role;

-- ---------------------------------------------------------------------
-- RLS. Only an admin manages discounts. A participant may read their OWN
-- redemption, because it is what came off their own invoice.
-- ---------------------------------------------------------------------
alter table discounts enable row level security;
drop policy if exists discounts_admin on discounts;
create policy discounts_admin on discounts for all
  using (current_role_is('admin')) with check (current_role_is('admin'));
drop policy if exists discounts_staff_read on discounts;
create policy discounts_staff_read on discounts for select using (is_staff());

alter table discount_redemptions enable row level security;
drop policy if exists redemptions_own on discount_redemptions;
create policy redemptions_own on discount_redemptions for select using (can_view_client(client_id));
drop policy if exists redemptions_staff on discount_redemptions;
create policy redemptions_staff on discount_redemptions for all
  using (is_staff()) with check (is_staff());

commit;
