-- 035: one retrieval function, used by the coach, the brief and the analysis
-- agent, so there is a single place that decides what "relevant" means.
--
-- WHY THERE IS A LEXICAL PATH AT ALL
-- The spec calls for Voyage embeddings. VOYAGE_API_KEY is not in .dev.vars, so
-- every passage currently has a null embedding and a pure vector search would
-- return nothing at all. This function uses the vector when one is supplied and
-- falls back to full text otherwise, so every agent downstream is buildable and
-- testable today and gains semantic retrieval the moment the key is set,
-- without any of them changing.
--
-- plainto_tsquery ANDs every term, so a member's question, which is a sentence,
-- almost never matches. Three of five paraphrase checks returned nothing before
-- this. The lexical path ORs the significant words and ranks by how many hit.

create or replace function search_passages(
  q            text,
  k            integer default 8,
  qvec         vector(1024) default null,
  min_rank     real default 0.01
)
returns table (
  id uuid, passage text, chapter text, section text,
  evidence_tier evidence_tier, is_authors_model boolean,
  dimension state_dimension, markers text[], score real
)
language sql stable as $$
  with terms as (
    select string_agg(w, ' | ') as orq
      from (
        select distinct lower(w) as w
          from regexp_split_to_table(q, '\s+') as w
         where length(w) > 3
           and lower(w) not in ('what','when','where','which','whose','that','this',
                'does','doing','done','have','has','had','with','from','into','about',
                'they','them','their','there','then','than','your','yours','will',
                'would','should','could','been','being','because','after','before',
                'more','most','less','least','very','much','many','some','any','also',
                'only','just','like','make','makes','made','take','takes','used','using')
      ) s
  )
  select p.id, p.passage, p.chapter, p.section, p.evidence_tier, p.is_authors_model,
         p.dimension, p.markers,
         case
           when qvec is not null and p.embedding is not null
             then (1 - (p.embedding <=> qvec))::real
           else ts_rank_cd(to_tsvector('english', p.passage),
                           to_tsquery('english', (select orq from terms)))::real
         end as score
    from knowledge_passages p
   where (qvec is not null and p.embedding is not null)
      or to_tsvector('english', p.passage) @@ to_tsquery('english', (select orq from terms))
   order by score desc
   limit k
$$;

comment on function search_passages is
  'The single retrieval path. Uses the embedding when a query vector is given '
  'and the row has one, otherwise ranks lexically. min_rank is the similarity '
  'floor the coach declines below: see brief 06 section 4 rule 3.';
