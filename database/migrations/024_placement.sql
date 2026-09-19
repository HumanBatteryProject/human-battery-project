-- 024: placement on the application form.
--
-- The seven-row table in docs/HBP-Protocol-Complete.md becomes seven
-- questions on the apply form. The answers and the suggested tier live on
-- the application so the onboarding agent has them the moment someone pays.
--
-- The rule lives here, in one function, rather than in the form's
-- JavaScript. The browser can be edited by anyone looking at it, and the
-- onboarding agent needs the same answer the form gave. One definition.

alter table applications
  add column if not exists placement         jsonb,
  add column if not exists placement_version text,
  add column if not exists suggested_tier    program_tier;

comment on column applications.placement is
  'The seven placement answers, keyed by row: training, cold, sauna, '
  'fasting, food, morning_light, sleep. Each value is a program_tier name. '
  'Habit questions only. No symptom, diagnosis or medication question is '
  'asked before enrolment and consent.';
comment on column applications.suggested_tier is
  'Computed by suggest_tier() on insert. A suggestion, not the placement. '
  'Staff can override, and tier_history records it when they do.';

-- ---------------------------------------------------------------------
-- The rule, from the protocol:
--
--   "Four or more in a column places you there. Mixed results place you in
--    the lower of the two closest columns, because it is easier to move up
--    than to fail."
--
-- Seven questions, so at most one column can reach four and the first half
-- is never ambiguous. The second half needs a tie-break, and every
-- tie-break here goes to the lower tier, which is what the sentence above
-- is telling us to do.
-- ---------------------------------------------------------------------
create or replace function suggest_tier(p_answers jsonb)
returns program_tier
language plpgsql
immutable
as $$
declare
  v_rank   constant jsonb := '{"beginner":1,"intermediate":2,"advanced":3,"pro":4}'::jsonb;
  v_keys   constant text[] := array['training','cold','sauna','fasting','food','morning_light','sleep'];
  v_key    text;
  v_val    text;
  v_counts jsonb := '{"beginner":0,"intermediate":0,"advanced":0,"pro":0}'::jsonb;
  v_answered int := 0;
  v_top    text;
  v_second text;
begin
  if p_answers is null then
    return null;
  end if;

  foreach v_key in array v_keys loop
    v_val := p_answers ->> v_key;
    if v_val is null then
      continue;
    end if;
    if v_counts ? v_val then
      v_counts := jsonb_set(v_counts, array[v_val],
                            to_jsonb(((v_counts ->> v_val)::int) + 1));
      v_answered := v_answered + 1;
    else
      -- An answer that is not one of the four tier names is a bug in the
      -- form or a hand-edited request. Refuse rather than guess.
      raise exception 'suggest_tier: % is not a tier name (key %)', v_val, v_key;
    end if;
  end loop;

  -- All seven are required on the form. A partial set cannot be placed.
  if v_answered < array_length(v_keys, 1) then
    return null;
  end if;

  -- Four or more in a column places you there.
  select k into v_top
  from jsonb_each_text(v_counts) as t(k, n)
  where n::int >= 4
  limit 1;

  if v_top is not null then
    return v_top::program_tier;
  end if;

  -- Mixed. Rank the columns by how many answers landed in each, highest
  -- first, and break a tie by taking the lower tier. Then place in the
  -- lower of the top two.
  select k into v_top
  from jsonb_each_text(v_counts) as t(k, n)
  order by n::int desc, (v_rank ->> k)::int asc
  limit 1;

  select k into v_second
  from jsonb_each_text(v_counts) as t(k, n)
  where k <> v_top
  order by n::int desc, (v_rank ->> k)::int asc
  limit 1;

  if (v_rank ->> v_second)::int < (v_rank ->> v_top)::int then
    return v_second::program_tier;
  end if;
  return v_top::program_tier;
end;
$$;

comment on function suggest_tier(jsonb) is
  'The placement table from docs/HBP-Protocol-Complete.md as a function. '
  'Returns null unless all seven rows are answered. Every tie goes to the '
  'lower tier.';

-- Computed on the row rather than in the Pages Function, so a suggestion
-- can never disagree with the answers it was derived from.
create or replace function applications_set_suggested_tier()
returns trigger
language plpgsql
as $$
begin
  new.suggested_tier := suggest_tier(new.placement);
  return new;
end;
$$;

drop trigger if exists applications_suggested_tier on applications;
create trigger applications_suggested_tier
  before insert or update of placement on applications
  for each row execute function applications_set_suggested_tier();
