// Cloudflare Pages Function. POST /api/waitlist
// Env vars (Cloudflare dashboard > Settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL

import { derive, OUTSIDE_US, STATE_NAMES } from './_geo.js';

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
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const state = String(body.state || '').trim().slice(0, 60);
  const source = String(body.source || '').trim().slice(0, 300);
  const postal = String(body.postal_code || '').trim().slice(0, 12);
  // The form sends 'US' unless the member picked outside the United States.
  // CF-IPCountry is where they are RIGHT NOW, which is not where they live, so
  // it is kept as a separate signal and never used as the answer.
  const country = String(body.country || '').trim().slice(0, 60);
  const edgeCountry = request.headers.get('CF-IPCountry') || null;
  const preferredStart = String(body.preferred_start_date || '').trim();

  if (!name || !EMAIL_RE.test(email) || !state || !postal || body.consent_contact !== true) {
    return json({ error: 'Check the form and try again' }, 400);
  }

  const placement = cleanPlacement(body.placement);
  if (body.placement && !placement) {
    console.warn(`[waitlist] placement from ${email} was rejected, storing the application without one`);
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
  if (preferredStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredStart)) {
      return json({ error: 'That start date is not a date' }, 400);
    }
    const chk = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_offered_start_date`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_SERVICE_KEY,
                 Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ d: preferredStart }),
    });
    const offered = chk.ok ? await chk.json() : null;
    if (offered !== true) {
      return json({ error: 'That is not one of the available start dates. Programs start on the 1st and the 15th, with enough time before day 1 for your baseline blood draw.' }, 400);
    }
  }

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
    console.warn(`[waitlist] ${email} chose ${state} but ZIP ${postal.slice(0, 3)}xx is in ${geo.region}, timezone marked ask`);
  }

  const row = {
    name,
    email,
    state,
    postal_code: postal,
    timezone: geo.timezone,
    latitude: geo.latitude,
    hemisphere: geo.hemisphere,
    region: geo.region,
    tz_confidence: tzConfidence,
    preferred_start_date: preferredStart || null,
    source: source || null,
    placement,
    placement_version: placement ? 'placement-v1' : null,
    consent_contact: true,
    consent_version: 'contact-v1',
    submitted_at: new Date().toISOString(),
    ip: request.headers.get('CF-Connecting-IP') || null,
    country: (state === OUTSIDE_US ? country : 'US') || edgeCountry,
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/applications`, {
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
  let startDateKept = null;
  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 409 || detail.includes('23505')) {
      duplicate = true;
      console.log(`[waitlist] duplicate application from ${email}, the original is kept`);
      // Keeping the first application is right. Letting somebody believe their
      // NEW start date took effect is not. A person who resubmits is usually
      // unsure the first one worked, but a person who resubmits with a different
      // date is trying to change it, and they have to be told it did not.
      if (preferredStart) {
        try {
          const cur = await fetch(
            `${env.SUPABASE_URL}/rest/v1/applications?email=eq.${encodeURIComponent(email)}&select=preferred_start_date`,
            { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                         Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
          const rows = cur.ok ? await cur.json() : [];
          const stored = rows && rows[0] ? rows[0].preferred_start_date : null;
          if (stored && stored !== preferredStart) startDateKept = stored;
        } catch (e) {
          console.warn('[waitlist] could not compare start dates:', String(e).slice(0, 120));
        }
      }
    } else {
      console.error('supabase insert failed', res.status, detail);
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
    const send = async (label, to, subject, text) => {
      let res;
      try {
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, text }),
        });
      } catch (e) {
        const why = `${label} email to ${to} threw: ${(e && e.message) || e}`;
        console.error(`[waitlist] EMAIL FAILED ${why}`);
        emailProblems.push(why);
        return;
      }
      // Resend answers 4xx and 5xx with a JSON body. A non-ok response
      // resolves normally, so it has to be checked, not just caught.
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 500); } catch { detail = '(body unreadable)'; }
        const why = `${label} email to ${to} rejected: HTTP ${res.status} from=${env.FROM_EMAIL} ${detail}`;
        console.error(`[waitlist] EMAIL FAILED ${why}`);
        emailProblems.push(why);
      }
    };

    await Promise.all([
      send(
        'applicant',
        email,
        'Your application to The Human Battery Project',
        `${name},\n\nWe have your application.\n\nYou can start on the 1st or the 15th of any month. Next we will send you the protocol for your tier, the blood panel, what the lab will cost, and the start dates you can choose from. Nothing is committed until you pay.\n\nReply to this email with any questions.\n\nThe Human Battery Project`
      ),
      env.NOTIFY_EMAIL
        ? send(
            'notification',
            env.NOTIFY_EMAIL,
            `New application: ${name}`,
            `Name: ${name}\nEmail: ${email}\nState: ${state}\nWants to start: ${preferredStart || 'no date chosen'}\nLocation: ${postal} ${row.country}, ${row.timezone || 'timezone not derived'}, lat ${row.latitude === null ? 'unknown' : row.latitude}, ${row.hemisphere}${tzConfidence === 'ask' ? ' >> CONFIRM THE TIMEZONE WITH THEM BEFORE THE FIRST BRIEF' : ''}\nSource: ${source || 'none given'}\nPlacement: ${placement ? JSON.stringify(placement) : 'not answered'}\nSubmitted: ${row.submitted_at}`
          )
        : (emailProblems.push('NOTIFY_EMAIL is not set, so no notification was sent'), undefined),
    ]);
  }

  if (emailProblems.length) {
    // One line per application so it is greppable in `wrangler pages deployment tail`.
    console.error(
      `[waitlist] APPLICATION SAVED BUT EMAIL DID NOT FULLY SEND. id=${row.email} problems=${JSON.stringify(emailProblems)}`
    );
  }

  return json({
    ok: true, duplicate,
    start_date_kept: startDateKept,
    message: startDateKept
      ? `We already have your application, and it is still set to start on ${startDateKept}. We have not changed it to the date you just picked. Reply to the email we sent and we will move you.`
      : null,
  });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
