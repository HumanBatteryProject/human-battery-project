# Building this with Claude Code

Written for someone who directs the work rather than writes the code.

---

## Part 1: Set up your machine

### Install Claude Code

**Mac, Linux, or Windows with WSL**: open Terminal and run:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Close the terminal and open a new one so it picks up the change, then check it worked:

```bash
claude --version
```

**Prefer not to use a terminal at all?** There is a desktop app for macOS, Windows and Linux that runs Claude Code with a graphical interface. Get it from claude.com. Everything in this guide works the same way there.

**Note on accounts:** Claude Code needs a paid plan, Pro, Max, Team, Enterprise, or an Anthropic Console account with API credits. The free plan does not include it.

If anything goes wrong, run `claude doctor` and it will tell you what is missing.

### Install Git

Mac: it comes with Xcode command line tools. Run `git --version` and if it prompts you to install, say yes.
Windows: download Git for Windows from git-scm.com.

---

## Part 2: Get the code onto your machine

**First, put the repo on GitHub.** Follow `PUSH-TO-GITHUB.md` in this folder, create an empty private repo, add the remote, push.

**Then, on whatever machine you will work from:**

```bash
git clone git@github.com:YOURNAME/human-battery-project.git
cd human-battery-project
claude
```

That last command starts Claude Code inside the project. It reads `CLAUDE.md` automatically, so it already knows the stack, the rules, and what is left to build. You do not have to explain the project each time.

---

## Part 3: Accounts to create

Do these before you start building. Each takes a few minutes.

| Service | What it does | Notes |
|---|---|---|
| **GitHub** | Holds the code | Private repo |
| **Supabase** | The database and login system | Free tier is fine for cohort 01 |
| **Cloudflare** | Serves the website | Free tier is fine |
| **Resend** | Sends email | Free tier covers 3,000/month. You will need to verify your domain. |
| **Stripe** | Takes payments | Stay in test mode until you have run a full checkout |

You do not need a lab partner or a domain to start building. You do need them before cohort 01 opens.

---

## Part 4: Your first session

Start Claude Code in the project folder and paste this:

> Read CLAUDE.md and the README, then walk me through what is already built and what the next three things are. Do not change anything yet.

That gives you a shared starting point and confirms it can see everything.

---

## Part 5: The build order

Work through these one at a time. Each is a separate session, and you should confirm the previous one works before moving on.

### Step 1: Get the database running

> I need to set up the Supabase database. Walk me through creating the project, then tell me exactly which migration files to run and in what order. Do not run them yourself. I will paste them into the Supabase SQL editor. Tell me what to check after each one to know it worked.

### Step 2: Get the site deployed

> The site is ready to deploy to Cloudflare Pages. Walk me through connecting the repo, what settings to use, and which environment variables I need. Tell me where to find each value.

### Step 3: Make the application form work

> The application form on the marketing page posts to /api/waitlist. Help me test that it actually saves to Supabase and sends the confirmation email through Resend. If something fails, tell me what broke in plain language.

### Step 4: Turn on the portal

> Help me fill in public/portal/config.js and configure Supabase auth so the magic-link login works. Then walk me through creating one test client so I can log in and try the daily log myself.

### Step 5: Build the onboarding flow

This is the biggest missing piece.

> Build the onboarding flow for the portal. When someone logs in for the first time, they should be walked through consent capture, separate checkboxes for terms, health data, and research use, with research clearly optional, and then the intake questionnaire. Nobody should reach the daily log before their consents are recorded. Follow the existing portal patterns and the rules in CLAUDE.md.

### Step 6: Build the admin console

> Build an admin console at /portal/admin/. I need to enroll clients into a cohort, enter lab results for a panel, see the roster sorted by adherence, and write coach notes. It should only be reachable by someone whose profile role is admin. Follow the existing portal patterns.

### Step 7: Payments

> Help me set up Stripe in test mode, create the webhook endpoint, and run a full test checkout on the three-payment plan using a test clock so I can confirm it stops after the third installment.

---

## Part 6: How to work with it well

**Say what you want, not how to build it.** "Add a way for coaches to see who has not logged in three days" works better than trying to describe the code.

**One thing per session.** Long sessions drift. Finish a piece, confirm it works, start fresh.

**Make it show you before it changes things.** "Show me what you plan to change before you change it" is a reasonable instruction and worth using on anything touching the database or payments.

**Commit often.** After anything works, say:

> Commit this with a clear message and push it.

That way you can always go back. If something breaks badly:

> Undo the last commit, I want to go back to how it was.

**When something does not work, say what you see.** "The login page loads but clicking the button does nothing" is more useful than "it's broken."

**Push back when the answer sounds too confident.** Ask "did you actually run that, or does it just look right?" It should tell you honestly.

---

## Part 7: The things that will bite you

**Migrations run once.** Files 001-009 will error if you run them twice, because the tables already exist. That error is expected on a second run, not a sign something is wrong. Use a fresh Supabase project if you need to start over.

**Environment variables need a redeploy.** Adding a variable in Cloudflare does nothing until you redeploy. If a function suddenly cannot reach Supabase, this is usually why.

**The magic link needs the redirect URL set.** Supabase → Authentication → URL Configuration. Without `https://yourdomain.com/portal/**` in the redirect list, the sign-in email will bounce people to nowhere.

**Resend needs your domain verified** before it will send from your address. Until then it only sends to the address you signed up with.

**Empty query results are usually row-level security,** not a bug in the code. If the portal shows nothing where there should be data, check whether the logged-in user is allowed to see those rows before debugging the JavaScript.

---

## Part 8: Before cohort 01 opens

None of this is code, and all of it blocks launch:

- Attorney review of the four legal pages. They carry a visible draft banner, remove it only after review.
- Lab partner chosen, panel priced, and the abnormal-result referral protocol written down.
- The real out-of-pocket lab cost on the pricing section.
- A decision on whether payment-plan balances are enforced on withdrawal, and terms that say the true thing.
- Sign-off on the program-optimal bands in `010_seed.sql`. Those numbers define what "good" means for every client, and someone will eventually ask why 5.3 and not 5.4.
- Prospective registration if results will ever be published. Before data collection, not after.
- IRB review or a documented exemption.

---

## Reference

- Claude Code docs: https://code.claude.com/docs
- Supabase docs: https://supabase.com/docs
- Cloudflare Pages: https://developers.cloudflare.com/pages
- Resend: https://resend.com/docs
- Stripe: https://stripe.com/docs
