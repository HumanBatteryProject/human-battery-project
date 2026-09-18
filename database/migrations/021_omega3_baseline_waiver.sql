-- =====================================================================
-- 021  Recording an absent Omega-3 baseline separately from a late one
--
-- The day 1 gate previously offered one button, "start anyway, I have
-- posted it", which collapsed two different states into one record.
-- Someone who genuinely posted late and someone who never posted at all
-- both wrote the same confirmation, and one of those confirmations was
-- false.
--
-- They are now separate:
--   omega3_kit_posted_at     the card is in the mail, the result follows
--   omega3_baseline_waived_at  there is no day 0 Omega-3 and there never
--                              will be for this cycle
--
-- The Battery Score already excludes missing markers rather than
-- imputing them, so a waived baseline simply means the marker is absent.
-- Recording it means nobody reading a day 90 comparison believes a day 0
-- number exists that never did.
-- =====================================================================

alter table memberships
  add column if not exists omega3_baseline_waived_at timestamptz;

comment on column memberships.omega3_baseline_waived_at is
  'Set when a client chose to start with no day 0 Omega-3 Index. The marker is absent for this cycle, not pending.';

-- A membership cannot be both posted and waived. Whichever was recorded
-- first stands; the portal never offers both.
alter table memberships
  add constraint memberships_omega3_state_check
  check (omega3_kit_posted_at is null or omega3_baseline_waived_at is null)
  not valid;
