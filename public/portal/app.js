// =====================================================================
// Portal runtime
//
// The anon key is safe in the browser. Row-level security is what
// enforces access — a client can only ever read their own rows, and the
// database rejects anything else regardless of what this file asks for.
// Never put the service key here.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
export async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.href = '/portal/login.html?next=' + encodeURIComponent(location.pathname);
    return null;
  }
  return session;
}

export async function currentProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  return data;
}

export async function signOut() {
  await sb.auth.signOut();
  location.href = '/portal/login.html';
}

// ---------------------------------------------------------------------
// Program dates
// ---------------------------------------------------------------------
export async function activeMembership() {
  const { data } = await sb
    .from('memberships')
    .select('id, day_zero, status, cohort_id, cohorts(code, name, starts_on, ends_on)')
    .in('status', ['active', 'enrolled'])
    .order('created_at', { ascending: false })
    .limit(1);
  return data && data.length ? data[0] : null;
}

// Program day N = day_zero + (N-1). Local date, not UTC — a log entry
// belongs to the day the person actually lived, not the UTC day.
export function programDay(dayZero, forDate = new Date()) {
  if (!dayZero) return null;
  const z = new Date(dayZero + 'T00:00:00');
  const d = new Date(forDate.getFullYear(), forDate.getMonth(), forDate.getDate());
  const days = Math.round((d - z) / 86400000) + 1;
  return days >= 1 && days <= 90 ? days : null;
}

export function localDateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

// ---------------------------------------------------------------------
// Daily log
//
// Backfill is limited to yesterday. Retroactive logging is fiction and
// it corrupts every circadian timestamp in the dataset.
// ---------------------------------------------------------------------
export function canLogDate(dateStr) {
  return dateStr === localDateStr() || dateStr === yesterdayStr();
}

export async function getOrCreateLog(membership, dateStr) {
  const { data: existing } = await sb
    .from('daily_logs').select('*').eq('log_date', dateStr).maybeSingle();
  if (existing) return existing;

  const { data: { user } } = await sb.auth.getUser();
  const row = {
    client_id: user.id,
    membership_id: membership ? membership.id : null,
    log_date: dateStr,
    program_day: membership ? programDay(membership.day_zero, new Date(dateStr + 'T12:00:00')) : null,
    is_backfilled: dateStr !== localDateStr(),
  };
  const { data, error } = await sb.from('daily_logs').insert(row).select().single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Adherence — a percentage, never a streak. A broken streak makes people
// quit. A 78% makes them push for 85%.
// ---------------------------------------------------------------------
export async function adherenceStats(membershipId) {
  const { data } = await sb
    .from('daily_logs')
    .select('log_date, program_day, daily_five_score, adherence_pct')
    .eq('membership_id', membershipId)
    .order('log_date', { ascending: false })
    .limit(90);
  if (!data || !data.length) return { logged: 0, elapsed: 0, pct: null, recent: [] };

  const logged = data.length;
  const maxDay = Math.max(...data.map((d) => d.program_day || 0));
  const scores = data.filter((d) => d.daily_five_score != null);
  const avgFive = scores.length
    ? scores.reduce((a, b) => a + b.daily_five_score, 0) / scores.length
    : null;
  return {
    logged,
    elapsed: maxDay,
    pct: maxDay ? Math.round((logged / maxDay) * 100) : null,
    avgFive,
    recent: data.slice(0, 14).reverse(),
  };
}

// ---------------------------------------------------------------------
// Reference data — cached in memory for the session
// ---------------------------------------------------------------------
const cache = {};

export async function foods() {
  if (cache.foods) return cache.foods;
  const { data } = await sb
    .from('foods')
    .select('id, slug, name, category, tier, default_unit, is_tryptophan_source')
    .is('retired_at', null)
    .order('tier').order('category').order('name');
  cache.foods = data || [];
  return cache.foods;
}

export async function practices() {
  if (cache.practices) return cache.practices;
  const { data } = await sb
    .from('circadian_practices')
    .select('id, slug, name, description, is_daily_five, sort_order, tier, rationale_established')
    .is('retired_at', null)
    .order('sort_order');
  cache.practices = data || [];
  return cache.practices;
}

export const BEHAVIOR_DOMAINS = [
  { key: 'connection',  label: 'Connection',  q: 'Real contact with someone who matters, and a sense of purpose today' },
  { key: 'cognitive',   label: 'Focus',       q: 'Did you learn or make something, versus only consuming' },
  { key: 'movement',    label: 'Movement',    q: 'How much you moved, beyond your training' },
  { key: 'light_sleep', label: 'Light',       q: 'Morning light, daylight, and screens at night' },
  { key: 'emotional',   label: 'Load',        q: 'How heavy the day felt' },
];

export const MODALITIES = [
  { key: 'resistance', label: 'Lifting' },
  { key: 'zone2',      label: 'Easy cardio' },
  { key: 'interval',   label: 'Intervals' },
  { key: 'walk',       label: 'Walking' },
  { key: 'mobility',   label: 'Mobility' },
  { key: 'sport',      label: 'Sport' },
];

// ---------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------
export function el(sel) { return document.querySelector(sel); }
export function els(sel) { return Array.from(document.querySelectorAll(sel)); }

export function toast(message, kind = 'ok') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = message;
  t.className = 'toast show ' + kind;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 2600);
}

export function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// Debounced autosave. The log must never have a Save button that people
// forget to press.
export function autosave(fn, ms = 700) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
