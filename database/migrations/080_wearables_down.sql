-- Reverses 080. Part of the Day 13 rollback rehearsal.
--
-- WHY A DOWN SCRIPT EXISTS FOR THIS ONE AND NOT FOR THE OTHERS. Most migrations here
-- cannot be reversed in any meaningful sense: 053 closed a security hole, 061 removed
-- cohorts, 077 took away a privilege escalation. Reversing those would mean
-- reintroducing a defect, so the honest answer is that they are one-way and the recovery
-- path is a restore from backup, which is rehearsed separately in restore_rehearsal.sh.
--
-- 080 is different. It ADDS tables that nothing else depends on, so it has a real
-- inverse, and it is the newest migration, which makes it the one most likely to need
-- reversing. That is exactly the migration a rollback rehearsal should use.
--
-- IT REFUSES IF THERE IS DATA. A down script that silently drops a member's readings is
-- not a rollback, it is data loss with a reassuring name.

-- ONE TRANSACTION, AND THIS IS NOT DECORATION.
--
-- The first version guarded the drops with a DO block that raises when rows exist, and
-- then dropped the tables anyway. psql without ON_ERROR_STOP continues past an error, so
-- the guard printed "Refusing to drop member readings" and the very next statement
-- dropped them. I watched it happen: the refusal appeared, and so did DROP TABLE.
--
-- A safety check that does not stop the unsafe thing is worse than no check, because it
-- reads like protection. Wrapping the whole script in a transaction makes the refusal
-- effective no matter how psql is invoked, which is the only version that can be trusted
-- by somebody in a hurry at the wrong hour.
begin;

do $$
declare n bigint;
begin
  select count(*) into n from wearable_daily;
  if n > 0 then
    raise exception 'wearable_daily holds % row(s). Refusing to drop member readings. '
                    'Export them first, or delete them deliberately.', n;
  end if;
  select count(*) into n from wearable_tokens;
  if n > 0 then
    raise exception 'wearable_tokens holds % row(s). Revoke them at each provider first, '
                    'because dropping the table here leaves live credentials granted to us '
                    'that nobody can see or revoke.', n;
  end if;
end $$;

drop table if exists wearable_tokens;
drop table if exists wearable_daily;
drop table if exists wearable_connections;

drop type if exists wearable_connection_status;
drop type if exists wearable_provider;

delete from feature_flags where key in (
  'WEARABLE_OURA', 'WEARABLE_WHOOP', 'WEARABLE_POLAR', 'WEARABLE_WITHINGS',
  'WEARABLE_GARMIN', 'WEARABLE_GOOGLE', 'WEARABLE_APPLE_UPLOAD'
);

commit;
