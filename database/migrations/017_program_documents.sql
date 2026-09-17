-- =====================================================================
-- 017  Program documents
--
-- Tier PDFs and shared guides live in a private Supabase Storage
-- bucket. A client can read the documents for their own tier, plus
-- anything marked shared, and nothing else. Enforced by RLS on
-- storage.objects, so the portal cannot leak a Pro document to a
-- Beginner by mistake.
--
-- Access requires an ACCEPTED enrolment: membership status must be
-- 'enrolled' or 'active'. An applicant who has not paid sees nothing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bucket. Private. Signed URLs only.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('program-docs', 'program-docs', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Registry. One row per document, so the portal can list what a client
-- is entitled to without walking the bucket.
--
-- Paths inside the bucket:
--   shared/<file>.pdf          every enrolled client
--   tier/<tier>/<file>.pdf     that tier only
-- ---------------------------------------------------------------------
create table program_documents (
  id            uuid primary key default gen_random_uuid(),
  slug          text        not null unique,
  title         text        not null,
  description   text,
  storage_path  text        not null unique,     -- e.g. tier/pro/HBP-Protocol-PRO.pdf
  tier          program_tier,                     -- null = shared
  sort_order    integer     not null default 0,
  version       text        not null default 'v1',
  published_at  timestamptz not null default now(),
  retired_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index program_documents_tier_idx on program_documents (tier, sort_order)
  where retired_at is null;

alter table program_documents enable row level security;

-- ---------------------------------------------------------------------
-- The one function everything hinges on: what tier is this user
-- entitled to, if any?
-- ---------------------------------------------------------------------
create or replace function my_program_tier()
returns program_tier
language sql
stable
security definer
set search_path = public
as $$
  select m.tier
  from memberships m
  where m.client_id = auth.uid()
    and m.status in ('enrolled', 'active')
    and m.tier is not null
  order by m.created_at desc
  limit 1;
$$;

create or replace function is_enrolled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where client_id = auth.uid() and status in ('enrolled', 'active')
  );
$$;

-- ---------------------------------------------------------------------
-- Registry policies
-- ---------------------------------------------------------------------
create policy program_documents_read on program_documents
  for select using (
    retired_at is null
    and (
      is_staff()
      or (is_enrolled() and (tier is null or tier = my_program_tier()))
    )
  );

create policy program_documents_admin on program_documents
  for all using (current_role_is('admin')) with check (current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Storage policies. The path is the permission.
-- ---------------------------------------------------------------------
create policy "program docs: enrolled clients read shared and own tier"
  on storage.objects for select
  using (
    bucket_id = 'program-docs'
    and (
      is_staff()
      or (
        is_enrolled()
        and (
          (storage.foldername(name))[1] = 'shared'
          or (
            (storage.foldername(name))[1] = 'tier'
            and (storage.foldername(name))[2] = my_program_tier()::text
          )
        )
      )
    )
  );

create policy "program docs: admin manages"
  on storage.objects for all
  using (bucket_id = 'program-docs' and current_role_is('admin'))
  with check (bucket_id = 'program-docs' and current_role_is('admin'));

-- ---------------------------------------------------------------------
-- Download audit. Every fetch of a program document is recorded.
-- ---------------------------------------------------------------------
create table document_downloads (
  id            bigserial primary key,
  client_id     uuid        not null references profiles(id) on delete cascade,
  document_id   uuid        not null references program_documents(id) on delete cascade,
  downloaded_at timestamptz not null default now()
);

create index document_downloads_client_idx on document_downloads (client_id, downloaded_at desc);

alter table document_downloads enable row level security;
create policy document_downloads_insert_self on document_downloads
  for insert with check (client_id = auth.uid());
create policy document_downloads_read on document_downloads
  for select using (can_view_client(client_id));

-- ---------------------------------------------------------------------
-- Seed the registry. Upload the PDFs to these exact paths.
-- ---------------------------------------------------------------------
insert into program_documents (slug, title, description, storage_path, tier, sort_order) values
  ('protocol-pro',          'Your Protocol: Pro',          'The full 90-day protocol for your tier.', 'tier/pro/HBP-Protocol-PRO.pdf',                   'pro',          1),
  ('protocol-advanced',     'Your Protocol: Advanced',     'The full 90-day protocol for your tier.', 'tier/advanced/HBP-Protocol-ADVANCED.pdf',         'advanced',     1),
  ('protocol-intermediate', 'Your Protocol: Intermediate', 'The full 90-day protocol for your tier.', 'tier/intermediate/HBP-Protocol-INTERMEDIATE.pdf', 'intermediate', 1),
  ('protocol-beginner',     'Your Protocol: Beginner',     'The full 90-day protocol for your tier.', 'tier/beginner/HBP-Protocol-BEGINNER.pdf',         'beginner',     1),
  ('dietary-guidelines',    'Dietary Guidelines',          'The approved food list, the daily non-negotiables, and how to build a plate.', 'shared/HBP-Dietary-Guidelines.pdf', null, 2)
on conflict (slug) do nothing;

comment on table program_documents is
  'What each enrolled client can download. tier null means shared. '
  'Access is enforced by RLS on both this table and storage.objects.';
