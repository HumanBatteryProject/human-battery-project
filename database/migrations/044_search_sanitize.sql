-- 044: search_passages must not hand raw user text to to_tsquery.
--
-- The OR-query in 035 pasted the caller's words straight into to_tsquery.
-- That works until a word contains a tsquery OPERATOR, and the first real
-- caller hit it immediately: the marker name "Triglyceride:HDL ratio" has a
-- colon in it, which tsquery reads as a weight selector, and the whole
-- function raised a syntax error rather than returning nothing.
--
-- This matters beyond tidiness. A member can type anything into the coach, and
-- the characters that break tsquery are & | ! ( ) : * <, several of which turn
-- up in ordinary questions. An agent that 500s on a punctuation mark is an
-- agent that appears broken at random.
--
-- Terms are now stripped to letters, digits, hyphen and apostrophe before they
-- reach to_tsquery, and the function returns no rows rather than raising when
-- nothing survives.

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
  with cleaned as (
    select nullif(string_agg(w, ' | '), '') as orq
      from (
        select distinct w from (
          select regexp_replace(lower(t), '[^a-z0-9''-]', '', 'g') as w
            from regexp_split_to_table(coalesce(q, ''), '\s+') as t
        ) s
        where length(w) > 3
          and w not in ('what','when','where','which','whose','that','this',
               'does','doing','done','have','has','had','with','from','into','about',
               'they','them','their','there','then','than','your','yours','will',
               'would','should','could','been','being','because','after','before',
               'more','most','less','least','very','much','many','some','any','also',
               'only','just','like','make','makes','made','take','takes','used','using')
      ) t
  )
  select p.id, p.passage, p.chapter, p.section, p.evidence_tier, p.is_authors_model,
         p.dimension, p.markers,
         case
           when qvec is not null and p.embedding is not null
             then (1 - (p.embedding <=> qvec))::real
           else ts_rank_cd(to_tsvector('english', p.passage),
                           to_tsquery('english', (select orq from cleaned)))::real
         end as score
    from knowledge_passages p
   where (select orq from cleaned) is not null
     and ((qvec is not null and p.embedding is not null)
          or to_tsvector('english', p.passage)
             @@ to_tsquery('english', (select orq from cleaned)))
   order by score desc
   limit k
$$;
