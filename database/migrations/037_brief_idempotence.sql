-- 037: one brief per member per day, enforced by the database.
--
-- Brief 06 section 5 asks for idempotence keyed so a rerun does not send
-- twice. A check in the worker is not idempotence: two cron firings that
-- overlap both read "no brief yet" and both write one. Only a unique index
-- makes the second write fail, so that is where the guarantee lives.

create unique index if not exists morning_briefs_one_per_day
  on morning_briefs (client_id, brief_date);

-- `source` records which path produced it, so a brief written by the
-- onboarding agent is distinguishable from one written by the daily worker.
comment on column morning_briefs.source is
  'Which path wrote this brief: onboarding, worker, or backfill. A rerun that '
  'collides with morning_briefs_one_per_day is the worker being correct, not '
  'an error to retry.';

-- The member's timezone lives on profiles and is the ONLY clock the brief may
-- use. A brief assembled against the server's day sends a Tuesday brief to
-- somebody having Monday evening.
comment on column profiles.timezone is
  'IANA timezone. The morning brief worker computes the member local date from '
  'this, never from the server clock. Null is treated as the program default '
  'rather than as UTC, because UTC is a plausible-looking wrong answer.';
