-- 084: make citation resolution repeatable, and repair every rule.
--
-- WHAT WENT WRONG. migration 057 resolved source_passages by a lexical match
-- against the loaded corpus, as a one-off UPDATE at the end of the seed. The
-- corpus loader replaces a whole SOURCE at a time, and until now it generated a
-- fresh id per passage, so any reload of a file left every rule citing a passage
-- in that file pointing at nothing. A dangling citation is the worst shape this
-- can take: the rule still renders, still carries an evidence tier, and the
-- source behind the tier is gone.
--
-- Two fixes, and they are separate:
--   1. scripts/load_corpus.py now derives a passage id from its source and its
--      content hash, so unchanged text keeps its id through any reload.
--   2. The resolution is no longer a statement inside a spent migration. It is a
--      function, so it can be re-run after a genuine revision moves a paragraph,
--      and check_canon.py is what says when that is needed.
--
-- The lexical limitation of 057 is unchanged and is not hidden: there is no
-- VOYAGE_API_KEY and no vectors, so this is a keyword match and not semantic
-- retrieval. It picks passages that CONTAIN the pillar's words. A human still
-- has to approve every rule, and the citations are part of what is approved.

begin;

create or replace function resolve_rule_citations(only_empty boolean default false)
returns table (rule_key text, resolved integer) language plpgsql as $$
begin
  return query
  with patterns as (
    select r.id,
           r.rule_key as rk,
           case r.pillar_key
             when 'morning_daylight'   then array['%morning light%','%within an hour of waking%','%solar noon%']
             when 'hydration'          then array['%morning glass%','%minerals%','%three liters%']
             -- The original patterns were '%zone 2%', '%walk after%' and
             -- '%after every meal%'. None of them appears in a claimable passage:
             -- they are the DELIVERABLES' wording, and the deliverable passages
             -- are all tier `unsupported`. So both movement rules resolved to the
             -- protocol documents, which cannot carry a claim, and then to nothing
             -- at all once unsupported passages were excluded. These are the
             -- book's own words for the same thing, in Chapters 17 and 19.
             when 'movement'           then array['%PGC-1%','%prolonged sitting%','%VO2%','%walk%']
             when 'food_timing'        then array['%eating window%','%protein first%','%oily fish%']
             when 'sleep'              then array['%same time every night%','%dark, cool%','%sleep%']
             when 'nighttime_darkness' then array['%evening light%','%screens%','%blue light%']
             -- Added with the seventh pillar. 'hormesis' and 'hormetic' are in
             -- here because the mechanism passages are what the dose rests on,
             -- and neither of them uses the word sauna.
             -- '%hormesis%' alone matched the DHA chapter and a chapter on what
             -- would falsify the thesis, both of which mention the word in
             -- passing, so a rule about the sauna cited fish oil as its evidence.
             -- These two reach the hormesis curve in Chapter 11, which is the
             -- mechanism the dose actually rests on, and nothing else.
             when 'heat_and_cold'      then array['%cold exposure%','%cold plunge%','%sauna%','%recoverable stress%','%hormesis is%']
           end as pats
      from canonical_rules r
     where r.retired_at is null
       and (not only_empty or coalesce(cardinality(r.source_passages), 0) = 0)
  ),
  picked as (
    select p.id, p.rk,
           (select array_agg(q.id order by q.id)
              from (
                select kp.id
                  from knowledge_passages kp
                  join knowledge_sources ks on ks.id = kp.source_id
                 -- ONLY THE MANUSCRIPT. Every program_doc source is recorded as
                 -- `established` at the source level, so every passage chopped out
                 -- of a PDF generator or out of HBP-Protocol-Complete.md inherits
                 -- a claimable tier. That is how a rule about heat came to cite a
                 -- table about evening glasses, and how cold_exposure came to cite
                 -- the protocol's own sauna dose as the evidence for itself.
                 --
                 -- A protocol document is downstream of the evidence. It is what
                 -- the evidence was used to write, and it cannot be the source for
                 -- the claim it makes.
                 where ks.kind = 'doc'
                   and kp.passage ilike any (p.pats)
                   -- Never cite a passage that cannot carry a claim. The consumer
                   -- wording for `unsupported` does not exist, so a rule standing
                   -- on one would render a tier badge with no word behind it.
                   and kp.evidence_tier is not null
                   and kp.evidence_tier <> 'unsupported'
                 -- SPECIFIC FIRST, then the book, then deterministic.
                 --
                 -- `order by kp.id limit 4` picked four of the matches by uuid,
                 -- which is arbitrary. For heat and cold that gave the DHA
                 -- chapter and a passage about what would falsify the thesis,
                 -- because both mention hormesis in passing, while the chapter
                 -- that actually discusses cold exposure was left out.
                 --
                 -- The patterns are now ordered most specific first, and a
                 -- passage is ranked by the FIRST pattern it matches. The book is
                 -- preferred over the program's own documents, because an
                 -- evidence tier is a claim about the literature and a protocol
                 -- document restating a dose is not a source for it.
                 order by (
                   select min(i) from generate_subscripts(p.pats, 1) i
                    where kp.passage ilike p.pats[i]
                 ),
                 case when kp.chapter like 'Chapter %' then 0 else 1 end,
                 kp.id
                 limit 4) q) as ids
      from patterns p
  )
  update canonical_rules r
     set source_passages = coalesce(pk.ids, '{}')
    from picked pk
   where r.id = pk.id
  returning r.rule_key, coalesce(cardinality(r.source_passages), 0);
end; $$;

-- Nothing that reaches the browser may call this. It rewrites the evidence behind
-- every rule, so anon holding execute on it is a hole: an unauthenticated caller
-- could repoint every citation in the canon. Supabase grants execute to anon by
-- default on a new function, which is why check_rls looks for exactly this and is
-- what caught it here.
revoke all on function resolve_rule_citations(boolean) from public, anon, authenticated;

comment on function resolve_rule_citations(boolean) is
  'Re-point canonical_rules.source_passages at passages that exist. Run after a '
  'corpus reload moves a cited paragraph, which check_canon.py reports.';

select * from resolve_rule_citations(false) order by rule_key;

commit;
