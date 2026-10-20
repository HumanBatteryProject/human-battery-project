-- 087: the research agent. The ninth agent inside the product.
--
-- It searches for new work every day, judges it against the canonical thesis,
-- adds what has value to the research library, and proposes protocol changes
-- as it learns. It never changes the thesis. The book is canonical and
-- docs/HBP-Canonical-Positions.md is the operative extract; the agent reads
-- them and does not write them.
--
-- THREE TABLES, AND THE SHAPE OF EACH IS THE POINT.
--
-- research_queries is the question list, and it is a TABLE rather than a
-- constant in the agent's code for the same reason the autonomy bounds are:
-- a question list held in the agent's code is one the agent's next revision
-- can widen without anyone noticing. Every row is tied to a position in the
-- canonical extract, to a pillar, and where it fits to a scored dimension, so
-- a query that drifts off the thesis is visible as a row with nothing to tie
-- it to. The agent never adds a row. Micah edits this from the admin screen.
--
-- research_findings is one row per paper, judged once. CONTRADICTIONS ARE
-- FIRST CLASS: `contradicts` is a verdict like any other, counter_evidence is
-- a column and not a note, and nothing in the schema lets a contradiction be
-- dropped or hidden. A library that can only record agreement is a library
-- that will eventually be wrong with confidence.
--
-- canon_proposals is the queue. Nothing in it changes a protocol until Micah
-- approves it, and an approved rule_revision becomes a NEW version row in
-- canonical_rules rather than an edit of the old one. Rule 10 of CLAUDE.md
-- stands: protocol changes proposed by an agent are never applied
-- automatically.
--
-- WHAT IS DELIBERATELY ABSENT. There is no column anywhere here for a paper's
-- text. knowledge_sources.kind has no value for the paper itself, by design,
-- and this migration does not add one. The library stores OUR summary of a
-- paper and never the paper.

begin;

-- ---------------------------------------------------------------------
-- The study design vocabulary, taken from citations.json rather than
-- invented, so a finding and a citation describe a design the same way.
-- ---------------------------------------------------------------------
-- These nine are exactly the values in public/data/citations.json as at
-- 2026-10-19, enumerated from the file rather than from memory. The rule that
-- governs them is in CLAUDE.md: PubMed's PublicationType is the source when it
-- names a design, and when it names none, the methods are read and the report
-- says PublicationType did not supply it. Never stretch 'Journal Article' into
-- a design.
do $$ begin
  create type study_type as enum (
    'human_rct',            -- randomised controlled trial in people
    'human_observational',  -- cohort, case control, cross sectional
    'animal',
    'cell',                 -- primary culture. Wong-Riley 2005 is this
    'in_vitro',
    'plant',
    'review',               -- including meta analysis and systematic review
    'textbook',
    'theory'
  );
exception when duplicate_object then null; end $$;

-- What the agent decided a paper does to the thesis.
do $$ begin
  create type research_verdict as enum (
    'supports',          -- consistent with a position, adds weight
    'refines',           -- narrows, conditions or sharpens a position
    'contradicts',       -- argues against a position. Kept, never dropped
    'out_of_thesis',     -- real work, not about anything we claim
    'prohibited_shape'   -- could not be summarised without breaking a rule
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type research_status as enum ('candidate', 'accepted', 'declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type canon_proposal_kind as enum (
    'parameter_range',   -- a bound in protocol_parameters
    'rule_revision',     -- a new VERSION of a canonical_rules row
    'position_note',     -- appended to a position's notes for the next book revision
    'book_question'      -- a question for Micah, and nothing more
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type canon_proposal_status as enum ('waiting', 'approved', 'declined');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- research_queries. The question list, owned by a person.
-- ---------------------------------------------------------------------
create table if not exists research_queries (
  id            uuid primary key default gen_random_uuid(),

  -- The query as PubMed and Europe PMC will receive it.
  query         text not null check (length(btrim(query)) between 3 and 500),

  -- What this question is FOR. A row that can tie itself to nothing is a
  -- question that drifted off the thesis, and that is visible here.
  position_key  text not null,          -- a section of docs/HBP-Canonical-Positions.md
  pillar_key    text references pillars(key) on delete set null,
  dimension     text,                   -- a scored dimension, where it fits

  -- Off by default would mean a seeded list that never ran. On by default
  -- means a list Micah turns OFF, which is the direction that fails safe for a
  -- read-only search.
  is_active     boolean not null default true,

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- The same question twice is the same question.
  constraint research_queries_query_uq unique (query)
);

create index if not exists research_queries_active_idx
  on research_queries (is_active) where is_active;

comment on table research_queries is
  'One row per saved search, each tied to a position in the canonical extract, '
  'a pillar, and where it fits a scored dimension. The agent NEVER adds a row: '
  'a question list the agent can extend is a thesis the agent can widen. Edited '
  'by staff from /portal/admin/research.html. Created by migration 087.';

-- ---------------------------------------------------------------------
-- research_findings. One row per paper, judged once.
-- ---------------------------------------------------------------------
create table if not exists research_findings (
  id            uuid primary key default gen_random_uuid(),

  query_id      uuid references research_queries(id) on delete set null,

  -- VERIFIED METADATA. pmid and title come from PubMed efetch, never
  -- esummary, which truncates: Togo 2012 lost "but not in same-age Wistar
  -- rats", which was the entire finding. Crossref only confirms the DOI
  -- resolves and is the same paper; it never supplies a field PubMed has,
  -- because Crossref returned one author for Kodama 2009 where PubMed returns
  -- twelve, and truncated Wong-Riley 2005 at the colon.
  pmid          text,
  doi           text,
  title         text not null,
  authors       text[] not null default '{}',
  journal       text,
  year          smallint,
  study_type    study_type,
  is_preprint   boolean not null default false,

  -- Where it sits against the thesis.
  position_key  text,
  pillar_key    text references pillars(key) on delete set null,
  dimension     text,

  verdict       research_verdict not null,

  -- The tier the agent proposes, with a reason tied to the study design and to
  -- replication. NEVER to the journal name alone: an impact factor is not an
  -- evidence tier, and treating it as one is how a weak finding in a strong
  -- journal gets promoted.
  proposed_tier evidence_tier,
  tier_reason   text,

  -- OUR summary, in the program's voice. One paragraph, plain language, no em
  -- dashes, no health claim, no outcome promise. Our words about the paper and
  -- never the paper's text.
  summary       text,

  -- Kept and shown, never dropped and never hidden. A contradiction without
  -- its counter-evidence is an assertion.
  counter_evidence text,

  -- Which canon this was judged against, pinned, so a later reader can tell
  -- whether the thesis has moved under the judgement.
  canon_sha     text not null,

  status        research_status not null default 'candidate',
  decided_by    uuid references profiles(id) on delete set null,
  decided_at    timestamptz,

  -- Set when accepted, so the library row and the finding can find each other.
  source_id     uuid references knowledge_sources(id) on delete set null,

  seen_at       timestamptz not null default now(),

  -- Judged once. Dedupe on both identifiers, because a paper can arrive from
  -- two queries with only one of them present.
  constraint research_findings_pmid_uq unique (pmid),
  constraint research_findings_doi_uq  unique (doi),
  -- A decided row says who and when, or neither.
  constraint research_findings_decided_ck check (
    (status = 'candidate' and decided_at is null)
    or (status <> 'candidate' and decided_at is not null)
  )
);

create index if not exists research_findings_status_idx on research_findings (status, seen_at desc);
create index if not exists research_findings_verdict_idx on research_findings (verdict, seen_at desc);
-- The contradictions list on the admin screen reads exactly this.
create index if not exists research_findings_contradicts_idx
  on research_findings (seen_at desc) where verdict = 'contradicts';

comment on table research_findings is
  'One row per paper the research agent judged, judged once, deduped on pmid '
  'and doi. summary is OUR paragraph about the paper and never the paper text. '
  'Contradictions are first class: verdict contradicts is kept with its '
  'counter_evidence and is never dropped. Created by migration 087.';
comment on column research_findings.title is
  'From PubMed efetch. esummary truncates, and the truncated part has been the '
  'load-bearing part all three times it has happened in this project.';
comment on column research_findings.tier_reason is
  'Tied to the study design and to replication, never to the journal name '
  'alone. An impact factor is not an evidence tier.';
comment on column research_findings.canon_sha is
  'CANONICAL_POSITIONS_SHA at the moment of judgement, so a later reader can '
  'tell whether the thesis moved under the verdict.';

-- ---------------------------------------------------------------------
-- canon_proposals. The queue. Nothing here applies itself.
-- ---------------------------------------------------------------------
create table if not exists canon_proposals (
  id            uuid primary key default gen_random_uuid(),

  kind          canon_proposal_kind not null,

  -- What it would change: a protocol_parameters key, a canonical_rules key, or
  -- a position key. Free text because the three namespaces differ.
  target        text not null,
  from_value    text,
  to_value      text,

  rationale     text not null,
  finding_ids   uuid[] not null default '{}',
  tier          evidence_tier,
  counter_evidence text,

  -- The verdict from evaluate() in _autonomy.js, recorded even though
  -- RESEARCH_AUTONOMY_MODE holds it at review_all, because the day that
  -- constant changes, the record of what WOULD have applied is the only way to
  -- see what the change let through.
  autonomy_blocked_by text,

  status        canon_proposal_status not null default 'waiting',
  decided_by    uuid references profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,

  -- Set on approval of a rule_revision: the NEW canonical_rules row. The old
  -- row is never edited and never deleted.
  new_rule_id   uuid,

  created_at    timestamptz not null default now(),

  constraint canon_proposals_decided_ck check (
    (status = 'waiting' and decided_at is null)
    or (status <> 'waiting' and decided_at is not null)
  )
);

create index if not exists canon_proposals_waiting_idx
  on canon_proposals (created_at desc) where status = 'waiting';

comment on table canon_proposals is
  'Protocol changes the research agent proposes. NOTHING here changes a '
  'protocol until Micah approves it, per rule 10 of CLAUDE.md. On approval a '
  'rule_revision becomes a NEW version row in canonical_rules and never an '
  'edit of the old one; a parameter_range updates protocol_parameters and '
  'triggers the PDF regeneration the trend agent already uses. Created by '
  'migration 087.';
comment on column canon_proposals.autonomy_blocked_by is
  'What evaluate() in _autonomy.js said, recorded even under review_all, '
  'because the day that constant changes this column is the only record of '
  'what the change would have let through.';

-- ---------------------------------------------------------------------
-- The corpus amendment. Dated, per the appendix.
-- ---------------------------------------------------------------------
-- The corpus is the program's own material PLUS our own tiered summaries of
-- papers the research agent accepted. It is still never a paper's text, and
-- there is still no kind for the paper itself.
comment on table knowledge_sources is
  'One row per document in the corpus. Only material this project wrote, plus '
  'our own tiered summaries of papers the research agent accepted (amended '
  '2026-10-19, migration 087). Third-party published work is never stored here '
  'as full text, and there is no kind for the paper itself, by design.';
comment on column knowledge_sources.kind is
  'doc = docs/*.md, program_doc = program-docs/*, citation_summary = OUR own '
  'summary of a paper, either from citations.json or accepted by the research '
  'agent (amended 2026-10-19, migration 087). There is no kind for the paper '
  'itself, by design: the library stores what we wrote about a paper and never '
  'the paper.';

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY, from the migration that creates the tables.
-- ---------------------------------------------------------------------
-- None of these three has a participant it belongs to. A member never reads a
-- finding, a query or a proposal: they read the coach, which reads the passages
-- that an ACCEPTED finding produced. So there is no authenticated policy at
-- all, only staff, and the service role which bypasses RLS.
alter table research_queries  enable row level security;
alter table research_queries  force  row level security;
alter table research_findings enable row level security;
alter table research_findings force  row level security;
alter table canon_proposals   enable row level security;
alter table canon_proposals   force  row level security;

drop policy if exists research_queries_staff on research_queries;
create policy research_queries_staff on research_queries for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

drop policy if exists research_findings_staff on research_findings;
create policy research_findings_staff on research_findings for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

drop policy if exists canon_proposals_staff on canon_proposals;
create policy canon_proposals_staff on canon_proposals for all
  using (current_role_is('admin')) with check (current_role_is('admin'));

-- The anon key holds nothing at all, not even a grant a policy would refuse.
revoke all on research_queries  from anon;
revoke all on research_findings from anon;
revoke all on canon_proposals   from anon;

grant select, insert, update, delete on research_queries  to service_role;
grant select, insert, update, delete on research_findings to service_role;
grant select, insert, update, delete on canon_proposals   to service_role;

-- `authenticated` KEEPS a grant here, unlike waitlist in 085, and the reason is
-- that these three are read from the browser. /portal/admin/research.html talks
-- to Supabase directly with the publishable key, exactly as queues.html and
-- canon.html do, so a grant has to exist for the policy to have anything to
-- permit. RLS is what restricts it: current_role_is('admin') on every row,
-- with force row level security so the table owner is not exempt either.
--
-- A grant without that policy would be the hole. A policy without the grant
-- would be a screen that silently returns nothing, which is the failure mode
-- CLAUDE.md names: a portal query coming back empty is almost always RLS and
-- not the JavaScript.
grant select, insert, update, delete on research_queries  to authenticated;
grant select, insert, update, delete on research_findings to authenticated;
grant select, insert, update, delete on canon_proposals   to authenticated;

commit;
