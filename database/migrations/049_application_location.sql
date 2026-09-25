-- 049: the application collects a postal code, and the derivation happens once,
-- at submit, with its own confidence recorded.
--
-- WHY THE DERIVED FIELDS ARE STORED AND NOT COMPUTED ON READ.
-- Three reads want them (the brief's local date, the light timing, the seasonal
-- list) and each would otherwise re-derive. Re-deriving is not free of risk:
-- the prefix table will be corrected over time, and a member whose timezone
-- silently changes under them gets their brief on a different day than
-- yesterday with nothing to point at. Derived once, stored, and correctable by
-- hand is the honest shape.
--
-- WHY tz_confidence EXISTS AT ALL.
-- Thirteen US states span more than one timezone. For eight of them the ZIP
-- prefix settles it exactly. For Indiana, Michigan, South Dakota, Idaho and
-- Alaska it does not, and the difference between telling a member their zone
-- and asking them is the difference between a brief that arrives on the right
-- day and one that does not. 'ask' is not a failure state, it is the system
-- declining to guess.

alter table applications
  add column if not exists postal_code    text,
  add column if not exists timezone       text,
  add column if not exists latitude       numeric(6,3),
  add column if not exists hemisphere     text check (hemisphere in ('N','S')),
  add column if not exists region         text,
  add column if not exists tz_confidence  text check (tz_confidence in ('exact','ask'));

comment on column applications.postal_code is
  'ZIP for US, postal code elsewhere. Coarse on purpose: the program needs a '
  'region and a latitude, never an address.';
comment on column applications.tz_confidence is
  '"exact" when the state has one timezone or the ZIP prefix settles a split '
  'state. "ask" when it does not, or outside the US. An "ask" row must be '
  'confirmed by the member before the first brief is scheduled, because a '
  'wrong timezone sends the brief on the wrong day.';
comment on column applications.latitude is
  'Approximate: the state population-weighted centre. Daylight length varies '
  'by minutes across a state and the protocol asks for morning light, not a '
  'sunrise table. Precision beyond this would be false precision.';

create index if not exists applications_tz_confidence_idx
  on applications (tz_confidence) where tz_confidence = 'ask';

-- Same confidence flag on the member record, so a converted application does
-- not lose the fact that its zone was never confirmed.
alter table profiles
  add column if not exists tz_confidence text check (tz_confidence in ('exact','ask'));
comment on column profiles.tz_confidence is
  'Carried from the application. "ask" means the timezone was never confirmed '
  'by the member and the brief schedule should not be trusted until it is.';
