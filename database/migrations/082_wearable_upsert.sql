-- 082: make the wearable idempotence target usable by an upsert.
--
-- 080 created wearable_daily_one_per_day as a PARTIAL unique index, on
-- (client_id, provider, day) WHERE NOT is_held. That expresses the rule correctly and
-- CANNOT BE USED AS AN ON CONFLICT TARGET: Postgres refuses to infer a conflict target
-- from a partial index without repeating its predicate, so
-- on_conflict=client_id,provider,day errors with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification".
--
-- I know that because it cost me the same mistake on Day 10, on payments, where
-- payments_one_per_installment is partial for the same sort of reason. Writing the same
-- defect twice is the argument for fixing the SHAPE rather than working around it again.
--
-- The shape that works includes is_held in the key. A day then has room for one normalized
-- row and one held row, which is exactly what is wanted: the measurements, and a single
-- record of what could not be trusted that day and why.
--
-- Which means held reasons AGGREGATE into one row per day per provider instead of one row
-- per held field. That reads better anyway: "on 27 September, from Oura, these three fields
-- could not be used, for these reasons" is one fact, not three.

drop index if exists wearable_daily_one_per_day;

create unique index if not exists wearable_daily_one_per_day
  on wearable_daily (client_id, provider, day, is_held);

comment on index wearable_daily_one_per_day is
  'One normalized row and one held row per member, per provider, per day. is_held is part of the key so this is a FULL unique index and can be used as an ON CONFLICT target, which a partial index cannot.';
