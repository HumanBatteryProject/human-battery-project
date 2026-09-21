-- 029: the knowledge corpus. pgvector, sources, passages.
--
-- This is Phase 3. Nothing reads it yet. The loader, the coach and the
-- morning brief agent all come later; this is the shape they will read.
--
-- ---------------------------------------------------------------------
-- What may be stored here
-- ---------------------------------------------------------------------
-- Only material this project wrote. docs/, program-docs/, and the summaries
-- in public/data/citations.json. No third-party published work as full text
-- and no abstract verbatim, ever, without counsel and per publisher. The
-- rule and the reasoning are in docs/HBP-Platform-v2-Spec.md under "The rule
-- about what does NOT go in", and on the counsel list as L9.
--
-- The check is not a constraint because no constraint can read a PDF. It is
-- knowledge_sources.kind: every row declares which of the three permitted
-- origins it came from, so a passage with no legitimate origin has nowhere
-- to sit.
--
-- ---------------------------------------------------------------------
-- Two choices worth stating, because both are expensive to change later
-- ---------------------------------------------------------------------
-- 1. EMBEDDING DIMENSION IS 768, for Cloudflare Workers AI
--    @cf/baai/bge-base-en-v1.5.
--
--    The dimension is baked into the column type. Changing it later means
--    altering the column and re-embedding every passage, so it is being
--    chosen deliberately now rather than discovered.
--
--    That said, this is cheap to revisit at the size this corpus will start
--    at. At a few hundred passages, switching model is: alter the column,
--    re-run the loader, done. Minutes and cents. It stays that cheap to
--    roughly 5,000 passages.
--
--    It stops being cheap at around 10,000, for three reasons that arrive
--    together: the hnsw index becomes necessary and has to be rebuilt from
--    scratch, re-embedding becomes a batched job against provider rate
--    limits rather than a single pass, and by then other things are reading
--    the vectors, so the swap needs a window rather than a command. Past
--    100,000 it is a migration project with a rollback plan.
--
--    So: decide deliberately, but do not treat it as irreversible. The
--    window for changing your mind cheaply is the whole of Phase 3 and
--    well beyond it.
--
--    Workers AI runs on the Cloudflare account this project already has: no
--    new vendor, no new API key, no new billing relationship, and no second
--    secret store. That last point matters because HBP is mid-incorporation
--    (counsel list L8) and every new account opened now is one that will
--    have to be moved to the new entity afterwards.
--
--    OpenAI text-embedding-3-small at 1536 dimensions retrieves somewhat
--    better. It also means a new vendor account opened at the worst possible
--    moment. At a corpus of roughly 350 to 500 passages of our own prose,
--    that quality difference is not what decides whether the coach is good.
--
-- 2. NO APPROXIMATE-NEAREST-NEIGHBOUR INDEX YET, deliberately.
--
--    An ivfflat index on a few hundred rows makes recall worse and speed no
--    better: it needs enough rows per list to partition sensibly, and with
--    500 rows it is guessing. An exact scan over 500 x 768 floats is
--    sub-millisecond, which is faster than the embedding call that precedes
--    it by three orders of magnitude.
--
--    Add an index when the corpus passes roughly 10,000 passages, and make
--    it hnsw rather than ivfflat:
--        create index knowledge_passages_embedding_idx
--          on knowledge_passages using hnsw (embedding vector_cosine_ops);
--    Until then an index is cost with no benefit, and a missing index that
--    is documented is better than a present one that quietly loses results.

create extension if not exists vector;

-- ---------------------------------------------------------------------
-- One row per document loaded.
-- ---------------------------------------------------------------------
create table if not exists knowledge_sources (
  id            uuid          primary key default gen_random_uuid(),

  -- Which of the three permitted origins this came from. There is no fourth.
  kind          text          not null
                  check (kind in ('doc', 'program_doc', 'citation_summary')),

  title         text          not null,
  -- Repo-relative path for doc and program_doc. Null for citation_summary,
  -- which comes from citations.json rather than a file of its own.
  repo_path     text,
  -- citations.json id, for citation_summary rows. The passage is OUR summary
  -- of that paper, never the paper.
  citation_id   text,

  evidence_tier evidence_tier not null,
  authors       text[],
  year          smallint,
  doi           text,
  url           text,

  -- sha256 of the source text at load time, so the loader can tell what
  -- changed and re-embed only that document rather than the whole corpus.
  content_sha   text          not null,

  loaded_at     timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),

  -- A file appears once. Re-loading updates the row rather than adding one.
  constraint knowledge_sources_repo_path_uq unique (repo_path),
  constraint knowledge_sources_citation_uq  unique (citation_id),
  -- Every origin carries the identifier its kind requires.
  constraint knowledge_sources_origin_ck check (
    (kind in ('doc', 'program_doc') and repo_path is not null and citation_id is null)
    or (kind = 'citation_summary' and citation_id is not null and repo_path is null)
  )
);

comment on table knowledge_sources is
  'One row per document in the corpus. Only material this project wrote: see '
  'kind, and the rule in docs/HBP-Platform-v2-Spec.md. Third-party published '
  'work is never stored here as full text.';
comment on column knowledge_sources.kind is
  'doc = docs/*.md, program_doc = program-docs/*, citation_summary = our own '
  'summary of a cited paper from citations.json. There is no kind for the '
  'paper itself, by design.';
comment on column knowledge_sources.content_sha is
  'sha256 of the source text when it was loaded. Lets the loader re-embed '
  'only what changed instead of the whole corpus.';

-- ---------------------------------------------------------------------
-- The passages, and their embeddings.
-- ---------------------------------------------------------------------
create table if not exists knowledge_passages (
  id            uuid          primary key default gen_random_uuid(),
  source_id     uuid          not null references knowledge_sources(id) on delete cascade,

  -- Position within the source, so retrieved passages can be put back in
  -- order and a neighbour can be pulled in for context.
  ord           integer       not null,
  passage       text          not null,

  embedding     vector(768),

  -- Inherited from the source at load time, then corrected per passage by a
  -- human. This is the tagging pass, and it is the point of the whole table:
  -- the spec says the program's credibility rides on this distinction
  -- surviving inside the AI. A document is rarely all one tier.
  evidence_tier evidence_tier not null,
  tier_reviewed boolean       not null default false,

  subsystems    subsystem[]   not null default '{}',

  created_at    timestamptz   not null default now(),

  constraint knowledge_passages_ord_uq unique (source_id, ord)
);

create index if not exists knowledge_passages_source_idx on knowledge_passages (source_id, ord);
-- Partial index on the tagging queue: the review pass reads exactly this.
create index if not exists knowledge_passages_untagged_idx
  on knowledge_passages (source_id) where not tier_reviewed;

comment on column knowledge_passages.evidence_tier is
  'Set from the source on load, then corrected per passage by a human. A '
  'document is rarely all one tier: a protocol page can state an established '
  'mechanism in one paragraph and a working-model inference in the next.';
comment on column knowledge_passages.tier_reviewed is
  'False until a human has confirmed this passage''s tier. Retrieval may use '
  'unreviewed passages, but nothing client-facing should cite a tier from a '
  'passage where this is still false.';
comment on column knowledge_passages.embedding is
  '768 dimensions, Cloudflare Workers AI @cf/baai/bge-base-en-v1.5. Changing '
  'the model means altering this column and re-embedding every row.';

-- ---------------------------------------------------------------------
-- RLS. Staff only, both tables.
-- ---------------------------------------------------------------------
-- No client reads this directly. The coach and the agents retrieve from it
-- server side with the service key, which bypasses RLS entirely, so the
-- policy exists to keep the browser out rather than to shape what an agent
-- sees. A client-facing answer is generated prose with a citation, never a
-- raw passage handed to the browser.
alter table knowledge_sources  enable row level security;
alter table knowledge_passages enable row level security;

create policy knowledge_sources_staff on knowledge_sources
  for all using (is_staff()) with check (is_staff());
create policy knowledge_passages_staff on knowledge_passages
  for all using (is_staff()) with check (is_staff());
