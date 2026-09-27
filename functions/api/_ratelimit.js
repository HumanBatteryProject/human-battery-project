// Rate limits for the endpoints anybody on the internet can reach.
// Part G: "rate limits and abuse protections."
//
// The counter and the decision live in one Postgres statement, in
// rate_limit_hit, because abuse arrives in parallel and a read-then-decide check
// lets a burst straight through. Proved: 12 simultaneous requests against a limit
// of 5 allowed exactly 5.
//
// WHAT A BUCKET IS. An endpoint name plus something about the caller. The
// something is an IP, or an email that has been HASHED first: the rate_limits
// table is operational data that gets read while debugging, and an address sitting
// in it in clear text is a participant's identity in a table that has no business
// holding one.

// Per endpoint, so a generous read limit cannot be used to argue for a generous
// write limit. Windows in seconds.
export const LIMITS = {
  // Creates a Stripe session and reveals whether an application was accepted, so
  // it is the most worth limiting of the three.
  checkout_ip:    { limit: 10, windowSeconds: 3600 },
  checkout_email: { limit: 5,  windowSeconds: 3600 },
  // Writes a row. Unlimited, this is how the table fills with rubbish.
  waitlist_ip:    { limit: 5,  windowSeconds: 3600 },
  // Read only and harmless, but still a database round trip per request.
  start_dates_ip: { limit: 60, windowSeconds: 3600 },
  // The coach spends money on every question, so its allowance is a cost control
  // as much as a courtesy. The number comes from program_settings and is passed in;
  // this is the window and the fallback.
  coach_client:   { limit: 20, windowSeconds: 86400 },
};

export function callerIp(request) {
  // Cloudflare sets cf-connecting-ip and it cannot be spoofed by the client at
  // the edge. x-forwarded-for CAN be, so it is a fallback for local runs only and
  // its first element is taken rather than the whole chain.
  return request.headers.get('cf-connecting-ip')
      || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
      || 'unknown';
}

// SHA-256, so an address in the bucket is not readable by somebody browsing the
// table. Not a secret, just not plain text.
export async function hashed(value) {
  const bytes = new TextEncoder().encode(String(value || '').trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

/**
 * Count one request against a bucket.
 *
 * FAILS OPEN, ON PURPOSE, AND SAYS SO. If the limiter itself is unreachable, the
 * choice is between turning every public endpoint off and letting requests
 * through uncounted. A database blip must not take down the page somebody is
 * trying to pay on, so it allows and logs loudly. That is a deliberate trade and
 * the wrong one for anything that guards MONEY or ACCESS, which is why nothing
 * here is used for either: those are guarded by entitlements and by row level
 * security, neither of which fails open.
 */
export async function rateLimit(env, name, discriminator, override = null) {
  const rule = override ? { ...LIMITS[name], ...override } : LIMITS[name];
  if (!rule) throw new Error(`no rate limit named ${name}`);
  const bucket = `${name}:${discriminator}`;

  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/rate_limit_hit`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_bucket: bucket,
        p_limit: rule.limit,
        p_window: `${rule.windowSeconds} seconds`,
      }),
    });
    if (!res.ok) {
      console.error(`[ratelimit] ${name} unreachable: ${res.status} ${(await res.text()).slice(0, 160)}. Allowing this request UNCOUNTED.`);
      return { allowed: true, counted: false };
    }
    const out = await res.json();
    return { allowed: out.allowed !== false, counted: true,
             hits: out.hits, limit: out.limit,
             retryAfterSeconds: out.retry_after_seconds };
  } catch (e) {
    console.error(`[ratelimit] ${name} threw: ${(e && e.message) || e}. Allowing this request UNCOUNTED.`);
    return { allowed: true, counted: false };
  }
}

// The response a refused caller gets. No detail about anybody else, and no hint
// about whether the thing they were asking for exists.
export function tooMany(result, what = 'requests') {
  return new Response(JSON.stringify({
    error: `Too many ${what}. Please wait and try again.`,
    retry_after_seconds: result.retryAfterSeconds || null,
  }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      ...(result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : {}),
    },
  });
}
