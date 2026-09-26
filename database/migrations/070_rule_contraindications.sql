-- 070: the seeded contraindications now reference real screening keys.
--
-- THE DEFECT. 057 seeded contraindications as invented strings:
-- 'anticoagulant', 'levothyroxine', 'diuretic_bp', 'metformin_sulfonylurea',
-- 'insulin', 'antidepressant_mood'. None of them exists in the medication
-- screening table, which is keyed on eight rows: anticoagulants,
-- thyroid_medication, blood_pressure_medication, diabetes_medication, lithium,
-- diuretics_or_sodium_restriction, heart_failure_or_fluid_restriction,
-- bipolar_diagnosis.
--
-- WHY THIS MATTERED MORE THAN A TYPO. The safety gate compares a rule's
-- contraindications against the flags a participant actually has. Comparing
-- against keys that can never be raised does not fail: it passes everything. The
-- gate would have looked like it was working, on every participant, forever.
-- A constraint now makes an unknown key impossible to store.

begin;

update canonical_rules set contraindications = array['bipolar_diagnosis']
 where rule_key in ('morning_light_minutes','wake_time_consistency','sleep_regularity');

update canonical_rules set contraindications = array['diuretics_or_sodium_restriction']
 where rule_key in ('morning_glass','mineral_salt_target');

-- Three liters is the heart failure and fluid restriction row as well as the
-- sodium one.
update canonical_rules
   set contraindications = array['diuretics_or_sodium_restriction','heart_failure_or_fluid_restriction']
 where rule_key = 'daily_water_target';

-- A moved eating window moves a fasting thyroid dose, and it moves every
-- diabetes medication that is timed to meals.
update canonical_rules set contraindications = array['thyroid_medication','diabetes_medication']
 where rule_key = 'eating_window';

update canonical_rules set contraindications = array['anticoagulants']
 where rule_key = 'oily_fish_weekly';

-- The screening keys, as a table, so the database can refuse an unknown one.
-- Duplicated from _medical.js deliberately and checked by fixture: that module
-- must keep working when the database is unreachable, so it cannot read this.
create table if not exists screening_keys (
  key  text primary key,
  on_this text not null
);

insert into screening_keys (key, on_this) values
  ('anticoagulants','Anticoagulants'),
  ('thyroid_medication','Thyroid medication'),
  ('blood_pressure_medication','Blood pressure medication'),
  ('diabetes_medication','Diabetes medication'),
  ('lithium','Lithium'),
  ('diuretics_or_sodium_restriction','Diuretics, or a sodium-restricted diet'),
  ('heart_failure_or_fluid_restriction','Heart failure, or fluid restriction'),
  ('bipolar_diagnosis','Bipolar diagnosis')
on conflict (key) do update set on_this = excluded.on_this;

alter table screening_keys enable row level security;
drop policy if exists screening_keys_read on screening_keys;
create policy screening_keys_read on screening_keys for select using (auth.uid() is not null);
drop policy if exists screening_keys_admin on screening_keys;
create policy screening_keys_admin on screening_keys for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- An unknown contraindication is now impossible to store. A trigger rather than
-- a foreign key, because the column is an array.
create or replace function check_rule_contraindications()
returns trigger language plpgsql as $$
declare bad text[];
begin
  select array_agg(c) into bad
    from unnest(new.contraindications) c
   where c not in (select key from screening_keys);
  if bad is not null then
    raise exception 'unknown screening key(s): %. The medication screening table has: %',
      array_to_string(bad, ', '),
      (select string_agg(key, ', ' order by key) from screening_keys);
  end if;
  return new;
end; $$;

drop trigger if exists canonical_rules_contraindications on canonical_rules;
create trigger canonical_rules_contraindications
  before insert or update on canonical_rules
  for each row execute function check_rule_contraindications();

commit;
