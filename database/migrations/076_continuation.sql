-- 076: continuing membership. Part I Day 10, master prompt D8 and D9.
--
-- The prices and the consent kind already existed. What did not exist was any
-- code path that writes an entitlement from a payment, any protection against a
-- webhook arriving twice, and any record of WHICH price a member agreed to.
-- This migration supplies the four database facts that code alone cannot.
--
-- 1. AT MOST ONE CHARGEABLE ENTITLEMENT PER KIND, enforced by the database.
--
-- enroll.js guards this by reading first and inserting if it finds nothing,
-- which two concurrent webhooks both pass: each reads zero, each inserts, and
-- the member now has two entitlements with two end dates. The gate honours the
-- longer one, so the failure is silent and in the member's favour, which is the
-- kind nobody reports. This is the same shape as the concurrent-brief cost leak
-- and it has the same fix: let the database refuse, rather than asking the
-- application to notice.
--
-- 'active' and 'suspended' are the chargeable states. A cancelled entitlement
-- still inside its paid period is deliberately NOT counted: nothing further will
-- be charged against it, so buying a new plan then is a plan change rather than a
-- double billing, and access overlapping for a few days is access the member has
-- already paid for.
--
-- Both continuation kinds share ONE index, which is the point. Monthly and annual
-- are two rows of the same thing, and a member who switches must not end up
-- holding both. D9 asks for an explicit policy preventing accidental overlap or
-- double billing when plans change; this is that policy, written where it cannot
-- be bypassed.

create unique index if not exists entitlements_one_program_idx
  on entitlements (client_id)
  where kind = 'program' and status in ('active', 'suspended');

create unique index if not exists entitlements_one_continuation_idx
  on entitlements (client_id)
  where kind in ('continuation_monthly', 'continuation_annual')
    and status in ('active', 'suspended');

-- 2. WHAT THE MEMBER AGREED TO, stored on the entitlement itself.
--
-- price_cents is not a convenience copy of program_settings. D9 requires
-- accurate recurring-price disclosure, and a price read from settings at display
-- time tells a member what the program charges TODAY, not what they agreed to.
-- Raise the monthly fee and every existing member's billing screen would rewrite
-- its own history. The agreed price belongs to the agreement.
--
-- consent_id is the proof that subscription consent was explicit. A boolean
-- would say consent happened; this says which document version, at what time,
-- which is the only form that survives being asked about.

alter table entitlements
  add column if not exists price_cents integer,
  add column if not exists stripe_price text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists consent_id uuid references client_consents (id),
  add column if not exists previous_entitlement_id uuid references entitlements (id);

comment on column entitlements.price_cents is
  'The recurring amount this member agreed to, in cents. Never read the current setting to describe an existing agreement.';
comment on column entitlements.cancel_at_period_end is
  'Cancelled but still inside the paid period. Access continues until effective_to. Cancellation is not deletion and is not immediate loss of access.';

-- A chargeable entitlement has to know what it charges. Backfilling is not
-- possible and not needed: no continuation entitlement exists yet.
alter table entitlements
  drop constraint if exists entitlements_continuation_has_price;
alter table entitlements
  add constraint entitlements_continuation_has_price check (
    kind = 'program' or price_cents is not null
  );

-- 3. OUT-OF-ORDER PROTECTION NEEDS A CLOCK.
--
-- Stripe does not promise delivery order. A cancellation and a renewal can
-- arrive reversed, and applying the older one last resurrects a cancelled
-- subscription. The provider's own event timestamp is the only ordering that
-- means anything, so the entitlement records the newest one it has applied and
-- refuses anything older.

alter table entitlements
  add column if not exists last_event_at timestamptz;

comment on column entitlements.last_event_at is
  'Provider timestamp of the newest event applied to this row. An event older than this is stale and must be ignored, not applied.';

-- 4. THE SUBSCRIPTION CONSENT DOCUMENT.
--
-- D9 requires explicit subscription consent and there was none. Marked
-- v1-unreviewed, in the same words as the other three unreviewed documents, so
-- the document says on its own face that no lawyer has read it.
--
-- is_required is FALSE on purpose. This consent gates one purchase, not the
-- portal. A required consent blocks every screen until it is granted, which
-- would lock a ninety-day participant out of their own program for declining to
-- subscribe to something that has not started.

insert into consent_documents (kind, version, title, body, body_sha256, is_required, effective_from)
select 'subscription', 'v1-unreviewed', 'Continuing membership and recurring payment',
  body, encode(sha256(body::bytea), 'hex'), false, current_date
from (select $doc$Continuing membership and recurring payment

What you are agreeing to

The ninety day program is a fixed price and it ends. This is different. Continuing membership is a recurring payment that renews on its own until you cancel it.

We will show you the amount, how often it recurs, the date it starts, and the date it renews, before you agree to anything. If you do not see all four, do not agree.

When it starts

Continuing membership begins the day after your ninety day program ends, or the day you buy it if your program has already ended. You may buy it before your program finishes. If you do, it still does not start, and does not bill, until your program ends.

Your ninety day program is never converted into a membership. Nothing renews unless you choose it.

Renewal

Monthly membership renews every month on the same date. Annual membership renews every year on the same date. We email you before an annual renewal.

If the price ever changes, the change applies from your next renewal and never retroactively, and we will tell you before it takes effect.

Cancelling

You can cancel at any time from your billing screen. Cancelling stops the next payment. It does not end your access immediately: you keep everything until the period you have already paid for runs out, and we will show you that date.

We do not refund a period that has already started.

Changing plans

You can move between monthly and annual. You will never hold both at once and you will never be billed twice for the same period.

If a payment fails

We will tell you, and we will try again. If it keeps failing, access stops. Access stopping is not deletion.

What cancelling does not do

Cancelling does not delete your data. Your records, your results and your history stay yours. You can export everything, and you can ask us to delete it, whether or not you are a member. Those are separate from anything you pay for.

This document has not been reviewed by a lawyer. It says so on its face because you are entitled to know that before you rely on it.$doc$ as body) src
where not exists (
  select 1 from consent_documents where kind = 'subscription' and retired_at is null
);

-- ---------------------------------------------------------------------
-- 5. WHERE THE OTHER FOUR COMPARISONS GO. Master prompt D8.
-- ---------------------------------------------------------------------
-- D8 names six comparisons. completion_summaries could hold two of them:
-- dimensions, and adherence with days_logged. markers_moved existed as a column
-- and nothing had ever written to it, which is the same shape as the screening
-- query that read a column that never existed: a name that looks like a feature
-- and is not connected to anything.
--
-- Each of these is jsonb rather than a set of columns because every one of them
-- has to be able to say "not available, and here is why" instead of storing a
-- number. A numeric column cannot hold the difference between a marker that did
-- not move and a marker that was never measured, and that difference is the
-- whole comparison.

alter table completion_summaries
  add column if not exists symptoms_function jsonb,
  add column if not exists fitness jsonb,
  add column if not exists habits jsonb,
  add column if not exists uncertainties jsonb,
  add column if not exists maintenance_priorities jsonb;

comment on column completion_summaries.markers_moved is
  'The laboratory comparison. Direction comes from lab_markers.better_direction and is never inferred from the sign of the change.';
comment on column completion_summaries.uncertainties is
  'What these ninety days did NOT establish. Includes the frontier dimensions, which are uncertain by construction rather than by omission.';

-- ---------------------------------------------------------------------
-- 6. ONE CONTINUATION OFFER PER COMPLETED CYCLE.
-- ---------------------------------------------------------------------
-- completion_invitations had no uniqueness beyond its primary key, and it had no
-- writer at all, so nothing had ever tested what a second write would do. The
-- completion agent is not idempotent by design: it closes the cycle it just
-- summarised. But it makes several writes in sequence, and a retry after the
-- summary succeeded and before the cycle closed would offer the same person the
-- same continuation twice.

create unique index if not exists completion_invitations_one_per_cycle_idx
  on completion_invitations (from_membership_id);

-- ---------------------------------------------------------------------
-- 7. validate_discount IS NOT NULL SAFE, and now has a caller that can pass null.
-- ---------------------------------------------------------------------
-- enroll.js has always passed a real client id, so this never mattered. Day 10
-- gives the function a second caller: checkout, where a person paying for the
-- program has an accepted application and often no profile row yet, so the
-- client id can legitimately be null.
--
-- Two guards compare against p_client with = or <>, and both go NULL rather than
-- true when p_client is null. Only ONE of them is reachable, and I checked rather
-- than assuming, because the two read identically:
--
--   d.client_id is not null and d.client_id <> p_client
--     NOT REACHABLE. The check constraint discount_is_code_or_member allows
--     either a code with no client or a client with no code, never both, so any
--     row found by code has client_id null and this branch cannot run. Changed to
--     'is distinct from' as hygiene, not as a fix. Claiming otherwise would be
--     claiming to have closed a hole that was never open.
--
--   exists (... r.client_id = p_client)
--     REACHABLE AND REAL. Proved: a shared code already redeemed by a person
--     answers 'You have already used that discount' when asked with their id, and
--     answers valid when asked with null. Checkout would have quoted a second
--     discount to somebody who had spent theirs. The money was never at risk,
--     because redeem_discount re-checks atomically when the schedule is written
--     and enroll.js refuses at that point, but the participant would have been
--     shown a price we would not honour, which is its own kind of wrong.
--
-- 'is distinct from' is the comparison that treats null as a value rather than as
-- an unknown, which is what both of these checks actually mean.
--
-- The second guard cannot be answered without a client, so it says so instead of
-- guessing. A null client is refused a client-bound discount outright, and a
-- shared code still validates, which is the honest answer to "is this person
-- allowed this code" when we do not yet know who they are.

create or replace function validate_discount(p_code text, p_client uuid, p_target discount_target)
returns table(ok boolean, reason text, discount_id uuid, kind discount_kind, amount integer, name text)
language plpgsql security definer set search_path = public as $fn$
declare d discounts;
begin
  select * into d from discounts
   where upper(code) = upper(btrim(p_code)) and revoked_at is null
   limit 1;

  if d.id is null then
    return query select false, 'No discount by that code.'::text, null::uuid, null::discount_kind, null::integer, null::text;
    return;
  end if;
  if d.applies_to <> p_target then
    return query select false, ('That discount applies to ' || d.applies_to || ', not this.')::text,
                        d.id, d.kind, d.amount, d.name;
    return;
  end if;
  -- is distinct from, not <>. With a null client this now refuses rather than
  -- silently allowing.
  if d.client_id is not null and d.client_id is distinct from p_client then
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
  -- Only answerable when we know who is asking. redeem_discount enforces the
  -- same rule atomically at the moment money is committed, so a null client here
  -- defers the check rather than skipping it.
  if p_client is not null
     and exists (select 1 from discount_redemptions r
                  where r.discount_id = d.id and r.client_id = p_client) then
    return query select false, 'You have already used that discount.'::text, d.id, d.kind, d.amount, d.name;
    return;
  end if;

  return query select true, null::text, d.id, d.kind, d.amount, d.name;
end; $fn$;

revoke execute on function validate_discount(text, uuid, discount_target) from public;
revoke execute on function validate_discount(text, uuid, discount_target) from anon;
grant execute on function validate_discount(text, uuid, discount_target) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. A CANCELLED MEMBERSHIP KEEPS ACCESS UNTIL THE PAID PERIOD ENDS.
-- ---------------------------------------------------------------------
-- has_program_access already carried the comment "A cancelled subscription keeps
-- access to the end of the paid period" next to a clause reading access_until.
-- The comment described behaviour the function did not have: the WHERE begins
-- with status = 'active', which excludes every cancelled row, so access_until
-- could never be reached for the one status it was written for.
--
-- It went unnoticed because nothing had ever cancelled anything. There were no
-- continuation entitlements at all, so the only rows were active programs, and
-- the dead clause looked like a working one.
--
-- D9: "Canceled membership retains access until the paid period ends." A member
-- who cancels on day 3 of a month they have paid for must not lose the portal on
-- day 3. Suspended and expired are NOT widened: a suspension is unpaid money and
-- an expiry is a period that ran out.

create or replace function has_program_access(target_client uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from entitlements e
     where e.client_id = target_client
       and (
         e.status = 'active'
         -- Cancelled means no further charges, not immediate loss of what is
         -- already paid for. It needs an explicit paid-through date: a cancelled
         -- entitlement with no date has nothing left to honour.
         or (e.status = 'cancelled'
             and e.access_until is not null
             and e.access_until >= current_date)
       )
       and e.effective_from <= current_date
       and (e.effective_to is null or e.effective_to >= current_date)
       -- A weekly plan limits access to the week it bought.
       and (e.access_through is null or e.access_through >= current_date)
       and (e.access_until is null or e.access_until >= current_date)
  );
$fn$;

revoke execute on function has_program_access(uuid) from public;
revoke execute on function has_program_access(uuid) from anon;
grant execute on function has_program_access(uuid) to authenticated, service_role;
