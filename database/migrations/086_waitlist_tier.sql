-- 086: a waitlist entry gets the same tier suggestion an application would.
--
-- 085 added suggested_tier and nothing filled it, because suggest_tier() is
-- attached to applications. A column that is always null is worse than no
-- column: it looks like an answer nobody gave. The suggestion is not emailed to
-- anybody and is not acted on; it is there so that when a group opens, the list
-- can be read in tier order instead of re-deriving it from seven answers.
begin;

create or replace function waitlist_suggest_tier()
returns trigger language plpgsql as $$
begin
  new.suggested_tier := suggest_tier(new.placement);
  return new;
end; $$;

drop trigger if exists waitlist_tier on waitlist;
create trigger waitlist_tier before insert or update of placement on waitlist
  for each row execute function waitlist_suggest_tier();

-- Backfill the rows already in, so the column is never partly filled.
update waitlist set placement = placement;

commit;

-- Supabase grants execute to anon by default on a new function, so a trigger
-- function added in the migration above arrives reachable from the browser.
-- check_rls looks for exactly this and caught it. Same hole as
-- resolve_rule_citations in 084.
begin;
revoke all on function waitlist_suggest_tier() from public, anon, authenticated;
commit;
