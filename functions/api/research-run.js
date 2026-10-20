// The research agent. POST /api/research-run
//
// The ninth agent inside the product, with the same standing as the other
// eight. It searches for new work every day, judges it against the canonical
// thesis, adds what has value to the research library, and proposes protocol
// changes as it learns. IT NEVER CHANGES THE THESIS. The book is canonical and
// docs/HBP-Canonical-Positions.md is the operative extract: this reads them and
// does not write them, and anything that would change the thesis goes to Micah
// as a question rather than into the product.
//
// Called by workers/brief.js at one UTC hour of its own, carrying
// WEBHOOK_SECRET, exactly as the other scheduled endpoints are. No new Worker
// and no new cron trigger: the account has one trigger and the hour decides.
//
// WHAT IT MAY DO ON ITS OWN, and the shape of the limit. It may accept a paper
// into the library when every one of the bounds in _research.js holds. It may
// decline one that is out of thesis, a preprint, or about a product. Anything
// else goes to a person. The bounds are in _research.js rather than here
// because a bound inside the agent's own runtime is one the agent's next
// revision can widen without anyone noticing, and because a pure function is a
// thing a fixture can assert on.
//
// COST. At most MAX_PER_RUN abstracts judged, one model call for the judgement
// and one for the summary, claude-sonnet-5 for both. A summary that fails the
// claim-shape audit gets ONE rewrite attempt, which is a third call and only on
// failure; a second failure is prohibited_shape and goes to Micah.

import {
  json, db, ask, startRun, finishRun, hasServiceSecret, verifyStaff, sendEmail,
  MODEL_PER_CLIENT,
} from './_agent.js';
import { CANONICAL_POSITIONS, CANONICAL_POSITIONS_SHA } from './_canon.js';
import { auditClaimShape } from './_claimshape.js';
import { evaluate } from './_autonomy.js';
import {
  canAutoAccept, canAutoDecline, needsAPerson, tierForDesign, proposalVerdict,
  dedupeKeys, isProductPaper,
  RESEARCH_AUTONOMY_MODE, MAX_PER_RUN, BACKFILL_MONTHS, DAILY_WINDOW_DAYS,
} from './_research.js';
import { shell, h2, p as para, small, ul } from './_email_brand.js';
import { stripDashes } from './_voice.js';

const AGENT = 'research';
const PROMPT_VERSION = 'research-judge-1';
const SUMMARY_VERSION = 'research-summary-1';

// Courtesy to the E-utilities. Without a key NCBI asks for no more than three
// requests a second, so requests are serialised with a gap rather than fanned
// out. A 429 from NCBI is a ban that outlives this run.
const NCBI_GAP_MS = 400;
const TOOL = 'human-battery-project';

// The settings key that says the twelve-month backfill is finished. Derived
// state would be cheaper to write and impossible to read: "are we still
// backfilling" is a question a person will ask.
const BACKFILL_KEY = 'research_backfill_complete';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function onRequestPost({ request, env }) {
  if (!hasServiceSecret(request, env)) {
    const staff = await verifyStaff(request, env);
    if (!staff) return json({ error: 'no' }, 403);
  }
  try {
    return json(await run(env));
  } catch (e) {
    console.error('[research] ' + (e && e.stack ? e.stack : e));
    return json({ error: 'research run failed', detail: String(e).slice(0, 300) }, 500);
  }
}

// ---------------------------------------------------------------------
// PubMed. efetch for titles, never esummary.
// ---------------------------------------------------------------------
// CLAUDE.md records three metadata failures in this project and they all have
// one shape: the part that got dropped was the part that carried the meaning.
// esummary truncated Togo 2012 at "Fischer 344 rats" and lost "but not in
// same-age Wistar rats", which is the whole finding. So: efetch.

async function eutils(path, params) {
  const u = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/' + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('tool', TOOL);
  const res = await fetch(u.toString(), { headers: { accept: '*/*' } });
  if (!res.ok) throw new Error(`eutils ${path} ${res.status}`);
  return res.text();
}

async function esearch(query, days) {
  const xml = await eutils('esearch.fcgi', {
    db: 'pubmed', term: query, retmax: '100', retmode: 'xml',
    datetype: 'pdat', reldate: String(days),
  });
  return [...xml.matchAll(/<Id>(\d+)<\/Id>/g)].map((m) => m[1]);
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : '';
};
const detag = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

/** Full records for a batch of PMIDs, from efetch. */
async function efetch(pmids) {
  if (!pmids.length) return [];
  const xml = await eutils('efetch.fcgi', {
    db: 'pubmed', id: pmids.join(','), retmode: 'xml',
  });
  const out = [];
  for (const m of xml.matchAll(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g)) {
    const a = m[0];
    const pmid = detag(tag(a, 'PMID'));
    // ArticleTitle whole, never truncated at a colon or anywhere else.
    const title = detag(tag(a, 'ArticleTitle'));
    const journal = detag(tag(a, 'Title'));
    const year = Number(detag(tag(a, 'Year'))) || null;
    const abstract = [...a.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
      .map((x) => detag(x[1])).join(' ');
    const authors = [...a.matchAll(/<Author[^>]*>[\s\S]*?<\/Author>/g)].map((x) => {
      const last = detag(tag(x[0], 'LastName'));
      const init = detag(tag(x[0], 'Initials'));
      return [last, init].filter(Boolean).join(' ');
    }).filter(Boolean);
    const pubTypes = [...a.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)]
      .map((x) => detag(x[1]));
    const doiMatch = a.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
    const doi = doiMatch ? detag(doiMatch[1]) : null;
    if (pmid && title) {
      out.push({ pmid, title, journal, year, abstract, authors, pubTypes, doi });
    }
  }
  return out;
}

/**
 * The design PubMed's PublicationType names, or null when it names none.
 *
 * CLAUDE.md: PublicationType is a bibliographic tag and not a design field. It
 * often carries nothing but Journal Article plus Research Support funding tags.
 * When it names no design, the model reads the methods and the report says
 * PublicationType did not supply it. NEVER stretch Journal Article into a
 * design. Wong-Riley 2005 is the worked example: Journal Article plus three
 * funding tags, naming no design at all, and the methods are primary cultured
 * neurons, so the value is cell.
 */
export function designFromPublicationTypes(types) {
  const t = (types || []).map((x) => String(x).toLowerCase());
  const has = (s) => t.some((x) => x.includes(s));
  if (has('meta-analysis') || has('systematic review')) return 'review';
  if (has('randomized controlled trial')) return 'human_rct';
  if (has('observational study') || has('cohort stud') || has('case-control')) {
    return 'human_observational';
  }
  if (has('review')) return 'review';
  // Journal Article and the Research Support tags name no design. Say so by
  // returning null rather than guessing.
  return null;
}

// ---------------------------------------------------------------------
// Crossref CONFIRMS a DOI. It never supplies a field PubMed has.
// ---------------------------------------------------------------------
// Crossref returned ONE author for Kodama 2009 where PubMed returns twelve,
// and truncated Wong-Riley 2005 at the colon, dropping the clause the citation
// exists to carry. And a failed request is not evidence a reference is dead:
// 10.1111/joim.12496 failed three consecutive Crossref lookups while resolving
// perfectly at doi.org. So: retry three times, then check a second way.
async function confirmDoi(doi, title) {
  if (!doi) return { confirmed: false, how: 'no DOI to confirm' };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.crossref.org/works/' + encodeURIComponent(doi),
        { headers: { 'User-Agent': TOOL + ' (mailto:admin@thehumanbatteryproject.com)' } });
      if (res.ok) {
        const d = await res.json();
        const t = ((d.message && d.message.title) || [])[0] || '';
        const same = sameWork(t, title);
        return {
          confirmed: same,
          how: same ? 'Crossref resolved the DOI and the title matches'
                    : 'Crossref resolved the DOI but the title does not match PubMed',
          crossrefTitle: t,
        };
      }
    } catch (_e) { /* fall through to the next attempt */ }
    await sleep(300 * attempt);
  }
  // The second way. A failed Crossref lookup is not evidence of a dead DOI.
  try {
    const res = await fetch('https://doi.org/' + encodeURIComponent(doi), {
      method: 'HEAD', redirect: 'follow',
    });
    if (res.ok) {
      return { confirmed: true, how: 'Crossref failed three times; doi.org resolved it' };
    }
  } catch (_e) { /* genuinely unresolvable */ }
  return { confirmed: false, how: 'three Crossref attempts and doi.org all failed' };
}

/** Same paper, allowing for punctuation and case. Crossref truncates titles. */
function sameWork(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // Crossref truncating at a colon is a known failure, not a different paper.
  return x.startsWith(y.slice(0, 60)) || y.startsWith(x.slice(0, 60));
}

/** Europe PMC, for an open full text when there is one. Never required. */
async function europePmcOpenText(pmid) {
  try {
    const res = await fetch(
      'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:' +
      encodeURIComponent(pmid) + '&resultType=core&format=json');
    if (!res.ok) return null;
    const d = await res.json();
    const r = ((d.resultList && d.resultList.result) || [])[0];
    if (!r) return null;
    return {
      openAccess: r.isOpenAccess === 'Y',
      preprint: String(r.pubType || '').toLowerCase().includes('preprint'),
    };
  } catch (_e) { return null; }
}

// ---------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------
async function run(env) {
  const sb = db(env);
  const runId = await startRun(env, AGENT, { model: MODEL_PER_CLIENT });
  const started = Date.now();
  let tokensIn = 0, tokensOut = 0, calls = 0;

  try {
    const queries = await sb.select('research_queries', {
      where: { is_active: 'eq.true' }, order: 'position_key',
    });
    if (!queries.length) {
      await finishRun(env, runId, 'ok', { error: 'no active queries' });
      return { ran: AGENT, queries: 0, note: 'no active research_queries. Seed them first.' };
    }

    const flag = await sb.one('program_settings', { where: { key: 'eq.' + BACKFILL_KEY } });
    const backfilling = !(flag && String(flag.value) === 'true');
    const windowDays = backfilling ? Math.round(BACKFILL_MONTHS * 30.44) : DAILY_WINDOW_DAYS;

    // ---- search ----
    const seenIds = new Map();     // pmid -> the query that found it first
    for (const q of queries) {
      try {
        const ids = await esearch(q.query, windowDays);
        for (const id of ids) if (!seenIds.has(id)) seenIds.set(id, q);
      } catch (e) {
        console.warn('[research] esearch failed for ' + q.id + ': ' + String(e).slice(0, 120));
      }
      await sleep(NCBI_GAP_MS);
    }

    // ---- dedupe against what has already been judged ----
    // A paper is judged ONCE. Checked against the table and not against this
    // run's memory, because the backfill runs over many days.
    const allIds = [...seenIds.keys()];
    const known = new Set();
    for (let i = 0; i < allIds.length; i += 100) {
      const chunk = allIds.slice(i, i + 100);
      const rows = await sb.select('research_findings', {
        columns: 'pmid', where: { pmid: 'in.(' + chunk.join(',') + ')' },
      });
      for (const r of rows) known.add(String(r.pmid));
    }
    const fresh = allIds.filter((id) => !known.has(id));
    const batch = fresh.slice(0, MAX_PER_RUN);

    // Backfill is complete when a run over the twelve-month window finds
    // nothing it has not already judged.
    if (backfilling && fresh.length === 0) {
      await sb.insert('program_settings', {
        key: BACKFILL_KEY, value: 'true',
        description: 'The research agent has caught up with the ' + BACKFILL_MONTHS +
          ' month backfill. It now searches the last ' + DAILY_WINDOW_DAYS + ' days.',
      }, { upsert: 'key' });
    }

    // ---- judge ----
    const results = [];
    for (const pmid of batch) {
      const q = seenIds.get(pmid);
      const recs = await efetch([pmid]);
      await sleep(NCBI_GAP_MS);
      const rec = recs[0];
      if (!rec) continue;

      const epmc = await europePmcOpenText(pmid);
      const isPreprint = !!(epmc && epmc.preprint);
      const doiCheck = await confirmDoi(rec.doi, rec.title);

      // One model call for the judgement.
      let judged;
      try {
        const r = await ask(env, {
          model: MODEL_PER_CLIENT,
          maxTokens: 900,
          system: JUDGE_SYSTEM,
          messages: [{ role: 'user', content: judgePrompt(rec, q) }],
        });
        calls++; tokensIn += r.tokensIn || 0; tokensOut += r.tokensOut || 0;
        await sb.insert('ai_calls', {
          client_id: null, component: 'reviewer', agent: AGENT,
          model: r.model || MODEL_PER_CLIENT, prompt_version: PROMPT_VERSION,
          canon_version: CANONICAL_POSITIONS_SHA,
          tokens_in: r.tokensIn, tokens_out: r.tokensOut,
        });
        judged = parseJson(r.text);
      } catch (e) {
        console.warn('[research] judgement failed for ' + pmid + ': ' + String(e).slice(0, 140));
        continue;
      }
      if (!judged) continue;

      // The design: PublicationType when it names one, otherwise the model's
      // reading of the methods, and the record says which.
      const fromTags = designFromPublicationTypes(rec.pubTypes);
      const studyType = fromTags || judged.study_type || null;
      const designSource = fromTags
        ? 'PubMed PublicationType'
        : 'PublicationType named no design, so the methods were read';

      const tierCall = tierForDesign(studyType, { replicated: !!judged.replicated });

      // One model call for the summary, plus at most one rewrite.
      let summary = null, auditOk = false, auditFailures = 0, auditFindings = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await ask(env, {
            model: MODEL_PER_CLIENT,
            maxTokens: 500,
            system: SUMMARY_SYSTEM,
            messages: [{
              role: 'user',
              content: summaryPrompt(rec, tierCall, attempt === 0 ? null : auditFindings),
            }],
          });
          calls++; tokensIn += r.tokensIn || 0; tokensOut += r.tokensOut || 0;
          await sb.insert('ai_calls', {
            client_id: null, component: 'explainer', agent: AGENT,
            model: r.model || MODEL_PER_CLIENT, prompt_version: SUMMARY_VERSION,
            canon_version: CANONICAL_POSITIONS_SHA,
            tokens_in: r.tokensIn, tokens_out: r.tokensOut,
          });
          summary = stripDashes(String(r.text || '').trim());
        } catch (e) {
          console.warn('[research] summary failed for ' + pmid + ': ' + String(e).slice(0, 140));
          break;
        }
        const a = auditClaimShape(summary);
        auditFindings = a.findings;
        if (a.ok) { auditOk = true; break; }
        auditFailures++;
      }

      let verdict = judged.verdict;
      if (!auditOk && auditFailures >= 2) verdict = 'prohibited_shape';

      const candidate = {
        verdict,
        proposed_tier: tierCall.tier,
        is_preprint: isPreprint,
        doi: rec.doi,
        doi_confirmed: doiCheck.confirmed,
        audit_ok: auditOk,
        audit_failures: auditFailures,
        title: rec.title,
        abstract: rec.abstract,
      };

      const accept = canAutoAccept(candidate);
      const decline = canAutoDecline(candidate);
      const escalate = needsAPerson(candidate);

      // Escalation wins over everything. A contradiction is never auto-declined
      // and never auto-accepted: dropping one would be a way of losing it that
      // looks like a decision.
      let status = 'candidate', decidedAt = null;
      if (!escalate.escalate) {
        if (accept.accept) { status = 'accepted'; decidedAt = new Date().toISOString(); }
        else if (decline.decline) { status = 'declined'; decidedAt = new Date().toISOString(); }
      }

      const row = {
        query_id: q ? q.id : null,
        pmid: rec.pmid,
        doi: rec.doi,
        title: rec.title,
        authors: rec.authors,
        journal: rec.journal,
        year: rec.year,
        study_type: studyType,
        is_preprint: isPreprint,
        position_key: judged.position_key || (q ? q.position_key : null),
        pillar_key: judged.pillar_key || (q ? q.pillar_key : null),
        dimension: judged.dimension || (q ? q.dimension : null),
        verdict,
        proposed_tier: tierCall.tier,
        tier_reason: tierCall.reason + ' (' + designSource + ')',
        summary: auditOk ? summary : null,
        counter_evidence: judged.counter_evidence || null,
        canon_sha: CANONICAL_POSITIONS_SHA,
        status,
        decided_at: decidedAt,
      };

      let saved;
      try {
        saved = (await sb.insert('research_findings', row, { returning: true }))[0];
      } catch (e) {
        // A duplicate is a paper two queries found in the same run. Not an error.
        console.warn('[research] insert skipped for ' + pmid + ': ' + String(e).slice(0, 120));
        continue;
      }

      // ---- accepted findings join the library ----
      if (status === 'accepted' && saved) {
        try {
          const src = (await sb.insert('knowledge_sources', {
            kind: 'citation_summary',
            title: rec.title,
            citation_id: 'pmid:' + rec.pmid,
            evidence_tier: tierCall.tier,
            authors: rec.authors,
            year: rec.year,
            doi: rec.doi,
            url: rec.doi ? 'https://doi.org/' + rec.doi : null,
            content_sha: await sha256(summary),
          }, { returning: true }))[0];
          await sb.insert('knowledge_passages', {
            source_id: src.id,
            ord: 0,
            passage: summary,
            // No embedding. The whole corpus is unembedded until VOYAGE_API_KEY
            // exists: search_passages falls back to lexical ts_rank_cd when the
            // vector is null, so this is retrievable today and better later.
            // scripts/load_corpus.py --reembed is the one command to run then.
            embedding: null,
            evidence_tier: tierCall.tier,
            tier_reviewed: false,
            subsystems: [],
          });
          await sb.update('research_findings', { id: 'eq.' + saved.id }, { source_id: src.id });
        } catch (e) {
          console.warn('[research] library write failed for ' + pmid + ': ' + String(e).slice(0, 160));
        }
      }

      results.push({ ...row, id: saved ? saved.id : null, blocked_by: accept.blocked_by });
    }

    // ---- the digest ----
    const digest = await sendDigest(env, sb, {
      results, backfilling, remaining: Math.max(0, fresh.length - batch.length),
      queries: queries.length, windowDays, calls, tokensIn, tokensOut,
      seconds: Math.round((Date.now() - started) / 1000),
    });

    await finishRun(env, runId, 'ok', { tokens_in: tokensIn, tokens_out: tokensOut });

    return {
      ran: AGENT,
      backfilling,
      window_days: windowDays,
      queries: queries.length,
      found: allIds.length,
      already_judged: known.size,
      judged: results.length,
      remaining_in_backfill: Math.max(0, fresh.length - batch.length),
      accepted: results.filter((r) => r.status === 'accepted').length,
      declined: results.filter((r) => r.status === 'declined').length,
      waiting: results.filter((r) => r.status === 'candidate').length,
      contradictions: results.filter((r) => r.verdict === 'contradicts').length,
      model_calls: calls,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      digest_sent: digest,
    };
  } catch (e) {
    await finishRun(env, runId, 'error', { error: String(e).slice(0, 300) });
    throw e;
  }
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_e) { return null; }
}

// ---------------------------------------------------------------------
// The prompts
// ---------------------------------------------------------------------
const JUDGE_SYSTEM = `You judge whether a published paper bears on The Human Battery Project's
canonical thesis. You are not writing for a member and nothing you write here is shown to one.

THE THESIS IS NOT YOURS TO CHANGE. Judge the paper against the positions below. A paper that
would require the thesis to change is 'contradicts', which is a real and useful answer, not a
failure. Never reshape a position to fit a paper.

Reply with JSON only:
{
  "verdict": "supports" | "refines" | "contradicts" | "out_of_thesis",
  "position_key": "the section of the canonical positions it bears on, or null",
  "pillar_key": "one of morning_daylight, hydration, movement, food_timing, heat_and_cold, sleep, nighttime_darkness, or null",
  "dimension": "one of flow, capacity, timing, structure, environment, or null",
  "study_type": "human_rct | human_observational | animal | cell | in_vitro | plant | review | textbook | theory",
  "replicated": true | false,
  "counter_evidence": "if it contradicts, what the other side of the argument is. Otherwise null"
}

study_type: read the METHODS. Never guess from the journal and never stretch a generic
publication tag into a design. replicated means independent replication exists, not that the
paper has several arms.

THE FRONTIER DIMENSIONS carry no score and have no instrument: charge, redox and leak. A paper
about measuring any of them is interesting and is still 'out_of_thesis' for our purposes unless
it bears on a scored dimension.

The canonical positions:

` + CANONICAL_POSITIONS;

const SUMMARY_SYSTEM = `You write one paragraph about a published paper, in the voice of The
Human Battery Project, for a research library the coach can draw on.

OUR WORDS ABOUT THE PAPER, NEVER THE PAPER'S TEXT. Do not quote the abstract. Do not paraphrase
it sentence by sentence. Say what was done, in whom, and what was found, in plain language.

HARD RULES. Breaking any of these makes the summary unusable.
- No health claim, no outcome promise, no disease claim, nothing implying medication is unnecessary.
- No em dashes. None. Use a comma or a full stop.
- No supplement, no brand, no product, no price.
- Never say that light, sun, earth or water carries a property the model does not give it:
  light and sun do not charge, fuel, power or energise the body; the earth does not supply
  electrons or antioxidants; water is never structured, hexagonal, coherent or informational.
- Never say a person's score is incomplete, and never give a coverage figure over the model.
- Never say we measure cellular charge, membrane potential or redox state. We do not.
- Say how good the evidence is, using the tier you are given, and never overstate it.

One paragraph. Plain language. Around sixty to a hundred words.`;

function judgePrompt(rec, q) {
  return [
    q ? 'This paper was found by the saved query: ' + q.query : 'No query recorded.',
    q && q.position_key ? 'That query is tied to position: ' + q.position_key : '',
    '',
    'Title: ' + rec.title,
    'Journal: ' + (rec.journal || 'unknown') + '. Year: ' + (rec.year || 'unknown') + '.',
    'PubMed publication types: ' + ((rec.pubTypes || []).join(', ') || 'none given'),
    '',
    'Abstract:',
    rec.abstract || '(no abstract)',
  ].filter(Boolean).join('\n');
}

function summaryPrompt(rec, tierCall, priorFindings) {
  const base = [
    'Title: ' + rec.title,
    'Journal: ' + (rec.journal || 'unknown') + '. Year: ' + (rec.year || 'unknown') + '.',
    'The evidence tier for this design is: ' + (tierCall.tier || 'none') +
      ' (' + tierCall.reason + ').',
    '',
    'Abstract:',
    rec.abstract || '(no abstract)',
  ];
  if (priorFindings && priorFindings.length) {
    base.push('', 'YOUR PREVIOUS ATTEMPT BROKE THESE RULES. Rewrite it so none of them is broken.');
    for (const f of priorFindings) {
      base.push('- ' + f.clause);
      base.push('  The sentence was: "' + f.sentence + '"');
    }
    base.push('Do not whitelist or hedge the sentence. Write a different sentence.');
  }
  return base.join('\n');
}

// ---------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------
async function sendDigest(env, sb, s) {
  if (!env.NOTIFY_EMAIL || !env.RESEND_API_KEY) return false;

  const accepted = s.results.filter((r) => r.status === 'accepted');
  const waiting = s.results.filter((r) => r.status === 'candidate');
  const contradictions = s.results.filter((r) => r.verdict === 'contradicts');
  const declined = s.results.filter((r) => r.status === 'declined');

  // The growth line, per the appendix. Counts come from the table, not from
  // this run's memory, so they describe the library and not the batch.
  const inLibrary = await sb.count('research_findings', { status: 'eq.accepted' });
  const proposalsWaiting = await sb.count('canon_proposals', { status: 'eq.waiting' });

  const lines = [
    `Papers seen: ${s.results.length} judged, from ${s.queries} queries over the last ${s.windowDays} days.`,
    `Accepted into the library: ${accepted.length}.`,
    `Declined: ${declined.length}. Waiting on you: ${waiting.length}.`,
    contradictions.length
      ? `Contradictions recorded: ${contradictions.length}. Each is on your list with both sides shown.`
      : 'No contradictions this run.',
    s.backfilling
      ? `Backfill in progress. ${s.remaining} paper(s) still to judge from the last ${BACKFILL_MONTHS} months.`
      : 'Backfill complete. Searching the last 7 days.',
    '',
    `Findings in the library: ${inLibrary}. Proposals waiting on you: ${proposalsWaiting}.`,
    `Run cost: ${s.calls} model calls, ${s.tokensIn} tokens in, ${s.tokensOut} out, ${s.seconds}s.`,
  ];

  const body =
    h2('The research agent, today') +
    para(lines.slice(0, 5).join(' ')) +
    (accepted.length ? h2('Accepted') + ul(accepted.map(
      (r) => `${r.title} (${r.year || 'n.d.'}), tier ${r.proposed_tier}`)) : '') +
    (waiting.length ? h2('Waiting on you') + ul(waiting.map(
      (r) => `${r.title} (${r.year || 'n.d.'}), ${r.verdict}`)) : '') +
    (contradictions.length ? h2('Contradictions') + ul(contradictions.map(
      (r) => `${r.title}: ${r.counter_evidence || 'counter-evidence recorded on the finding'}`)) : '') +
    small(lines.slice(5).join('<br>'));

  await sendEmail(env, {
    to: env.NOTIFY_EMAIL,
    subject: `Research digest: ${accepted.length} accepted, ${waiting.length} waiting on you`,
    text: lines.join('\n'),
    html: shell('The research agent, today', body),
  });
  return true;
}
