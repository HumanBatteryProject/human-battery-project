-- 088: approving a canon proposal, server side and append-only.
--
-- WHY THIS IS A FUNCTION AND NOT AN UPDATE FROM THE BROWSER.
--
-- /portal/admin/research.html talks to Supabase directly, which is correct for
-- reading a queue and for flipping a query on and off. It is NOT correct for
-- approving a canon proposal, because approval is not a status change. It is a
-- transformation with a safety property: a rule revision becomes a NEW VERSION
-- ROW and the old row is left exactly as it was.
--
-- A browser that could do that could also do half of it. This function is the
-- whole transformation in one transaction, under one admin check, and the
-- append-only property is a fact about the function rather than a convention
-- the screen happens to follow. The same shape as approve_rules in 075.
--
-- WHAT EACH KIND DOES ON APPROVAL, per the appendix:
--
--   rule_revision    a new canonical_rules row at version + 1. The old row
--                    keeps its text, its version and its approved_at, and is
--                    NOT retired. A reader of the old version must still see
--                    what it said when they were following it.
--   parameter_range  protocol_parameters is updated in place. This one is a
--                    bound and not a published artifact: it is the range a
--                    change must fall inside, every agent reads it live, and
--                    versioning it would mean two bounds disagreeing about
--                    what is safe. The PDFs that quote it are regenerated,
--                    which is the trend agent's existing path.
--   position_note    nothing changes in the product. The note is for the next
--                    book revision and the book is not in this database.
--   book_question    nothing changes anywhere. It was a question.
--
-- Rule 10 of CLAUDE.md stands: nothing here runs without a person calling it.

begin;

create or replace function approve_canon_proposal(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  prop        canon_proposals%rowtype;
  cur         canonical_rules%rowtype;
  new_id      uuid;
  touched     integer := 0;
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false,
      'message', 'Only the owner may approve a canon proposal.');
  end if;

  select * into prop from canon_proposals where id = p_id and status = 'waiting';
  if not found then
    return jsonb_build_object('ok', false,
      'message', 'No proposal waiting with that id. It may already be decided.');
  end if;

  -- ------------------------------------------------------------------
  if prop.kind = 'rule_revision' then
    -- The CURRENT live version of the rule, which is the one being superseded.
    select * into cur from canonical_rules
     where rule_key = prop.target and retired_at is null
     order by version desc limit 1;

    if not found then
      return jsonb_build_object('ok', false,
        'message', 'No live canonical rule with key ' || prop.target || '.');
    end if;

    new_id := gen_random_uuid();

    -- A NEW ROW. Every field is copied forward and only the body and the
    -- version move. Copying field by field rather than with a select-into-
    -- insert is deliberate: a column added later should fail loudly here
    -- rather than be silently dropped from the new version.
    insert into canonical_rules (
      id, rule_key, version, pillar_key, population, eligibility, required_data,
      action_text, parameter, personalization, contraindications, stop_conditions,
      evidence_tier, source_passages, reassess_days,
      review_status, reviewed_by, approved_at, retired_at, created_at
    ) values (
      new_id, cur.rule_key, cur.version + 1, cur.pillar_key, cur.population,
      cur.eligibility, cur.required_data,
      coalesce(prop.to_value, cur.action_text), cur.parameter, cur.personalization,
      cur.contraindications, cur.stop_conditions,
      coalesce(prop.tier, cur.evidence_tier), cur.source_passages, cur.reassess_days,
      'approved', auth.uid(), now(), null, now()
    );

    -- The old row is UNTOUCHED. No update, no retire, no marker. This comment
    -- is here because the obvious next line is an update that retires it, and
    -- that line would destroy the property this function exists for.

    insert into rule_reviews (rule_id, from_status, to_status, actor_id, reason)
    values (new_id, 'pending', 'approved', auth.uid(),
            coalesce(p_reason, 'approved from a research agent proposal'));

    touched := 1;

  -- ------------------------------------------------------------------
  elsif prop.kind = 'parameter_range' then
    update protocol_parameters
       set min_value = coalesce(nullif(split_part(prop.to_value, ',', 1), '')::numeric, min_value),
           max_value = coalesce(nullif(split_part(prop.to_value, ',', 2), '')::numeric, max_value)
     where param = prop.target;
    get diagnostics touched = row_count;

    if touched = 0 then
      return jsonb_build_object('ok', false,
        'message', 'No protocol parameter named ' || prop.target || '.');
    end if;

  -- ------------------------------------------------------------------
  elsif prop.kind in ('position_note', 'book_question') then
    -- Nothing to apply. Approving it means Micah has read it and wants it
    -- kept for the next book revision. Recorded, and that is all.
    touched := 0;
  end if;

  update canon_proposals
     set status = 'approved',
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = p_reason,
         new_rule_id = new_id
   where id = prop.id;

  perform admin_audit('canon.proposal.approved', 'canon_proposals', prop.id, null,
    jsonb_build_object('status', 'waiting', 'kind', prop.kind, 'target', prop.target),
    jsonb_build_object('status', 'approved', 'new_rule_id', new_id,
                       'rows_touched', touched),
    p_reason);

  return jsonb_build_object('ok', true, 'kind', prop.kind, 'target', prop.target,
                            'new_rule_id', new_id, 'rows_touched', touched);
end; $$;

comment on function approve_canon_proposal(uuid, text) is
  'Approve one canon_proposals row, server side. A rule_revision becomes a NEW '
  'canonical_rules version and the old row is left exactly as it was. Admin '
  'only. Created by migration 088.';

create or replace function decline_canon_proposal(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare prop canon_proposals%rowtype;
begin
  if not current_role_is('admin') then
    return jsonb_build_object('ok', false,
      'message', 'Only the owner may decline a canon proposal.');
  end if;

  select * into prop from canon_proposals where id = p_id and status = 'waiting';
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No proposal waiting with that id.');
  end if;

  -- Declined, never deleted. The set of changes we considered and did not make
  -- is the only way to see later that we keep declining the same thing.
  update canon_proposals
     set status = 'declined', decided_by = auth.uid(), decided_at = now(),
         decision_note = p_reason
   where id = prop.id;

  perform admin_audit('canon.proposal.declined', 'canon_proposals', prop.id, null,
    jsonb_build_object('status', 'waiting', 'kind', prop.kind, 'target', prop.target),
    jsonb_build_object('status', 'declined'), p_reason);

  return jsonb_build_object('ok', true);
end; $$;

comment on function decline_canon_proposal(uuid, text) is
  'Decline one canon_proposals row. The row is kept, never deleted. Admin '
  'only. Created by migration 088.';

-- Called by name from /portal/admin/research.html, so authenticated needs
-- execute. The admin check is inside each function, not in the grant.
revoke all on function approve_canon_proposal(uuid, text) from public, anon;
revoke all on function decline_canon_proposal(uuid, text) from public, anon;
grant execute on function approve_canon_proposal(uuid, text) to authenticated;
grant execute on function decline_canon_proposal(uuid, text) to authenticated;

commit;
