-- 034: the corpus gains what brief 06 section 3 asks a passage to carry.
--
-- The table predates the brief. It had source, ord, passage, embedding,
-- evidence_tier, subsystems and is_authors_model. Brief 06 asks for part,
-- chapter, section, dimension, markers, reference ids, a content hash to key
-- idempotent reloads on, and the embedding model recorded ON THE ROW so a
-- re-embed is a rerun rather than a reload.
--
-- `subsystems` stays and is not dropped. 26 markers still carry a subsystem
-- value, circadian_practices.target still depends on the type, and the column
-- is the only classification some rows have. It is deprecated, not removed.

alter table knowledge_passages
  add column if not exists part          text,
  add column if not exists chapter       text,
  add column if not exists section       text,
  add column if not exists dimension     state_dimension,
  add column if not exists markers       text[]  not null default '{}',
  add column if not exists reference_ids text[]  not null default '{}',
  add column if not exists content_sha   text,
  add column if not exists embed_model   text,
  add column if not exists embed_version text,
  add column if not exists word_count    integer;

comment on column knowledge_passages.dimension is
  'The scored dimension this passage is about, by canonical Chapter 21 name, '
  'or null. Null is the common case and is not a gap.';

comment on column knowledge_passages.markers is
  'Canonical Chapter 21 marker slugs the passage NAMES. Never inferred: a '
  'marker appears here only if the text says it. An alias with no canonical '
  'name is left out rather than guessed.';

comment on column knowledge_passages.evidence_tier is
  'Read from the book, not inferred. The book tiers claims in its '
  '"Where the evidence stands in this chapter" tables. Where the book does '
  'not tier a claim the passage is unsupported, which lets the coach quote it '
  'as context but never present it as a claim.';

comment on column knowledge_passages.content_sha is
  'sha256 of the passage text. The loader keys on this, so a manuscript '
  'revision updates the passages that changed and leaves the rest alone.';

comment on column knowledge_passages.embed_model is
  'The embedding model that produced this row''s vector, recorded per row so a '
  'model change is visible and a re-embed is a rerun rather than a reload. The '
  'passage text is stored independently of the vector for the same reason.';

create index if not exists knowledge_passages_sha_idx     on knowledge_passages (content_sha);
create index if not exists knowledge_passages_dim_idx     on knowledge_passages (dimension) where dimension is not null;
create index if not exists knowledge_passages_markers_idx on knowledge_passages using gin (markers);
create index if not exists knowledge_passages_chapter_idx on knowledge_passages (chapter);

-- The vector index. ivfflat needs rows to train on, so it is created after the
-- first load rather than here; hnsw does not, and is what this uses.
do $$
begin
  if not exists (select 1 from pg_indexes where indexname='knowledge_passages_embed_idx') then
    execute 'create index knowledge_passages_embed_idx on knowledge_passages '
            'using hnsw (embedding vector_cosine_ops)';
  end if;
exception when others then
  raise notice 'vector index deferred: %', sqlerrm;
end $$;
