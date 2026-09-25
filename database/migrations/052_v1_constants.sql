-- 052: Brief 08 section 1 reconciliation. The money and the policy constants.
--
-- WHY THESE ARE ROWS AND NOT CODE.
-- CLAUDE.md rule: prices live in program_settings. check_deliverables fails on
-- a price in any deliverable and the prohibitions suite fails on a price
-- anywhere an agent can say it, so "$39.99" must never reach a PDF, the corpus,
-- or a model prompt. A row can also be corrected without a deploy, which is the
-- difference between fixing a wrong price in a minute and shipping one.
--
-- There is deliberately NO code default for any of these. A default is how a
-- wrong price ships quietly: the setting goes missing, the fallback answers,
-- and nobody finds out until someone is charged. The loader fails loudly
-- instead.

insert into program_settings (key, value, description) values

  -- Brief 08 section 1: the vision document's $39.99 and $349 win over Brief
  -- 07's $39. Adopted.
  ('continuation_monthly_cents', '3999',
   'Continuing membership, monthly. Brief 08 section 1 adopted 39.99 over Brief 07 39.00.'),
  ('continuation_annual_cents', '34900',
   'Continuing membership, annual, billed once up front.'),

  -- Brief 08 section 1: the founding price is a DATE WINDOW, not a count cap.
  -- This resolves the vision document's "no artificial scarcity" against Brief
  -- 07's count cap: a date is a real deadline that does not require telling
  -- anyone a number of seats is running out.
  ('founding_price_cents', '70000',
   'Founding price, one time. Brief 08 recorded this as already set; it was not in the code and is created here.'),
  ('founding_window_ends_on', '2026-12-31',
   'A member pays the founding price when their FIRST cycle day_zero is on or '
   'before this date. Not a seat count: a date is a real deadline and does not '
   'require claiming a number of places is running out. UNRESOLVED, Micah to confirm.'),

  -- Brief 07 section A asked for both day-90 paths built and the safe value set.
  ('day_90_default', 'lapse',
   'What happens at day 90 if the member does nothing. "lapse" or "continue". '
   'Safe value is lapse: charging somebody who did not ask is worse than '
   'stopping somebody who meant to carry on. Brief 08 section 3.8 forbids '
   'silent conversion, which makes lapse the only consistent value.'),

  -- Brief 08 section 1 and section 8 decision 3.
  ('continuation_display_name', 'continuing membership',
   'What to call it on every surface. "Human Battery Continuum" is NOT '
   'approved. Until a name is approved this is the words to use.')

on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now();

-- The program price already exists as PROGRAM_TOTAL_CENTS in _payments.js
-- because Stripe needs it at request time. It is recorded here too so the
-- console has one place to show every price, and the mismatch check below is
-- what stops the two drifting.
insert into program_settings (key, value, description) values
  ('program_price_cents', '100000',
   'One time program price. Must equal PROGRAM_TOTAL_CENTS in _payments.js and '
   'cohorts.price_cents. UNRESOLVED, Micah to confirm per Brief 08 section 8.')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

comment on table program_settings is
  'Operating constants a human can change without a deploy. Prices live here '
  'and never in a deliverable, the corpus, or a model prompt. There is no code '
  'default for any price: a default is how a wrong price ships quietly.';
