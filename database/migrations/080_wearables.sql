-- 080: wearables. The three tables, and nothing an anonymous reader can touch.
--
-- PRECONDITION, checked before this migration was written, not assumed. The brief
-- forbids creating any of this until row level security is on for every table with
-- policies and the published key is PROVEN unable to read participant data:
--
--   check_rls.py        73 tables all protected, 5 views security_invoker, anon holds
--                       nothing, 32 definer functions guarded, no TRUNCATE for any
--                       user role, profiles.role not self-editable
--   prove_isolation.mjs two ordinary participants, 36 participant tables, both
--                       directions, reads and writes, the fixture shown failing first
--
-- WHY A TOKEN IS DIFFERENT FROM EVERY OTHER ROW IN THIS DATABASE. Every other table
-- holds facts about a person that row level security keeps to that person. A token is
-- a CREDENTIAL: it lets the holder read that person's data from a third party, for as
-- long as it is valid, from anywhere. Row level security is the wrong instrument for
-- it, because the question is not "which rows may this member see" but "may any user
-- role touch this table at all". The answer is no.
--
-- So wearable_tokens gets row level security AND no grant of any kind to anon or
-- authenticated, AND the values are encrypted by the application before they arrive,
-- with a key the database never sees. A dump of this database reveals ciphertext.

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type wearable_provider as enum (
    'oura', 'whoop', 'polar', 'withings',      -- built now
    'garmin', 'google_health',                  -- built, flags off, awaiting approval
    'apple_health_upload'                       -- no cloud API exists; file upload only
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type wearable_connection_status as enum (
    'pending',        -- OAuth started, not yet called back
    'connected',      -- a sync has actually succeeded. F2: nothing else may display as connected
    'error',          -- token or provider problem, member action may be needed
    'revoked'         -- disconnected, token deleted
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. wearable_connections
-- ---------------------------------------------------------------------
create table if not exists wearable_connections (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references profiles (id) on delete cascade,
  provider      wearable_provider not null,
  status        wearable_connection_status not null default 'pending',
  scopes        text[] not null default '{}',
  provider_user_id text,
  -- Brief section 5: no consent row, no connection. A reference rather than a
  -- boolean, so the record says WHICH document version they agreed to.
  consent_id    uuid references client_consents (id),
  connected_at  timestamptz,
  last_sync_at  timestamptz,
  last_error    text,
  -- The provider's own cursor or subscription id, so a pull resumes rather than
  -- re-reading everything.
  sync_cursor   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, provider)
);

-- 'connected' is a claim about reality, so the row has to carry the evidence for it.
-- F2: nothing shows as connected unless a sync has actually succeeded.
alter table wearable_connections drop constraint if exists wearable_connected_has_synced;
alter table wearable_connections add constraint wearable_connected_has_synced check (
  status <> 'connected' or (connected_at is not null and last_sync_at is not null)
);

-- ---------------------------------------------------------------------
-- 2. wearable_tokens
-- ---------------------------------------------------------------------
create table if not exists wearable_tokens (
  connection_id uuid primary key references wearable_connections (id) on delete cascade,
  -- Ciphertext, produced by the Pages Function with WEARABLE_TOKEN_KEY. The database
  -- never holds the key, so a database dump is not a set of live credentials.
  access_token  text not null,
  refresh_token text,
  token_type    text,
  scope         text,
  expires_at    timestamptz,
  -- Which key encrypted it, so the key can be rotated without guessing.
  key_version   smallint not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table wearable_tokens is
  'Encrypted third-party credentials. Service role only: no grant to anon or authenticated, ever. Not exported to the member, because a token is not a record about them, it is a key to their account elsewhere.';

-- ---------------------------------------------------------------------
-- 3. wearable_daily
-- ---------------------------------------------------------------------
-- One normalized row per member, per provider, per day. No raw minute streams in V1.
create table if not exists wearable_daily (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references profiles (id) on delete cascade,
  provider      wearable_provider not null,
  day           date not null,

  sleep_duration_min      integer,
  sleep_efficiency_pct    numeric(5,2),
  bedtime_start           timestamptz,
  bedtime_end             timestamptz,
  resting_hr_bpm          integer,
  hrv_rmssd_ms            numeric(6,2),
  respiratory_rate_bpm    numeric(5,2),
  skin_temp_deviation_c   numeric(4,2),
  steps                   integer,
  time_in_daylight_min    integer,          -- Apple export only
  weight_kg               numeric(6,2),     -- Withings only
  systolic_mmhg           integer,          -- Withings only
  diastolic_mmhg          integer,          -- Withings only

  -- Vendor scores. Stored, shown with the vendor's name on them, and NEVER an input
  -- to the Human Battery Score. Same rule the referable markers already follow: a
  -- composite somebody else computed is not a measurement this model owns.
  vendor_score_name       text,
  vendor_score_value      numeric(6,2),

  -- The same pattern unit conversion already follows for lab results: keep what the
  -- provider actually said beside what we made of it, so a wrong conversion is
  -- recoverable rather than baked in.
  raw                     jsonb not null default '{}'::jsonb,

  -- Every stored value is MEASURED, and the portal renders that label beside it.
  basis                   evidence_basis not null default 'measured',

  -- A value with no unit is HELD, not assumed. Held rows live here rather than in a
  -- fourth table so there is one place to look for a day's data, and the uniqueness
  -- rule below applies only to the normalized row.
  is_held                 boolean not null default false,
  held_reason             text,

  recorded_at             timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Idempotence, the same way the morning brief holds it: one normalized row per
-- member, per provider, per day. A replayed webhook collides instead of inserting.
create unique index if not exists wearable_daily_one_per_day
  on wearable_daily (client_id, provider, day) where not is_held;

create index if not exists wearable_daily_lookup
  on wearable_daily (client_id, day desc) where not is_held;

alter table wearable_daily drop constraint if exists wearable_held_says_why;
alter table wearable_daily add constraint wearable_held_says_why check (
  not is_held or held_reason is not null
);

-- A vendor score needs the vendor's name attached or it is an anonymous number.
alter table wearable_daily drop constraint if exists wearable_vendor_score_is_named;
alter table wearable_daily add constraint wearable_vendor_score_is_named check (
  (vendor_score_value is null) = (vendor_score_name is null)
);

-- ---------------------------------------------------------------------
-- Row level security, from the migration that creates the tables
-- ---------------------------------------------------------------------
alter table wearable_connections enable row level security;
alter table wearable_tokens      enable row level security;
alter table wearable_daily       enable row level security;

-- Tokens: nothing. No policy, and no grant, so there is nothing to get wrong later.
revoke all on wearable_tokens from anon;
revoke all on wearable_tokens from authenticated;

-- Connections and readings are the member's own, and staff may see them for support.
-- has_program_access is not required to READ them: a suspended member must still be
-- able to see what is connected and disconnect it, the same reason billing stays
-- reachable while suspended.
drop policy if exists wearable_connections_own on wearable_connections;
create policy wearable_connections_own on wearable_connections for select
  using (can_view_client(client_id));

drop policy if exists wearable_daily_own on wearable_daily;
create policy wearable_daily_own on wearable_daily for select
  using (can_view_client(client_id));

-- WRITES ARE THE SERVER'S. A member connects a device through an endpoint that
-- verifies the provider's response; they do not get to write their own readings, or
-- a device reading becomes something anybody can type. service_role bypasses row
-- level security, so the absence of an insert or update policy IS the rule.

revoke truncate, trigger, references on wearable_connections from anon, authenticated;
revoke truncate, trigger, references on wearable_daily from anon, authenticated;
revoke insert, update, delete on wearable_connections from anon, authenticated;
revoke insert, update, delete on wearable_daily from anon, authenticated;

-- ---------------------------------------------------------------------
-- Flags: one per provider, plus the master switch that already exists
-- ---------------------------------------------------------------------
insert into feature_flags (key, enabled, description) values
  ('WEARABLE_OURA',     false, 'Oura, OAuth 2 and API v2 with webhooks. Off until a client ID and secret exist and one real device has synced end to end.'),
  ('WEARABLE_WHOOP',    false, 'WHOOP, OAuth 2 and API v2 only. v1 is removed and must not be used. Off until credentials and a real device sync.'),
  ('WEARABLE_POLAR',    false, 'Polar AccessLink v3, pull based. Off until credentials and a real device sync.'),
  ('WEARABLE_WITHINGS', false, 'Withings Public API with notifications. Scale, blood pressure, sleep mat. Off until credentials and a real device sync.'),
  ('WEARABLE_GARMIN',   false, 'Garmin Health API. Ships OFF by owner instruction: the Connect Developer Program is a business application awaiting approval.'),
  ('WEARABLE_GOOGLE',   false, 'Google Health API. Ships OFF by owner instruction: restricted scope security review required. The old Fitbit Web API shuts down September 2026 and must not be built against.'),
  ('WEARABLE_APPLE_UPLOAD', false, 'Apple Health export.zip upload. No cloud API exists and a native app is out of scope for V1.')
on conflict (key) do update set description = excluded.description;
