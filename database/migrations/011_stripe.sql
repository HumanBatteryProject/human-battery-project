-- =====================================================================
-- 011  Stripe integration columns
--
-- Run after 010_seed.sql.
-- =====================================================================

alter table payments
  add column if not exists stripe_subscription      text,
  add column if not exists stripe_checkout_session  text,
  add column if not exists stripe_invoice           text;

-- Webhooks are delivered at least once, and Stripe retries on any
-- non-2xx. Without this constraint a retried invoice.paid would insert a
-- duplicate payment row. With it, the upsert merges instead.
-- NOT a partial index. A partial unique index cannot satisfy ON CONFLICT
-- unless the predicate is repeated in every upsert, and PostgREST's
-- on_conflict parameter cannot express one. Postgres treats NULLs as
-- distinct, so rows without a session id are unaffected by this index.
create unique index if not exists payments_session_installment_uidx
  on payments (stripe_checkout_session, installment_no);

create index if not exists payments_subscription_idx
  on payments (stripe_subscription) where stripe_subscription is not null;

-- 'accepted' is the state between reviewing an application and the
-- person paying. Only an accepted application can reach checkout —
-- twenty-five seats is a reviewed list, not an open shopping cart.
alter table applications
  drop constraint if exists applications_status_check;
alter table applications
  add constraint applications_status_check
  check (status in ('new','reviewing','accepted','enrolled','waitlisted','declined','withdrawn'));

comment on index payments_session_installment_uidx is
  'Idempotency guard for Stripe webhook retries.';
