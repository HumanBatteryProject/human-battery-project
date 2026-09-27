-- 078: rate limits for the endpoints anybody on the internet can reach.
-- Part G: "rate limits and abuse protections."
--
-- Three endpoints had no limit of any kind: checkout, waitlist and start-dates.
-- The coach was the only rate-limited route in the product, and it counts rows in
-- coach_turns, which works only because every turn is stored. A public endpoint has
-- no such row, so it needs a counter of its own.
--
-- WHY THE INCREMENT IS ONE STATEMENT. The coach reads a count and then decides,
-- which two simultaneous requests both pass: each reads 19, each proceeds, and the
-- limit of 20 lets 21 through. For a daily message allowance that is a rounding
-- error. For abuse protection it is the whole problem, because abuse arrives in
-- parallel by definition. So the insert, the window roll and the comparison happen
-- in a single INSERT ... ON CONFLICT DO UPDATE, and the caller is told what the
-- count became rather than what it was.

create table if not exists rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null default now(),
  hits          integer not null default 0,
  updated_at    timestamptz not null default now()
);

alter table rate_limits enable row level security;
-- No policies at all, deliberately. Nothing but service_role should read this, and
-- service_role bypasses row level security. A participant has no business knowing
-- how close anybody is to a limit.
revoke all on rate_limits from anon;
revoke all on rate_limits from authenticated;

comment on table rate_limits is
  'Counters for public endpoint rate limits. One row per bucket, rolled forward in place. Not participant data and holds no health information: the bucket is an endpoint plus an IP or a hashed email.';

create or replace function rate_limit_hit(p_bucket text, p_limit integer, p_window interval)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare cur rate_limits;
begin
  if p_bucket is null or btrim(p_bucket) = '' then
    raise exception 'a rate limit needs a bucket';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'a rate limit needs a positive limit';
  end if;

  insert into rate_limits (bucket, window_start, hits, updated_at)
  values (btrim(p_bucket), now(), 1, now())
  on conflict (bucket) do update set
    -- The window rolls forward only when it has actually expired. Reading the OLD
    -- row is what makes this atomic: both branches are decided inside the one
    -- statement that also writes the result.
    window_start = case when rate_limits.window_start < now() - p_window
                        then now() else rate_limits.window_start end,
    hits         = case when rate_limits.window_start < now() - p_window
                        then 1 else rate_limits.hits + 1 end,
    updated_at   = now()
  returning * into cur;

  return jsonb_build_object(
    'allowed', cur.hits <= p_limit,
    'hits', cur.hits,
    'limit', p_limit,
    'retry_after_seconds',
      greatest(0, ceil(extract(epoch from (cur.window_start + p_window - now())))::integer)
  );
end $fn$;

revoke execute on function rate_limit_hit(text, integer, interval) from public;
revoke execute on function rate_limit_hit(text, integer, interval) from anon;
revoke execute on function rate_limit_hit(text, integer, interval) from authenticated;
grant execute on function rate_limit_hit(text, integer, interval) to service_role;

-- Old buckets are not evidence of anything and should not accumulate forever.
create or replace function rate_limits_purge(p_older_than interval default interval '7 days')
returns integer language plpgsql security definer set search_path = public as $fn$
declare n integer;
begin
  delete from rate_limits where updated_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $fn$;

revoke execute on function rate_limits_purge(interval) from public;
revoke execute on function rate_limits_purge(interval) from anon;
revoke execute on function rate_limits_purge(interval) from authenticated;
grant execute on function rate_limits_purge(interval) to service_role;
