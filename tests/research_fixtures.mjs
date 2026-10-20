// Research agent fixtures. The appendix asks for six properties and they are
// all here, plus the cases around them that would let each one pass while
// being wrong.
//
// Everything asserted here is PURE. The decisions live in _research.js and the
// audit in _claimshape.js precisely so "a preprint never auto-accepts" is a
// thing a test can state, rather than something observed in production after a
// preprint got in.

import {
  canAutoAccept, canAutoDecline, needsAPerson, tierForDesign, proposalVerdict,
  applyRuleRevision, applyFindingDecision, isProductPaper, dedupeKeys,
  RESEARCH_AUTONOMY_MODE, MAX_PER_RUN, TIER_RANK, AUTO_ACCEPT_MIN_TIER,
} from '../functions/api/_research.js';
import { auditClaimShape, auditCanaries, PATTERNS } from '../functions/api/_claimshape.js';
import { evaluate, AUTONOMY_MODE } from '../functions/api/_autonomy.js';

let bad = 0;
const t = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log('%s %s got=%s', ok ? 'ok  ' : 'FAIL', label.padEnd(66),
    JSON.stringify(got).slice(0, 70));
};

const GOOD = {
  is_preprint: false, doi: '10.1234/abc', doi_confirmed: true,
  verdict: 'supports', proposed_tier: 'strong', audit_ok: true,
  title: 'Morning daylight and sleep onset in shift workers', abstract: '',
  audit_failures: 0,
};

console.log('RESEARCH_AUTONOMY_MODE = %s, cap = %d papers per run\n',
  RESEARCH_AUTONOMY_MODE, MAX_PER_RUN);

// ---------------------------------------------------------------------
console.log('1. The audit catches a bad summary and the rewrite passes');
// ---------------------------------------------------------------------
const BAD_SUMMARY =
  'The trial found that morning sunlight charges your body the way a charger ' +
  'fills a phone. Participants also drank structured water each day.';
const a1 = auditClaimShape(BAD_SUMMARY);
t('a summary breaking two rules is caught', a1.ok, false);
t('  and both patterns are named',
  a1.findings.map((f) => f.pattern).sort(),
  ['structured-or-energized-water', 'sunlight-charges-the-body']);
t('  and each finding quotes the sentence it is about',
  a1.findings.every((f) => typeof f.sentence === 'string' && f.sentence.length > 10), true);

const REWRITTEN =
  'The trial found that morning daylight shifted sleep onset earlier in shift ' +
  'workers. Participants drank mineral-rich water each day.';
t('the rewrite passes', auditClaimShape(REWRITTEN).ok, true);

// A negation is the model stated CORRECTLY and must not be flagged, or the
// agent can never write the sentence we actually want.
t('a sentence DENYING the forbidden claim passes',
  auditClaimShape('Light does not deliver energy into you; it sets timing.').ok, true);

// The audit has to be able to fail, or a clean run means nothing.
const canaries = auditCanaries();
t('every pattern fires on its own canary', canaries.ok, true);
t('  and there are patterns to fire', canaries.total, PATTERNS.length);

// ---------------------------------------------------------------------
console.log('\n2. A preprint never auto-accepts');
// ---------------------------------------------------------------------
t('a preprint is refused', canAutoAccept({ ...GOOD, is_preprint: true }).accept, false);
t('  and says why', canAutoAccept({ ...GOOD, is_preprint: true }).blocked_by,
  'preprint: not peer reviewed');
t('a preprint is refused even when everything else is perfect',
  canAutoAccept({ ...GOOD, is_preprint: true, proposed_tier: 'established' }).accept, false);
t('and the same preprint IS auto-declined', canAutoDecline({ ...GOOD, is_preprint: true }).decline, true);
// The control: the same paper without the preprint flag gets in, so the test
// above is about the flag and not about some other field.
t('the control, the same paper peer reviewed, is accepted', canAutoAccept(GOOD).accept, true);

// ---------------------------------------------------------------------
console.log('\n3. A contradiction is recorded and never dropped');
// ---------------------------------------------------------------------
const CONTRA = { ...GOOD, verdict: 'contradicts' };
t('a contradiction goes to a person', needsAPerson(CONTRA).escalate, true);
t('  with the reason', needsAPerson(CONTRA).because,
  'contradicts a position, and both sides go to a person');
t('a contradiction is NEVER auto-accepted', canAutoAccept(CONTRA).accept, false);
t('a contradiction is NEVER auto-declined either, which is the point',
  canAutoDecline(CONTRA).decline, false);
// That pair is the property. Auto-declining a contradiction would be a way of
// dropping it that looks like a decision.
t('a prohibited shape also goes to a person', needsAPerson({ ...GOOD, verdict: 'prohibited_shape' }).escalate, true);
t('an out-of-thesis paper is declined without a person', canAutoDecline({ ...GOOD, verdict: 'out_of_thesis' }).decline, true);
t('  but is not escalated', needsAPerson({ ...GOOD, verdict: 'out_of_thesis' }).escalate, false);

// ---------------------------------------------------------------------
console.log('\n4. A parameter_range proposal under review_all always queues');
// ---------------------------------------------------------------------
const BOUND = {
  param: 'morning_light_min', tier: 'intermediate', unit: 'minutes',
  min_value: 10, max_value: 30, weekly_step: 5, intervention: 'morning light',
};
const INSIDE_EVERY_BOUND = {
  param: 'morning_light_min', from_value: 10, to_value: 15, tier: 'intermediate',
  bound: BOUND, tiers: ['established'], flags: [], days_logged: 14, window_days: 14,
};
const pv = proposalVerdict(evaluate, INSIDE_EVERY_BOUND);
t('a proposal inside every bound still does not apply', pv.apply, false);
t('  and the mode is the reason, not a rule number', pv.blocked_by, 'AUTONOMY_MODE is review_all');
t('  and it is queued', pv.queued, true);
t('the shipped research mode is review_all', RESEARCH_AUTONOMY_MODE, 'review_all');
// The bounded rules must stay reachable, or flipping the mode later would turn
// on code nothing has ever exercised. Same lesson as autonomy_fixtures.
t('the same proposal WOULD apply under bounded, so the rules are reachable',
  evaluate(INSIDE_EVERY_BOUND, 'bounded').apply, true);
// The two modes are separate constants on purpose, and the property is that
// proposalVerdict passes the RESEARCH one through rather than letting
// evaluate() fall back to the trend agent's.
//
// An earlier version of this asserted RESEARCH_AUTONOMY_MODE === AUTONOMY_MODE.
// That passed, because both currently read review_all, and it tested the
// opposite of what its label claimed: it would have gone red on the day the
// two correctly diverged, and it could never have caught them being wired
// together. A check that cannot return the other answer is not a check.
let modeSeenByEvaluate = null;
proposalVerdict((cand, mode) => {
  modeSeenByEvaluate = mode;
  return { apply: false, blocked_by: 'stub', permitted_by: null, weak: false };
}, INSIDE_EVERY_BOUND);
t('proposalVerdict passes the RESEARCH mode to evaluate',
  modeSeenByEvaluate, RESEARCH_AUTONOMY_MODE);
t('  and does so explicitly, never by letting evaluate default',
  modeSeenByEvaluate !== undefined && modeSeenByEvaluate !== null, true);

// ---------------------------------------------------------------------
console.log('\n5. An approved rule_revision creates a new version and leaves the old row');
// ---------------------------------------------------------------------
const RULES_BEFORE = [
  { id: 'r1', rule_key: 'morning_light', body: 'Ten minutes before nine.', version: 1, retired_at: null },
  { id: 'rx', rule_key: 'hydration', body: 'Mineral-rich water.', version: 1, retired_at: null },
];
const PROPOSAL = {
  id: 'p1', kind: 'rule_revision', target: 'morning_light',
  to_value: 'Fifteen minutes before nine.', decided_by: 'micah', decided_at: '2026-10-19T00:00:00Z',
};
const after = applyRuleRevision(RULES_BEFORE, PROPOSAL, 'r2');
t('a new row is added', after.rules.length, RULES_BEFORE.length + 1);
t('  at the next version', after.rules.find((r) => r.id === 'r2').version, 2);
t('  pointing at what it supersedes', after.rules.find((r) => r.id === 'r2').supersedes_id, 'r1');
t('THE OLD ROW IS STILL THERE', !!after.rules.find((r) => r.id === 'r1'), true);
t('  and still says exactly what it said',
  after.rules.find((r) => r.id === 'r1').body, 'Ten minutes before nine.');
t('  and was not retired, marked or edited',
  after.rules.find((r) => r.id === 'r1').retired_at, null);
t('  and the input array was not mutated', RULES_BEFORE.length, 2);
t('an unrelated rule is untouched',
  after.rules.find((r) => r.id === 'rx').body, 'Mineral-rich water.');
t('the first revision of a rule that does not exist yet starts at version 1',
  applyRuleRevision([], { ...PROPOSAL, target: 'new_rule' }, 'n1').rules[0].version, 1);

// ---------------------------------------------------------------------
console.log('\n6. A declined finding is kept');
// ---------------------------------------------------------------------
const FINDINGS = [
  { id: 'f1', title: 'A paper', status: 'candidate' },
  { id: 'f2', title: 'Another', status: 'candidate' },
];
const declined = applyFindingDecision(FINDINGS, 'f1', {
  status: 'declined', decided_by: 'micah', decided_at: '2026-10-19T00:00:00Z',
  note: 'out of thesis',
});
t('the row is still in the table', declined.length, 2);
t('  with status declined', declined.find((f) => f.id === 'f1').status, 'declined');
t('  and who decided', declined.find((f) => f.id === 'f1').decided_by, 'micah');
t('  and when', !!declined.find((f) => f.id === 'f1').decided_at, true);
t('  and the title is still readable, so the record is auditable',
  declined.find((f) => f.id === 'f1').title, 'A paper');
t('the other row is untouched', declined.find((f) => f.id === 'f2').status, 'candidate');
t('the input array was not mutated', FINDINGS[0].status, 'candidate');

// ---------------------------------------------------------------------
console.log('\n7. The tier comes from the design, never the journal');
// ---------------------------------------------------------------------
t('a replicated meta-analysis is established', tierForDesign('review', { replicated: true }).tier, 'established');
t('a single RCT is emerging, not strong', tierForDesign('human_rct', {}).tier, 'emerging');
t('a replicated RCT is strong', tierForDesign('human_rct', { replicated: true }).tier, 'strong');
t('a single cohort is contested', tierForDesign('human_observational', {}).tier, 'contested');
t('animal work is hypothesis', tierForDesign('animal', {}).tier, 'hypothesis');
t('cell work is hypothesis', tierForDesign('cell', {}).tier, 'hypothesis');
t('an unknown design proposes NO tier', tierForDesign('journal_article', {}).tier, null);
t('every reason names the design or the replication, never a journal',
  ['review', 'human_rct', 'human_observational', 'animal', 'cell', 'theory']
    .every((s) => /trial|observational|cohort|animal|cell|vitro|theoretic|review|meta|replicat/i
      .test(tierForDesign(s, {}).reason)), true);

// Tier floor for auto-accept.
t('contested is NOT above emerging', TIER_RANK.contested < TIER_RANK.emerging, true);
t('a contested paper cannot auto-accept',
  canAutoAccept({ ...GOOD, proposed_tier: 'contested' }).accept, false);
t('a hypothesis paper cannot auto-accept',
  canAutoAccept({ ...GOOD, proposed_tier: 'hypothesis' }).accept, false);
t('an emerging paper can', canAutoAccept({ ...GOOD, proposed_tier: 'emerging' }).accept, true);
t('the floor is emerging', AUTO_ACCEPT_MIN_TIER, 'emerging');

// ---------------------------------------------------------------------
console.log('\n8. Products, DOIs, audits and dedupe');
// ---------------------------------------------------------------------
t('a supplement trial is a product paper',
  isProductPaper('Effect of omega-3 supplementation on mood'), true);
t('a probiotic trial is a product paper', isProductPaper('A probiotic for sleep'), true);
t('a daylight trial is not', isProductPaper('Morning daylight and circadian phase'), false);
t('a product paper is refused even when the design is strong',
  canAutoAccept({ ...GOOD, title: 'Vitamin D supplementation trial' }).accept, false);

t('no DOI is refused', canAutoAccept({ ...GOOD, doi: null }).blocked_by, 'no DOI');
t('an unconfirmed DOI is refused',
  canAutoAccept({ ...GOOD, doi_confirmed: false }).blocked_by, 'DOI not confirmed a second way');
t('a summary that failed the audit is refused',
  canAutoAccept({ ...GOOD, audit_ok: false }).blocked_by,
  'the summary did not pass the claim-shape audit');
t('two audit failures is an auto-decline',
  canAutoDecline({ ...GOOD, audit_failures: 2 }).decline, true);
t('one audit failure is not', canAutoDecline({ ...GOOD, audit_failures: 1 }).decline, false);

t('a paper is keyed on both identifiers',
  dedupeKeys({ pmid: '12345', doi: '10.1/AB' }), ['pmid:12345', 'doi:10.1/ab']);
t('a paper with only a PMID still has a key', dedupeKeys({ pmid: '9' }), ['pmid:9']);
t('a paper with only a DOI still has a key', dedupeKeys({ doi: '10.2/x' }), ['doi:10.2/x']);
t('DOI keys are case-folded, so one paper is not two',
  dedupeKeys({ doi: '10.1/AB' })[0], dedupeKeys({ doi: '10.1/ab' })[0]);

console.log('\n%d case(s) failed', bad);
process.exit(bad ? 1 : 0);
