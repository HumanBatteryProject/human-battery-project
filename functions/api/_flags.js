// Feature flags, read from the database so a switch does not need a deploy.
//
// The one that matters is AI_GENERATION_ENABLED. Master prompt E4 requires the
// ability to pause every model call immediately, and D10 requires it to be
// reachable from the admin interface. Before this existed there was no way to
// stop the agents short of taking the site down.
//
// FAIL CLOSED, deliberately. If the flag cannot be read, AI generation is
// treated as DISABLED rather than enabled. The usual instinct is to keep working
// when a config read fails, and for a price that is right. For a kill switch it
// is exactly backwards: the situation where the flag is unreadable is a
// situation where something is already wrong, and continuing to send prompts is
// the behaviour the switch exists to prevent.

const CACHE_MS = 15_000;   // a kill switch must take effect in seconds, not minutes
let cache = { at: 0, map: null };

export const FLAGS = {
  AI_GENERATION_ENABLED: 'AI_GENERATION_ENABLED',
  BATTERY_SCORE_ENABLED: 'BATTERY_SCORE_ENABLED',
  WEARABLES_ENABLED: 'WEARABLES_ENABLED',
};

// Every flag's value when the table cannot be read. Each one is the safe
// direction: no model calls, no score shown, no device control.
const FAIL_CLOSED = {
  AI_GENERATION_ENABLED: false,
  BATTERY_SCORE_ENABLED: false,
  WEARABLES_ENABLED: false,
};

export async function flags(env, { fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && cache.map && now - cache.at < CACHE_MS) return cache.map;
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/feature_flags?select=key,enabled`,
      { headers: { apikey: env.SUPABASE_SERVICE_KEY,
                   Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
    if (!res.ok) throw new Error('feature_flags ' + res.status);
    const rows = await res.json();
    const map = { ...FAIL_CLOSED };
    for (const r of rows) map[r.key] = r.enabled === true;
    cache = { at: now, map };
    return map;
  } catch (e) {
    console.warn('[flags] unreadable, failing closed:', String(e).slice(0, 120));
    return { ...FAIL_CLOSED, __unreadable: true };
  }
}

export async function flagOn(env, key) {
  const f = await flags(env);
  return f[key] === true;
}

// Thrown by ask() when generation is paused. Callers catch this and fall back to
// their rule only output rather than returning an error to a member.
export class GenerationPaused extends Error {
  constructor() {
    super('AI generation is paused by AI_GENERATION_ENABLED');
    this.name = 'GenerationPaused';
    this.paused = true;
  }
}
