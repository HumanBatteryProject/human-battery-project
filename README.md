# The Human Battery Project

Marketing site, client portal, database, and brand assets. One repo, one deploy.

**New here?**
- [HOW-TO-USE-CLAUDE-CODE.md](HOW-TO-USE-CLAUDE-CODE.md) — plain-language guide. Start here.
- [GETTING-STARTED.md](GETTING-STARTED.md) — the same thing with more detail.

Static HTML and CSS with no build step. Cloudflare Pages serves it; Supabase holds the data; Cloudflare Functions handle the form and payments.

---

## Layout

```
public/                     everything served to the browser
  index.html                marketing page
  simple.html               plain-language version (grade ~3 reading level)
  privacy.html · consumer-health-data.html · terms.html · disclaimer.html
  styles.css                marketing styles
  assets/                   logo files used by the site
  fonts/                    Michroma + Newsreader, self-hosted
  portal/                   the client portal — see portal/README.md
    config.js               ← YOU FILL THIS IN
    app.js · portal.css
    login.html · index.html · log.html · labs.html · account.html
  _headers                  security + caching headers

functions/api/              Cloudflare Pages Functions (server-side)
  waitlist.js               POST /api/waitlist
  checkout.js               POST /api/checkout
  stripe-webhook.js         POST /api/stripe-webhook
  _payments.js              pricing + plan config

database/
  migrations/001–015.sql    run in order, once, on a clean Supabase project
  README.md                 schema documentation

brand/
  svg/ png/ fonts/          the v4 logo system
  HBP-Brand-Guide.pdf

docs/                       model, panel spec, evidence tiers, build list

CLAUDE.md                   project context — Claude Code reads this automatically
HOW-TO-USE-CLAUDE-CODE.md   plain-language guide to prompting
GETTING-STARTED.md          setup and build order
PUSH-TO-GITHUB.md           first push
CONTRIBUTING.md             rules that are expensive to break
```

---

## Deploy

**1. Push to GitHub**

```bash
git remote add origin git@github.com:YOURNAME/human-battery-project.git
git branch -M main
git push -u origin main
```

**2. Create the database**

Supabase → SQL Editor. Run `database/migrations/*.sql` **in numerical order**, one at a time. Files 001–009 are not safe to run twice; 010 and later are.

**3. Connect Cloudflare Pages**

Workers & Pages → Create → Pages → Connect to Git.

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | *(empty)* |
| Build output directory | `public` |

**4. Environment variables** (Pages → Settings → Environment variables)

| Name | Where it comes from |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | same page, `service_role` key — **server-side only** |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks, after creating the endpoint |
| `FROM_EMAIL` | e.g. `hello@thehumanbatteryproject.com`, verified in Resend |
| `NOTIFY_EMAIL` | where new applications get emailed to you |
| `RESEND_API_KEY` | resend.com → API keys |

Redeploy after adding them.

**5. Fill in `public/portal/config.js`**

The project URL and the **anon** key. The anon key is meant to be public — row-level security is what protects the data. The service key never goes in this file.

**6. Supabase auth settings**

Authentication → Providers → Email → enable Magic Link.
Authentication → URL Configuration → Site URL `https://yourdomain.com`, Redirect URL `https://yourdomain.com/portal/**`.

---

## Local development

```bash
npm install
npx wrangler pages dev public --compatibility-flag=nodejs_compat
```

Put secrets in `.dev.vars` at the repo root (gitignored).

---

## Before this goes live

- [ ] Attorney review of all four legal pages. They carry a visible draft banner — remove it only after review.
- [ ] Lab partner selected, panel priced, and the abnormal-result referral protocol written down.
- [ ] Confirm the expected out-of-pocket lab cost and put the real number on the pricing section.
- [ ] Decide whether payment-plan balances are actually enforced on withdrawal, and make the terms say the true thing.
- [ ] Sign off on the program-optimal bands in `010_seed.sql` — they define what "good" means for every client.
- [ ] Prospective registration (OSF or ClinicalTrials.gov) if results will ever be published. It has to happen before data collection, not after.
- [ ] IRB review or a documented exemption.

---

## The two rules this repo is built around

**Structured logging, not free text.** Every food and exercise entry points at a reference row by ID. This is the difference between a dataset you can query in 2031 and a pile of sentences, and it cannot be retrofitted.

**Access enforced at the database.** 56 row-level security policies mean a missed `WHERE` clause produces a rejected query rather than a data leak. That is why the portal can be static HTML talking directly to Supabase.
