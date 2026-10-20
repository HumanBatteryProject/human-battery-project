// The research agent's decisions, as pure functions.
//
// Nothing here reads the network, the database or the clock. It takes facts
// and returns a verdict, which is what makes "declined because it is a
// preprint" a thing a fixture can assert on. Same shape as _autonomy.js, and
// for the same reason: the safety property of this agent is which papers it
// may accept on its own, so that property gets its own module and is tested
// directly rather than through a live run.

// ---------------------------------------------------------------------
// The mode. Its own constant, held at review_all, per the appendix.
// ---------------------------------------------------------------------
// DECISION LEFT TO THE OWNER. Deliberately SEPARATE from AUTONOMY_MODE in
// _autonomy.js. That one governs changes driven by one member's own logged
// data over a fortnight. This one governs changes driven by the literature,
// which move the protocol for everybody at once and cannot be noticed by the
// member they are wrong for. Coupling them would mean the day the trend agent
// earns its autonomy, the research agent silently gets it too.
export const RESEARCH_AUTONOMY_MODE = 'review_all';   // 'bounded' | 'review_all'

// At most this many abstracts judged in one run, per the appendix. The cap is
// the cost ceiling: one judgement call and one summary call per paper.
export const MAX_PER_RUN = 60;

// The first run backfills a year, in batches no larger than a run's cap.
export const BACKFILL_MONTHS = 12;
export const DAILY_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------
// Descending confidence. `unsupported` is deliberately absent: it exists so
// the coach can decline a passage, and nothing the research agent writes
// should ever be born at it.
export const TIER_RANK = {
  established: 5,
  strong: 4,
  emerging: 3,
  contested: 2,
  hypothesis: 1,
};

// "emerging or above", per the appendix. Note that `contested` is NOT above
// `emerging`: contested means real findings that are argued about, and a
// disputed result is not a stronger result. It can be cited; it cannot carry
// the library on its own.
export const AUTO_ACCEPT_MIN_TIER = 'emerging';

/**
 * The tier a study design can support, before anything else is considered.
 *
 * THE RULE IS THE DESIGN AND THE REPLICATION, NEVER THE JOURNAL. An impact
 * factor is not an evidence tier. A weak finding in a famous journal is a weak
 * finding, and treating the masthead as evidence is exactly the move the tiers
 * exist to prevent. The same mistake has a name in this repository: attaching
 * a Nobel prize to Orch OR.
 *
 * @param {string} studyType one of the citations.json study types
 * @param {{replicated?: boolean, humanSubjects?: number}} ev
 * @returns {{tier: string|null, reason: string}}
 */
export function tierForDesign(studyType, ev = {}) {
  const replicated = !!ev.replicated;
  switch (studyType) {
    case 'review':
      // A systematic review or meta-analysis of human trials is the strongest
      // thing we will see. Replication is what separates the top two.
      return replicated
        ? { tier: 'established', reason: 'meta-analysis or systematic review of replicated human trials' }
        : { tier: 'strong', reason: 'review or meta-analysis, but the underlying trials are not independently replicated' };
    case 'human_rct':
      return replicated
        ? { tier: 'strong', reason: 'randomised controlled trial in people, with independent replication' }
        : { tier: 'emerging', reason: 'single randomised controlled trial in people, not yet replicated' };
    case 'human_observational':
      return replicated
        ? { tier: 'emerging', reason: 'observational in people, consistent across more than one cohort' }
        : { tier: 'contested', reason: 'single observational cohort, confounding not excluded' };
    case 'animal':
      return { tier: 'hypothesis', reason: 'animal work, which cannot by itself carry a claim about people' };
    case 'cell':
    case 'in_vitro':
      return { tier: 'hypothesis', reason: 'cell or in vitro work under narrow laboratory conditions' };
    case 'plant':
      return { tier: 'hypothesis', reason: 'plant work, offered as mechanism only' };
    case 'theory':
      return { tier: 'hypothesis', reason: 'theoretical, with no measurement behind it' };
    case 'textbook':
      return { tier: 'established', reason: 'textbook statement of settled material' };
    default:
      return { tier: null, reason: 'study design could not be determined, so no tier is proposed' };
  }
}

// Papers about a thing you buy. Declined on sight, whatever they found. The
// programme names specifications and not products, so a trial of a branded
// device or a supplement has nothing it could change here even when it is good
// work.
const PRODUCT_TOPIC = new RegExp(
  '\\b(supplement\\w*|supplementation|capsule\\w*|tablet\\w*|lozenge\\w*|' +
  'nutraceutical\\w*|probiotic\\w*|multivitamin\\w*|' +
  'wearable device trial|branded|proprietary blend|' +
  'dietary supplement|oral supplementation)\\b', 'i');

/**
 * Is this paper about a product rather than a mechanism or a behaviour.
 *
 * Deliberately matched on the TITLE and the abstract rather than a brand list.
 * A brand list can only find brands someone already thought of, which is the
 * failure this repository has paid for more than once: a brand scan built from
 * guessed names reported three where there were seventeen.
 */
export function isProductPaper(title, abstract = '') {
  return PRODUCT_TOPIC.test(String(title || '') + ' ' + String(abstract || ''));
}

/**
 * May the agent accept this finding into the library on its own.
 *
 * ALL of these hold, or it goes to a person. The list is the appendix's, and
 * each one is a separate reason so a declined paper can say which gate it
 * failed rather than just failing.
 *
 * @param {object} f
 *   verdict, proposed_tier, is_preprint, doi, doi_confirmed, audit_ok,
 *   study_type, title, abstract
 * @returns {{accept: boolean, blocked_by: string|null}}
 */
export function canAutoAccept(f) {
  if (f.is_preprint) {
    return { accept: false, blocked_by: 'preprint: not peer reviewed' };
  }
  if (!f.doi) {
    return { accept: false, blocked_by: 'no DOI' };
  }
  if (!f.doi_confirmed) {
    return { accept: false, blocked_by: 'DOI not confirmed a second way' };
  }
  if (isProductPaper(f.title, f.abstract)) {
    return { accept: false, blocked_by: 'about a supplement, a device, a brand or a product' };
  }
  if (f.verdict !== 'supports' && f.verdict !== 'refines') {
    return { accept: false, blocked_by: 'verdict is ' + f.verdict };
  }
  const rank = TIER_RANK[f.proposed_tier] || 0;
  if (rank < TIER_RANK[AUTO_ACCEPT_MIN_TIER]) {
    return {
      accept: false,
      blocked_by: 'tier ' + (f.proposed_tier || 'none') + ' is below ' + AUTO_ACCEPT_MIN_TIER,
    };
  }
  if (!f.audit_ok) {
    return { accept: false, blocked_by: 'the summary did not pass the claim-shape audit' };
  }
  return { accept: true, blocked_by: null };
}

/**
 * What the agent may decline on its own, per the appendix.
 *
 * Declines are KEPT, never deleted. The row stays with status declined and the
 * reason, because the set of papers we looked at and did not take is part of
 * the record and is the only way to see a systematic blind spot later.
 */
export function canAutoDecline(f) {
  if (f.verdict === 'out_of_thesis') {
    return { decline: true, because: 'out of thesis' };
  }
  if (f.is_preprint) {
    return { decline: true, because: 'preprint: not peer reviewed' };
  }
  if (isProductPaper(f.title, f.abstract)) {
    return { decline: true, because: 'about a supplement, a device, a brand or a product' };
  }
  if (f.audit_failures >= 2) {
    return { decline: true, because: 'the summary failed the claim-shape audit twice' };
  }
  return { decline: false, because: null };
}

/**
 * What goes to a person, and never into the product.
 *
 * Contradictions and prohibited shapes always come to Micah with both sides
 * shown. A contradiction is not a failure of the search; it is the search
 * working, and dropping one is how a library becomes confidently wrong.
 */
export function needsAPerson(f) {
  if (f.verdict === 'contradicts') {
    return { escalate: true, because: 'contradicts a position, and both sides go to a person' };
  }
  if (f.verdict === 'prohibited_shape') {
    return { escalate: true, because: 'could not be summarised without breaking a rule' };
  }
  return { escalate: false, because: null };
}

/**
 * The autonomy verdict for a proposed parameter change.
 *
 * Thin on purpose: it delegates to evaluate() from _autonomy.js and only
 * supplies this agent's own mode. Reimplementing the five bounds here would
 * create a second copy of the safety property, and the second copy is the one
 * that drifts.
 */
export function proposalVerdict(evaluate, candidate) {
  const v = evaluate(candidate, RESEARCH_AUTONOMY_MODE);
  return {
    ...v,
    // Under review_all nothing applies, and that is the whole point. Recorded
    // anyway so the day the mode changes, the record of what WOULD have
    // applied exists.
    queued: true,
  };
}

/**
 * Dedupe key for a paper. A paper is judged ONCE.
 *
 * Both identifiers, because a paper can arrive from two queries with only one
 * of them present: PubMed gives a PMID and may carry no DOI, Europe PMC may
 * give a DOI for something PubMed has not indexed.
 */
export function dedupeKeys(paper) {
  const keys = [];
  if (paper.pmid) keys.push('pmid:' + String(paper.pmid).trim());
  if (paper.doi) keys.push('doi:' + String(paper.doi).trim().toLowerCase());
  return keys;
}

// ---------------------------------------------------------------------
// What approval DOES, as a pure transformation.
// ---------------------------------------------------------------------
// These are pure so the append-only property can be asserted by a fixture
// rather than observed in the database after the fact. "The old row is still
// there and still says what it said" is the whole safety property of a canon
// revision, and a property that can only be checked by querying production
// after a mistake is not a property that is being checked.

/**
 * Approve a rule_revision.
 *
 * A NEW VERSION ROW, never an edit. The old row keeps its text, keeps its
 * version, and gains nothing except a successor. CLAUDE.md rule 3 says the
 * same thing about score methods and rule 2 about migrations: in this project
 * the published thing is immutable and change is a new row.
 *
 * @param {Array} rules   current canonical_rules rows
 * @param {object} proposal  a canon_proposals row, kind rule_revision
 * @param {string} newId
 * @returns {{rules: Array, newRuleId: string, supersededId: string|null}}
 */
export function applyRuleRevision(rules, proposal, newId) {
  const current = rules
    .filter((r) => r.rule_key === proposal.target && !r.retired_at)
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;

  const next = {
    id: newId,
    rule_key: proposal.target,
    body: proposal.to_value,
    version: (current ? Number(current.version || 0) : 0) + 1,
    supersedes_id: current ? current.id : null,
    approved_by: proposal.decided_by || null,
    approved_at: proposal.decided_at || null,
    from_proposal_id: proposal.id,
  };

  // The old row is COPIED FORWARD UNCHANGED. Not edited, not retired, not
  // marked. A reader of the old version must still see what it said when they
  // were following it.
  return {
    rules: [...rules, next],
    newRuleId: newId,
    supersededId: current ? current.id : null,
  };
}

/**
 * Record a decision on a finding.
 *
 * A DECLINED FINDING IS KEPT. The appendix says declines are kept and not
 * deleted, and the reason is that the set of papers we looked at and did not
 * take is the only way to see a systematic blind spot later. A library that
 * silently forgets what it rejected cannot be audited for what it rejects.
 */
export function applyFindingDecision(findings, id, decision) {
  return findings.map((f) => (f.id !== id ? f : {
    ...f,
    status: decision.status,
    decided_by: decision.decided_by || null,
    decided_at: decision.decided_at,
    decision_note: decision.note || null,
  }));
}
