# How to Talk to Claude Code

A simple guide. No computer words.

---

## What Claude Code is

It is a helper that writes the code for you.

You type what you want. It builds it.

You do not need to know how to code. You need to know what you want.

Think of it like a very fast builder. You are the boss. It does the work.

---

## Part 1: Get it on your computer

### Step 1

Open the app called **Terminal**.

- On a Mac: press Command and the space bar. Type `Terminal`. Press Enter.
- On Windows: search for `Terminal` in the Start menu.

A black or white box opens. That is it. That is Terminal.

### Step 2

Copy this line. Paste it in the box. Press Enter.

```
curl -fsSL https://claude.ai/install.sh | bash
```

Wait. It will print a lot of stuff. That is fine.

### Step 3

Close Terminal. Open it again.

Now type this and press Enter:

```
claude --version
```

If you see a number, it worked.

If you do not, type `claude doctor` and press Enter. It will tell you what is wrong.

### Do not like the black box?

There is an app with buttons instead. Get it at **claude.com**. It does the same thing. Everything below still works.

---

## Part 2: Get your project

Type these lines one at a time. Press Enter after each one.

```
git clone git@github.com:YOURNAME/human-battery-project.git
```

```
cd human-battery-project
```

```
claude
```

That last one starts your helper.

It reads a file called CLAUDE.md all by itself. That file tells it everything about your project. So it already knows what you are building. You do not have to explain.

---

## Part 3: Your first time

Type this and press Enter:

> Read CLAUDE.md and the README. Then tell me what is built and what to do next. Do not change anything yet.

It will read everything and tell you where you are.

Now you are ready.

---

## Part 4: How to ask for things

### Ask for what you want. Not how to build it.

**Good:**
> I want coaches to see who has not logged in for three days.

**Not good:**
> Write a SQL query with a left join on daily_logs.

You do not have to know the second one. That is the whole point.

### Ask for one thing at a time.

**Good:**
> Build the sign-up screen.

**Not good:**
> Build the sign-up screen and the admin page and fix the emails and change the colors.

One thing. Then check it. Then the next thing.

### Make it show you first.

Before it changes anything important, say:

> Show me what you plan to change before you change it.

Use this every time it touches money or the database.

### Save your work.

When something works, say:

> Commit this and push it.

Now it is saved. You can always come back to this point.

### If it breaks something.

Say:

> Undo that. Go back to how it was before.

Nothing is ever really lost.

---

## Part 5: Words to copy

You can paste these in exactly.

**To start something:**
> Build the onboarding screen. When someone logs in the first time, they should agree to the consent forms first, then fill out the intake questions. They should not be able to reach the daily log until the consents are saved. Follow the rules in CLAUDE.md.

**When something is broken:**
> The login page loads but the button does nothing when I click it. Find out why and tell me in plain words.

**When you do not understand:**
> Explain that again like I have never seen code before.

**When it sounds too sure of itself:**
> Did you actually run that and check? Or does it just look right?

That last one is important. Ask it a lot.

**When you want to see the whole picture:**
> What is left to build? Put it in order of what matters most.

**When you are done for the day:**
> Commit everything and push it.

---

## Part 6: How to describe a problem

Say what you SEE. Not what you think is wrong.

**Good:**
> I click the blue button. Nothing happens. No error. Just nothing.

**Good:**
> The page is blank and white. It used to have text.

**Not good:**
> The database is broken.

You do not have to guess what is wrong. That is its job. Your job is to say what happened.

---

## Part 7: Things that will go wrong

These will happen. They are normal. Here is what they mean.

**"That file already exists."**
You ran something twice. That is fine. Skip it and keep going.

**The website does not change after you fix something.**
You have to push it first. Say: *Commit this and push it.* Then wait two minutes.

**The sign-in email never comes.**
Check your spam folder first. If it is not there, say: *The sign-in email is not arriving. Help me check the Supabase settings.*

**A page is empty when it should have stuff on it.**
This is almost always a permission rule, not broken code. Say: *This page is empty but it should show data. Check the row level security rules first.*

**You changed a setting and nothing happened.**
Some settings need the site to rebuild. Say: *I changed a setting in Cloudflare. Do I need to redeploy?*

---

## Part 8: The order to build things

Do these in order. Finish one. Make sure it works. Then start the next.

**1. Set up the database.**
> Walk me through setting up Supabase. Tell me which files to run and in what order. I will paste them in myself. Tell me how to know each one worked.

**2. Put the website online.**
> Walk me through putting this on Cloudflare Pages. Tell me every setting and where to find each value.

**3. Make the sign-up form work.**
> Test the form on the main page. Make sure it saves and sends the email. If it fails, tell me what broke in plain words.

**4. Turn on the portal.**
> Help me set up the portal login. Then make me one test person so I can sign in and try the daily log myself.

**5. Build the first-time screen.**
> Build the onboarding flow. Consents first, then the intake questions, before anyone can reach the daily log.

**6. Build the admin page.**
> Build an admin page where I can add people to a cohort, type in their lab results, see who is logging, and write notes. Only I should be able to see it.

**7. Turn on payments.**
> Help me set up Stripe in test mode and run a fake payment all the way through so I know it works.

---

## Part 9: Rules you should never break

Your helper knows these. But you should too.

**1.** Never put the "service key" in the public folder. That would let anyone see everyone's blood work.

**2.** Never change a database file you already ran. Make a new one instead.

**3.** Never change how the Battery Score is figured out in the middle of a group. It would ruin everyone's before-and-after.

**4.** The daily log must stay fast. Under one minute. If it gets slow, people stop doing it, and then you have no data at all.

**5.** Never let someone reach the daily log before they have signed the consent forms.

---

## Part 10: The one habit that matters most

**Save your work every time something works.**

> Commit this and push it.

Five words. It means you can always go back.

People lose work because they build for three hours and never save. Do not be that person.

---

## If you get stuck

Type this:

> I am stuck. Here is what I did, here is what I expected, and here is what happened instead.

Then say those three things.

That is the fastest way to get unstuck, every time.
