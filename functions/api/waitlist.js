// Cloudflare Pages Function. POST /api/waitlist
// Env vars (Cloudflare dashboard > Settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL

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

  if (!name || !EMAIL_RE.test(email) || !state || body.consent_contact !== true) {
    return json({ error: 'Check the form and try again' }, 400);
  }

  const placement = cleanPlacement(body.placement);
  if (body.placement && !placement) {
    console.warn(`[waitlist] placement from ${email} was rejected, storing the application without one`);
  }

  const row = {
    name,
    email,
    state,
    source: source || null,
    placement,
    placement_version: placement ? 'placement-v1' : null,
    consent_contact: true,
    consent_version: 'contact-v1',
    submitted_at: new Date().toISOString(),
    ip: request.headers.get('CF-Connecting-IP') || null,
    country: request.headers.get('CF-IPCountry') || null,
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
  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 409 || detail.includes('23505')) {
      duplicate = true;
      console.log(`[waitlist] duplicate application from ${email}, the original is kept`);
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
            `Name: ${name}\nEmail: ${email}\nState: ${state}\nSource: ${source || 'none given'}\nPlacement: ${placement ? JSON.stringify(placement) : 'not answered'}\nSubmitted: ${row.submitted_at}`
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

  return json({ ok: true, duplicate });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
