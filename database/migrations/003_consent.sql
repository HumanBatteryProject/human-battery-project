-- =====================================================================
-- 003  Consent
--
-- The single most important table in the schema for anything downstream.
-- Research consent must exist BEFORE collection. You cannot decide in
-- 2031 to publish on data gathered in 2026 under a form that never
-- mentioned research.
--
-- Every consent is recorded against the exact document version that was
-- shown, with a hash of the text so the wording can be proven later.
-- =====================================================================

create table consent_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         consent_kind not null,
  version      text        not null,             -- 'v1', 'v2', ...
  title        text        not null,
  body         text        not null,             -- the exact text presented
  body_sha256  text        not null,             -- proof of wording
  -- Research consent is always optional. Terms and health-data collection
  -- are required to participate. Never flip research to required.
  is_required  boolean     not null default true,
  effective_from timestamptz not null default now(),
  retired_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (kind, version)
);

create index consent_documents_active_idx
  on consent_documents (kind) where retired_at is null;

comment on table consent_documents is
  'Versioned consent text. Never edit a row in place — publish a new version.';

-- ---------------------------------------------------------------------
-- client_consents — grants and withdrawals
--
-- Withdrawal is recorded rather than deleted, so the audit trail shows
-- both that consent existed and that it was revoked.
-- ---------------------------------------------------------------------
create table client_consents (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid        not null references profiles(id) on delete cascade,
  document_id  uuid        not null references consent_documents(id) on delete restrict,
  granted      boolean     not null,
  granted_at   timestamptz not null default now(),
  withdrawn_at timestamptz,
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index client_consents_client_idx on client_consents (client_id);
create unique index client_consents_active_uidx
  on client_consents (client_id, document_id) where withdrawn_at is null;

-- Does this client currently hold an active consent of the given kind?
-- Used to gate the research export.
create or replace function has_active_consent(target_client uuid, target_kind consent_kind)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from client_consents cc
    join consent_documents cd on cd.id = cc.document_id
    where cc.client_id   = target_client
      and cd.kind        = target_kind
      and cc.granted
      and cc.withdrawn_at is null
  );
$$;

comment on function has_active_consent is
  'Gate every research read on has_active_consent(client, ''research'').';
