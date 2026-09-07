# The client portal

Static HTML plus Supabase. No build step, no server, no framework. It deploys with the rest of the site.

## Why it works this way

The portal talks to Supabase directly from the browser using the **anon key**, which is designed to be public. Row-level security is what protects the data — those 56 policies mean the database itself rejects any request for someone else's rows, regardless of what the JavaScript asks for.

That is the whole reason the schema was built first. Access control lives underneath the application, so a bug in a page cannot leak someone's bloodwork.

**Never put the service_role key in these files.** It bypasses RLS entirely. It belongs only in the Cloudflare Functions, which run server-side.

---

## Files

```
portal/
  config.js       ← you fill this in
  app.js          shared runtime: auth, dates, reference data, autosave
  portal.css      all styling
  login.html      passwordless email link
  index.html      dashboard — program day, adherence, battery score
  log.html        the daily log
  labs.html       day 0 vs day 90, marker by marker
  account.html    profile, consent toggles, data export
```

---

## Setup

**1. Fill in `config.js`.** Supabase → Project Settings → API. Copy the Project URL and the `anon` `public` key.

**2. Turn on email sign-in.** Supabase → Authentication → Providers → Email. Enable it, and enable **Magic Link**. Turn off "Confirm email" if you want the first click to sign people straight in.

**3. Set the redirect URLs.** Supabase → Authentication → URL Configuration:

- Site URL: `https://thehumanbatteryproject.com`
- Redirect URLs: `https://thehumanbatteryproject.com/portal/**`

Without this the sign-in link will bounce.

**4. Deploy.** It is part of the same `public` folder. Push and Cloudflare serves it.

---

## Creating a client

There is no self-signup, by design — twenty-five to thirty seats is a reviewed list. To enroll someone:

1. Supabase → Authentication → Users → Invite user, with their email.
2. Insert their `profiles` row with the same `id` as the auth user.
3. Insert a `memberships` row linking them to the cohort, with `day_zero` set.

That third step is what makes the dashboard show a program day. Until `day_zero` exists, the portal shows "not started," which is correct.

An admin console to do this from a UI is the obvious next build.

---

## The daily log

This is the product. Everything else supports it.

**It autosaves.** There is no Save button, because a Save button is a thing people forget to press and a reason to lose a day of data. Every tap writes immediately; text fields debounce at 700ms.

**It is tap-based.** Foods, practices, movement and the five behavioural domains are all buttons. The only typing is an optional note. Target is under sixty seconds on a phone, and if it creeps past that, compliance drops and the dataset degrades.

**Backfill is limited to yesterday.** `canLogDate()` enforces it. A log written a week later is a reconstruction, and it corrupts every circadian timestamp — which is exactly the data that makes this program different.

**Off-protocol food is logged, not hidden.** Excluded items appear in the list in copper, and tapping one sets `off_protocol` on the entry. A program that shames people into silence produces a record of good days only, which is worthless for research and useless for coaching.

**Rest day is a first-class answer.** It sits alongside the movement options rather than being the absence of one.

**Adherence is a percentage, never a streak.** A broken streak makes people quit. A 78% makes them push for 85%. The dashboard shows a fourteen-day bar strip where a missed day is grey, not red.

---

## Still to build

- **Admin console** — enroll clients, enter lab results, review the roster by adherence, write coach notes.
- **Lab entry** — currently panels and results have to be inserted by hand in Supabase.
- **Content library** — the protocol, food list and cookbook as portal pages.
- **Reminders** — a daily nudge by email or SMS.
- **Onboarding flow** — consent capture and intake questionnaire on first login. Right now consents can be toggled in the account page, but the guided first-run does not exist.

The onboarding flow is the one to do next. Nobody should reach the log before their consents are recorded.
