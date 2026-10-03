// Cloudflare Pages Function. POST /api/waitlist
//
// APPLYING IS ON HOLD, ruled 2026-10-02. People still answer the placement
// questions, and what happens next is a WAITLIST ENTRY and one email. No
// application row, no portal account, no sign-in link, no tier email, no First
// Steps PDF, no payment, and the onboarding agent does not run.
//
// The entry goes to its own table, not to applications. An application is a
// request that something downstream acts on; a waitlist entry is a name and an
// answer sheet that nothing acts on until a human opens a group.
// Env vars (Cloudflare dashboard > Settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL

import { derive, OUTSIDE_US, STATE_NAMES } from './_geo.js';
import { emailTag, placeTag, scrub } from './_redact.js';
import { rateLimit, tooMany, callerIp } from './_ratelimit.js';
import { SUBJECT as WAITLIST_SUBJECT, waitlistText, waitlistHtml,
         WAITLIST_REPLY_TO } from './_email_waitlist.js';

// The groups somebody on the list is waiting for. Stated once, read by the
// endpoint and by the confirmation page.
export const NEXT_GROUPS = ['November 1', 'November 15'];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// The seven rows of the placement table in docs/HBP-Protocol-Complete.md.
// The form sends one tier name per row. The tier itself is not computed
// here: suggest_tier() in the database does that, on a trigger, so the
// suggestion can never drift from the answers it came from.
const PLACEMENT_KEYS = ['training', 'cold', 'sauna', 'fasting', 'food', 'morning_light', 'sleep'];
const TIERS = ['beginner', 'intermediate', 'advanced', 'pro'];

// Anything that is not seven valid answers is stored as no placement at
// all. A partial or hand-edited set must not produce a tier: an applicant
// placed on garbage gets the wrong protocol, and nothing downstream would
// ever show that it happened.
function cleanPlacement(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const k of PLACEMENT_KEYS) {
    const v = raw[k];
    if (typeof v !== 'string' || !TIERS.includes(v)) return null;
    out[k] = v;
  }
  return out;
}

export async function onRequestPost({ request, env }) {
  // This endpoint writes a row and had no limit at all, which is how a waitlist
  // becomes a table of rubbish that somebody then has to read through to find the
  // real people.
  const limit = await rateLimit(env, 'waitlist_ip', callerIp(request));
  if (!limit.allowed) return tooMany(limit, 'sign-ups from this connection');

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  // First and last separately, ruled 2026-10-02. The old applications table held
  // one `name` field, which cannot be used to address somebody by first name.
  const firstName = String(body.first_name || '').trim().slice(0, 80);
  const lastName = String(body.last_name || '').trim().slice(0, 80);
  const name = [firstName, lastName].filter(Boolean).join(' ').slice(0, 160);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const state = String(body.state || '').trim().slice(0, 60);
  const source = String(body.source || '').trim().slice(0, 300);
  const postal = String(body.postal_code || '').trim().slice(0, 12);
  // The form sends 'US' unless the member picked outside the United States.
  // CF-IPCountry is where they are RIGHT NOW, which is not where they live, so
  // it is kept as a separate signal and never used as the answer.
  const country = String(body.country || '').trim().slice(0, 60);
  const edgeCountry = request.headers.get('CF-IPCountry') || null;

  if (!firstName || !lastName || !EMAIL_RE.test(email) || !state || !postal || body.consent_contact !== true) {
    return json({ error: 'Check the form and try again' }, 400);
  }

  const placement = cleanPlacement(body.placement);
  if (body.placement && !placement) {
    console.warn(`[waitlist] placement from ${await emailTag(email)} was rejected, storing the application without one`);
  }

  // Timezone, latitude and hemisphere from the postal code. This is the only
  // place the derivation runs for an application, and its confidence is stored
  // with the result: 'ask' means the ZIP could not settle the timezone and the
  // member has to confirm it before a brief is scheduled, because a wrong
  // timezone sends the brief on the wrong day.
  // The chosen start date must be one the program actually offers. Checked by
  // is_offered_start_date() in the database rather than by re-deriving the 1st and
  // 15th here: the lead time exists so the baseline draw happens before day 1, and
  // a second implementation of that rule would eventually accept a date that does
  // not leave time for it.
  // The preferred start date went with applying. The groups are fixed at
  // November 1 and November 15, and a person on the list does not pick one.

  const geo = derive(postal, state === OUTSIDE_US ? country : 'US');
  if (!geo.ok) {
    return json({ error: 'That does not look like a US ZIP code' }, 400);
  }
  // A stated state that disagrees with the ZIP means one of the two is wrong.
  // The ZIP is kept, because it is what the derivation ran on, but the timezone
  // drops to 'ask' rather than trusting a contradiction.
  let tzConfidence = geo.tz_confidence;
  if (state !== OUTSIDE_US && geo.region && STATE_NAMES[geo.region] !== state) {
    tzConfidence = 'ask';
    // Was: the address, the chosen state, the first three digits of the postal
      // code and the derived region, all on one line. Identity plus location. The
      // CONTRADICTION is what is worth logging, and it can be logged without naming
      // anybody or narrowing them to a few streets.
      console.warn(`[waitlist] ${await emailTag(email)} chose a state that contradicts their postal code (${placeTag(geo.region)}), timezone marked ask`);
  }

  const row = {
    first_name: firstName,
    last_name: lastName,
    email,
    state,
    postal_code: postal,
    timezone: geo.timezone,
    source: source || null,
    placement: placement || {},
    placement_version: placement ? 'placement-v1' : null,
    consent_contact: true,
    consent_version: 'contact-v1',
    joined_at: new Date().toISOString(),
    ip: request.headers.get('CF-Connecting-IP') || null,
    country: (state === OUTSIDE_US ? country : 'US') || edgeCountry,
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/waitlist`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });

  // A second application from the same address is not a failure. There is a
  // unique index on lower(email), so the insert is rejected with 23505 and the
  // first application stands. Telling that person "we could not save that" is
  // both wrong and the worst possible moment to show an error, because they are
  // usually resubmitting precisely because they are unsure the first one worked.
  let duplicate = false;
  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 409 || detail.includes('23505')) {
      duplicate = true;
      console.log(`[waitlist] duplicate application from ${await emailTag(email)}, the original is kept`);
    } else {
      // detail is PostgREST's error body, which ECHOES THE FAILING ROW: name, email,
        // state and postal code together. An insert failure is exactly when somebody
        // goes looking at logs, so this was an identity dump waiting for a bad day.
        console.error('[waitlist] supabase insert failed', res.status, scrub(detail));
      return json({ error: 'We could not save that' }, 500);
    }
  }

  // Email is best effort: the application is already saved, so a mail
  // failure must not fail the request. It must not be invisible either.
  const emailProblems = [];

  if (!env.RESEND_API_KEY) {
    emailProblems.push('RESEND_API_KEY is not set');
  } else if (!env.FROM_EMAIL) {
    emailProblems.push('FROM_EMAIL is not set');
  } else {
    const send = async (label, to, subject, text, html, replyTo) => {
      let res;
      try {
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
            body: JSON.stringify({
              from: env.FROM_EMAIL, to, subject, text,
              ...(html ? { html } : {}),
              ...(replyTo ? { reply_to: replyTo } : {}),
            }),
        });
      } catch (e) {
        const why = `${label} email to ${to} threw: ${(e && e.message) || e}`;
        console.error(`[waitlist] EMAIL FAILED ${scrub(why)}`);
        emailProblems.push(why);
        return;
      }
      // Resend answers 4xx and 5xx with a JSON body. A non-ok response
      // resolves normally, so it has to be checked, not just caught.
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 500); } catch { detail = '(body unreadable)'; }
        const why = `${label} email to ${to} rejected: HTTP ${res.status} from=${env.FROM_EMAIL} ${detail}`;
        console.error(`[waitlist] EMAIL FAILED ${scrub(why)}`);
        emailProblems.push(why);
      }
    };

    await Promise.all([
      send(
          'waitlist',
        email,
          WAITLIST_SUBJECT,
          waitlistText(firstName),
          waitlistHtml(firstName),
          WAITLIST_REPLY_TO,
      ),
      env.NOTIFY_EMAIL
        ? send(
            'notification',
            env.NOTIFY_EMAIL,
            // NOT `New application: ${name}`. The subject is what appears on a lock
            // screen, and a name there tells anybody who can see the phone that this
            // person applied to a health program. The name is in the body, which
            // requires opening the mail.
            'New application received',
            `Name: ${name}\nEmail: ${email}\nState: ${state}\nLocation: ${postal} ${row.country}, ${row.timezone || 'timezone not derived'}, lat ${row.latitude === null ? 'unknown' : row.latitude}, ${row.hemisphere}${tzConfidence === 'ask' ? ' >> CONFIRM THE TIMEZONE WITH THEM BEFORE THE FIRST BRIEF' : ''}\nSource: ${source || 'none given'}\nPlacement: ${placement ? JSON.stringify(placement) : 'not answered'}\nJoined: ${row.joined_at}`
          )
        : (emailProblems.push('NOTIFY_EMAIL is not set, so no notification was sent'), undefined),
    ]);
  }

  if (emailProblems.length) {
    // One line per application so it is greppable in `wrangler pages deployment tail`.
    console.error(
      `[waitlist] APPLICATION SAVED BUT EMAIL DID NOT FULLY SEND. ${await emailTag(row.email)} problems=${scrub(JSON.stringify(emailProblems))}`
    );
  }

  // The confirmation page reads this, so the page and the email cannot
  // disagree about which groups are next.
  return json({ ok: true, duplicate, next_groups: NEXT_GROUPS });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
