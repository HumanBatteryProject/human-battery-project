-- =====================================================================
-- 008  Applications, payments, coach notes, audit
-- =====================================================================

-- ---------------------------------------------------------------------
-- applications — the marketing site form. No health questions here by
-- design; that keeps the public page's compliance surface small.
-- ---------------------------------------------------------------------
create table applications (
  id                uuid primary key default gen_random_uuid(),
  name              text        not null,
  email             citext      not null,
  state             text        not null,
  source            text,
  consent_contact   boolean     not null default false,
  consent_version   text        not null,
  status            text        not null default 'new',
  cohort_id         uuid        references cohorts(id) on delete set null,
  converted_client_id uuid      references profiles(id) on delete set null,
  notes             text,
  ip                inet,
  country           text,
  submitted_at      timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create unique index applications_email_uidx on applications (lower(email::text));
create index applications_status_idx on applications (status, submitted_at desc);

-- ---------------------------------------------------------------------
-- payments — Stripe is the source of truth; these rows mirror it
-- ---------------------------------------------------------------------
create table payments (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid        not null references profiles(id) on delete restrict,
  membership_id     uuid        references memberships(id) on delete set null,
  plan              payment_plan not null,
  installment_no    smallint    not null default 1 check (installment_no between 1 and 3),
  amount_cents      integer     not null check (amount_cents >= 0),
  currency          text        not null default 'usd',
  status            payment_status not null default 'pending',
  due_on            date,
  paid_at           timestamptz,
  stripe_payment_intent text,
  stripe_customer   text,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index payments_client_idx on payments (client_id, due_on);
create index payments_status_idx on payments (status) where status in ('pending','failed');

create trigger payments_updated before update on payments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- coach_notes — private to staff, never visible to the client
-- ---------------------------------------------------------------------
create table coach_notes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid        not null references profiles(id) on delete cascade,
  author_id     uuid        not null references profiles(id) on delete restrict,
  body          text        not null,
  -- Set when the note records an abnormal-result referral, so the
  -- referral protocol has a searchable trail.
  is_referral   boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index coach_notes_client_idx on coach_notes (client_id, created_at desc);

create trigger coach_notes_updated before update on coach_notes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- audit_log — who saw or changed what
-- ---------------------------------------------------------------------
create table audit_log (
  id            bigserial primary key,
  actor_id      uuid        references profiles(id) on delete set null,
  action        text        not null,               -- 'view', 'insert', 'update', 'delete', 'export'
  table_name    text        not null,
  record_id     uuid,
  subject_id    uuid,                               -- the client the data is about
  detail        jsonb,
  ip            inet,
  occurred_at   timestamptz not null default now()
);

create index audit_log_subject_idx  on audit_log (subject_id, occurred_at desc);
create index audit_log_actor_idx    on audit_log (actor_id, occurred_at desc);
create index audit_log_table_idx    on audit_log (table_name, occurred_at desc);

-- ---------------------------------------------------------------------
-- data_requests — access, export, deletion, consent withdrawal
--
-- Required by WA MHMDA, NV SB370 and TX TDPSA, which give a 45-day
-- response window and an appeal path.
-- ---------------------------------------------------------------------
create table data_requests (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid        references profiles(id) on delete set null,
  email         citext      not null,
  kind          text        not null check (kind in ('access','export','delete','withdraw_consent','appeal')),
  status        text        not null default 'open'
                  check (status in ('open','in_progress','fulfilled','denied','appealed')),
  requested_at  timestamptz not null default now(),
  due_by        timestamptz not null default (now() + interval '45 days'),
  resolved_at   timestamptz,
  resolution    text,
  handled_by    uuid        references profiles(id) on delete set null
);

create index data_requests_open_idx on data_requests (due_by) where status in ('open','in_progress');
