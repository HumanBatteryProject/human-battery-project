// Cloudflare Pages Function — POST /api/waitlist
// Env vars (Cloudflare dashboard > Settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, NOTIFY_EMAIL, FROM_EMAIL

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

  const row = {
    name,
    email,
    state,
    source: source || null,
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

  if (!res.ok) {
    console.error('supabase insert failed', res.status, await res.text());
    return json({ error: 'We could not save that' }, 500);
  }

  if (env.RESEND_API_KEY) {
    const send = (to, subject, text) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, text }),
      }).catch((e) => console.error('resend failed', e));

    await Promise.all([
      send(
        email,
        'Your application — The Human Battery Project',
        `${name},\n\nWe have your application for cohort 01.\n\nNext: we will send the full protocol, the blood panel, and the cohort dates within two business days. Nothing is committed until you confirm your seat.\n\nReply to this email with any questions.\n\nThe Human Battery Project`
      ),
      env.NOTIFY_EMAIL
        ? send(
            env.NOTIFY_EMAIL,
            `New application — ${name}`,
            `Name: ${name}\nEmail: ${email}\nState: ${state}\nSource: ${source || '—'}\nSubmitted: ${row.submitted_at}`
          )
        : null,
    ]);
  }

  return json({ ok: true });
}

export const onRequest = () => json({ error: 'Method not allowed' }, 405);
