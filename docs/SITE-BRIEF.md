# Site brief: The Human Battery Project

**Claude Code: read the Overrides section first. Where the brief below and an override disagree, the override wins. Where the brief and CLAUDE.md disagree, CLAUDE.md wins.**

---

## Overrides

These correct the brief to match decisions already made and the platform as built.

**O1. The bare hero stays.** The hero is the project name and the animated logo, and nothing else. The earlier version of this override was written against the older hero and was wrong; it listed a video slot, a headline, a symptom paragraph, two tabs and an Apply button that had already been removed.

Nothing returns to the hero except the video slot, and only when there is a video.

Everything the earlier O1 asked for goes in the first section below the hero instead, in this order:
- A three-step strip: MEASURE → CHANGE THE INPUTS → MEASURE AGAIN, each step with a short one-line caption (Day 0 testing / 90 days of inputs / Day 90 testing).
- The line: "Open enrollment. New starts on the 1st and 15th of every month."
- Microcopy: "Apply anytime. Applying does not charge you."

Do not use "You've tried everything. So why don't you feel better?" anywhere.

**O2. Do not name a first start date anywhere on the site.** The first wave date is still being decided and is not to be written into any page, any copy, any example or any placeholder. The site says only: "Open enrollment. New starts on the 1st and 15th of every month."

Do not build a computed next-start display at all. Not behind a flag, not hidden, not wired up and switched off. There is no date to show, so there is nothing to compute.

Specifically, do not add to any page under `public/` outside `public/portal/`: the `supabase-js` library, a Supabase client, a `SUPABASE_URL`, a publishable key, a secret key, a `fetch` to `/rest/v1/`, or a Pages Function that exists to feed a date to the marketing site. The marketing pages have no database access today and are not getting any.

The site says the open-enrollment line and nothing more. Never hardcode a date.

**O3. Evidence tiers are `established`, `contested`, `working model`.** Not "emerging". These names are in the database enum, the PDFs and CLAUDE.md. Use them exactly.

**O4. Subsystem definitions come from the site, not the brief.**
- CHARGE: fuel delivery and oxidative throughput. VO₂max, RER, lactate, and the blood markers that show whether fuel reaches the machinery.
- DRAIN: inflammatory load. What is consuming capacity in the background.
- OUTPUT: the hormonal panel. What the system can spend.
- RESERVE: what it is built from. Substrate, membrane composition, minerals, including the Omega-3 Index.
Subsystem colors, everywhere: Charge BLUE, Drain COPPER, Output TEAL, Reserve GREEN.

**O5. No invented before-and-after numbers.** The Battery Score dashboard shows a full illustrative Day 0 (composite plus four subsystems) labeled "Illustrative example, not a participant result." The Day 90 column shows the four subsystem names with "measured at day 90" in place of numbers. No 54% → 73%. No animated climb from a Day 0 number to a Day 90 number. When real participant #1 results exist, they replace the illustration, with consent language.

**O6. This is a static site.** No framework, no build step, no bundler, no TypeScript, no test runner, no linter to add. Where the brief says run the build, type check, lint or tests, the equivalent here is: HTML parses, `node --check` on every inline script, no console errors, textstat on the front door, the sentence-level foundational model audit, and screenshots at 1440 and 390. Do not add tooling to satisfy the brief.

**O7. The founder rule applies to the site only.** The coach still escalates to Dr. Pittman by name and the patient email still leads with participant #1. Do not touch those.

**O8. Model rules still apply to every new sentence.** Light is timing information, never charging. Trillions of batteries, never one. "Recharge" as a phase name refers to cells rebuilding their own charge and is allowed; "light recharges you" is not. No em dashes. No outcome promises. Run the audit on every section before its checkpoint.

**O9. Build in six checkpoints, below. Stop at each and wait.**

**O10. Reading level is split by door.** The front door, `/`, stays at grade 3 to 4 in plain words. The brief's technical vocabulary belongs on `/science`: biomarkers, capacity, progression, electrochemical, and their like. On `/` say the same thing plainly. `33 things in your blood`, not `33 biomarkers`. `Fitness tests`, not `physical capacity testing`. `It gets harder as you go`, not `structured progression`.

Where the brief specifies exact copy that is above grade 4, use it verbatim on `/science` and say it plainly on `/`. The two pages carry different markup for the same section, and that is intended, not drift.

Measure prose only. Flesch-Kincaid over a list of two-word labels is meaningless: it scored a section grade 11.9 whose four sentences average 3.5. Split the block elements into ones containing a sentence and ones that are bare labels, and grade only the first.

---

## Checkpoints

**Checkpoint A.** Hero additions (O1), the Experiment section (brief §2), and the Open Enrollment section (brief §11) with no start date shown, per O2. Show screenshots.

**Checkpoint B.** Battery Score dashboard (brief §3, O5) and the 33 biomarkers explorer organized by subsystem (brief §6). Show screenshots and confirm every marker is placed under the subsystem it belongs to in `lab_markers`.

**Checkpoint C.** Low Battery section with expand (brief §4), Daily Inputs section (brief §8), the 90-day protocol timeline (brief §7). Show screenshots.

**Checkpoint D.** The Science section with the citation drawer (brief §5). Build the citation data as a JSON file the corpus loader can also read later, one entry per source with title, authors, journal, year, DOI, evidence tier and a one-line relevance note. Pull sources from `docs/HBP-Integration-Architecture.md` and the evidence map. Show the drawer working and list every citation.

**Checkpoint E.** What You Get cards, Pricing (brief §9, §10), Application flow improvements (brief §12), FAQ (brief §13), Boundaries (brief §14). Lab costs come from `program-docs/tests_doc.py` where they exist; invent nothing. Show screenshots.

**Checkpoint F.** Mobile sticky CTA, motion pass, performance and accessibility audit, SEO metadata, analytics report (brief §15 to §19). Report what analytics exist before adding any. Final report per the brief's list.

Commit at each checkpoint with a message naming it. Push only when told.

---

## For the next counsel review

Counsel-approved text is not edited by this work. These are the conflicts between that text and the site as it now stands, to be raised at the next review rather than fixed here.

**L1. `terms.html` still says "seat".** "the cohort seat, the panel, and the coaching schedule are committed", in the refund clause. The site no longer uses seat language anywhere and the brief forbids it: enrollment is open, there is no cap and there are no limited places. The refund term turns on a seat that does not exist.

**L2. `terms.html` describes the cohort model.** "Cohorts run for ninety days with thirty participants, all starting on the same date." Open enrollment replaced that. Also "cohort" in Your responsibilities and in Changes.

**L3. `terms.html` promises one-to-one coaching.** "the group and one-to-one coaching sessions". The program now has one weekly group call and no individual coaching.

**L4. `consumer-health-data.html` describes a consent flow that is not built.** "At enrollment we ask, in a separate checkbox, whether you consent to your de-identified data being used in longevity research." That checkbox does not exist and `client_consents` is empty.

**L6. The privacy policy needs a line about analytics.** Under "What we collect" it says automatic collection is "standard server logs. We do not run advertising trackers." Cloudflare Web Analytics is being enabled on the Pages project, which injects the beacon itself; there is no snippet in this repository. It sets no cookies, does not fingerprint and is not an advertising tracker, so the second sentence stays true, but "standard server logs" no longer describes everything collected automatically. The policy should name it. Counsel-approved text is not edited here, so this is for the review. It applies to the whole zone including the portal, which a hand-placed tag would have let us exclude.

**L5. British spellings in US-governed documents.** "instalments" in `terms.html`, "authorise" in `consumer-health-data.html`.

**L8. The Human Battery Project is being incorporated as its own entity.** Terms, the privacy policy, the medical disclaimer and the consumer health data notice were all approved naming whatever party they currently name. All four need review for the correct contracting entity once the EIN exists. The Stripe account, the bank account and the Resend account should all sit under the new entity rather than under a personal name or a prior one.

This is also why payments are parked: Stripe will be set up under the new entity after incorporation, so `checkout.js`, `stripe-webhook.js`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are not to be touched until that is done. Both Stripe variables are still the literal placeholders `sk_test_` and `whsec_`.

---

## Deferred, after Checkpoint F

**D1. Front door reading level.** `/` measures grade 4.9 across 109 sentences of prose, against the grade 3 to 4 target in O10 and CLAUDE.md. The copy added during these checkpoints is inside the target; the gap is inherited copy written before the target existed. Fix it as its own piece of work once F is done, not inside a checkpoint, so the change is reviewable on its own and no section gets quietly rewritten while something else is being built.

Known offenders found so far, all on `/`, all inherited from the routing swap in `f4426a3` rather than written for the front door:
- `#tired`: "Afternoon fatigue, central adiposity and reactive hunger cluster around glucose..." (grade 16.8)
- `#how`: "Adherence is tracked as a percentage rather than a streak..." (grade 14.9)
- `#how`: "Draw conditions are standardised at both timepoints: twelve-hour fast, no alcohol..." (grade 13.7)

These read as `/science` copy sitting on the plain page. Start there.

---

## The brief

[The full brief follows, unchanged.]

You are improving the existing production website for:

THE HUMAN BATTERY PROJECT
thehumanbatteryproject.com

This is an existing brand and website. Do NOT rebuild it blindly from scratch.

First inspect the entire existing codebase, understand the framework, component structure, styling system, forms, analytics, backend integrations, deployment configuration, and existing functionality.

Then improve the site while preserving anything that is already working correctly.

PRIMARY OBJECTIVE

Transform the Human Battery Project website into a premium, scientifically grounded, high-conversion website for a 90-day measured health and human-performance program.

The central idea is:

MEASURE → CHANGE THE INPUTS → MEASURE AGAIN

The visitor should understand within approximately 5 seconds:

1. This is a 90-day program.
2. We establish a Day 0 baseline.
3. Participants follow a structured protocol.
4. We measure again at Day 90.
5. The purpose is to objectively determine what changed.
6. Enrollment is open year-round.
7. New participants start on either the 1st or 15th of every month.

IMPORTANT BUSINESS MODEL:

There is NO fixed cohort size.

There is NO 25-person or 30-person limit.

There are NO limited "seats."

Do NOT create artificial scarcity.

Enrollment is OPEN and ongoing.

Participants can apply at any time and begin on the next appropriate start date:

THE 1ST OR 15TH OF EVERY MONTH.

BRAND POSITIONING

The Human Battery Project should stand on its own as the brand.

Do NOT make the website about the founder.

Do NOT add a founder biography.

Do NOT add a "Why Micah?" section.

Do NOT use personal-founder storytelling as a conversion device.

Do NOT make Dr. Micah Pittman the visual center of the site.

The authority should come from:

measurement
data
scientific references
the protocol
the testing methodology
the Battery Score
the participant experience
before-and-after measurement

The website should feel like:

HUMAN PERFORMANCE RESEARCH
+
PREMIUM TECHNOLOGY
+
MEASUREMENT PLATFORM

It should NOT feel like:

a chiropractic website
a doctor's personal website
a supplement company
a generic wellness coach
a biohacking influencer website
a weight-loss program
a medical clinic

The emotional reaction we want is:

"Finally, someone is going to measure whether this actually works."

⸻

1. HERO

See Override O1. The hero shipped today stays. Add the measurement strip, the open-enrollment line and the microcopy beneath the Apply button.

Do NOT mention limited availability or participant caps.

⸻

2. THE EXPERIMENT

Immediately explain how the program works.

Create a highly visual:

DAY 0 → 90 DAYS → DAY 90

flow.

DAY 0

33 biomarkers
physical capacity testing
baseline measurements
Battery Score
personal starting point

↓

90 DAYS

Morning light
sleep
darkness at night
mineral/hydration strategy
food timing
nutrition
movement
training
recovery
daily tracking
structured progression

↓

DAY 90

Repeat testing
repeat biomarkers
repeat physical measurements
new Battery Score
compare Day 0 vs Day 90
maintenance strategy

Finish this section with a strong statement:

"DON'T GUESS WHETHER IT WORKED. MEASURE IT."

This should become one of the primary brand statements.

⸻

3. BATTERY SCORE

Make the Battery Score one of the visual centerpieces of the entire website.

Create a premium technology-style dashboard visualization.

Example:

YOUR BATTERY

54%

CHARGE: 47
DRAIN: 61
OUTPUT: 52
RESERVE: 58

Include a Day 0 / Day 90 comparison interface, per Override O5: Day 0 illustrated, Day 90 shown as "measured at day 90" with no numbers.

Any sample values MUST clearly state:

"Illustrative example, not actual participant results."

Explain the four systems simply, using the definitions in Override O4.

Do NOT represent the Battery Score as a validated diagnostic instrument.

Clearly explain that it is the Human Battery Project's measurement framework.

⸻

4. "LOW BATTERY" EXPERIENCE

Retain the powerful battery analogy.

Use common experiences people recognize:

Afternoon crash
Brain fog
Poor sleep
Poor recovery
Stubborn weight changes
Reduced drive
Cold hands or feet
Dependence on caffeine

Do NOT imply that these symptoms prove a particular biological dysfunction.

Use language such as:

"These experiences can have many causes. The Human Battery framework looks at patterns across multiple measurements rather than diagnosing symptoms individually."

Allow the visitor to expand the section to see additional examples.

Do not overwhelm mobile users with a huge symptom list.

⸻

5. THE SCIENCE

Keep the science.

Do NOT remove the scientific depth that differentiates the Human Battery Project.

Instead, LAYER IT.

The top of the website sells the experiment.

The middle explains the measurement.

The deeper sections explain the science.

Start this section with:

"YOUR BODY RUNS ON ELECTROCHEMICAL GRADIENTS."

Explain mitochondrial membrane potential, proton gradients and ATP production in accessible language.

The phone battery is an analogy.

Make the distinction between analogy and literal physiology clear.

Preserve the site's existing evidence hierarchy, per Override O3:

ESTABLISHED

CONTESTED

WORKING MODEL

Use these labels consistently throughout the website.

Build a citation system.

Scientific statements that require evidence should have small numbered citations.

Clicking/tapping the citation should open a clean source drawer or modal containing:

Paper title
Authors
Journal
Year
Short explanation of relevance
DOI or PubMed link when available

Prefer primary literature and high-quality reviews.

Avoid unsupported superlatives.

Do not present hypotheses as established facts.

⸻

6. 33 BIOMARKERS

Make the biomarker section significantly more visual.

Organize measurements around the four Human Battery systems:

CHARGE
DRAIN
OUTPUT
RESERVE

Create an interactive four-quadrant or dashboard visualization.

On desktop:

Allow hover/click to explore.

On mobile:

Allow tap/expand.

Do NOT dump all 33 biomarkers into one giant wall of text.

Let visitors explore them progressively.

Include the measurement principle:

"SAME BODY. SAME CONDITIONS. TWO TIME POINTS."

Explain the importance of consistency:

same laboratory whenever possible
same fasting state
same morning timing
similar pre-test conditions

Emphasize that reducing measurement variability makes the Day 0 vs Day 90 comparison more useful.

⸻

7. THE 90-DAY PROTOCOL

Retain the three-phase model.

DAYS 1–30

STOP THE DRAIN

Focus on reducing unnecessary physiological stressors and establishing foundational behaviors.

DAYS 31–60

RECHARGE

Build stronger circadian, nutritional, movement and recovery inputs.

DAYS 61–90

BUILD CAPACITY

Progressively challenge the system and improve resilience and physical capacity.

Desktop:

Use an elegant horizontal timeline.

Mobile:

Use a vertical progression.

Show only the most important information initially.

Allow users to expand each phase.

Avoid overwhelming people with every protocol detail before they apply.

⸻

8. DAILY INPUTS

Create a clean visual section explaining the major controllable inputs.

Morning sunlight
Darkness at night
Sleep
Mineral water / hydration
Food quality
Food timing
Movement
Training
Recovery

These should feel like interconnected inputs into one biological system rather than unrelated wellness tips.

Visually connect them to:

CHARGE
DRAIN
OUTPUT
RESERVE

⸻

9. WHAT YOU GET

Turn the current deliverables into premium visual cards.

Potential cards:

DAY 0 TESTING

33 biomarkers plus baseline measurements.

BATTERY SCORE

Your starting Human Battery profile.

90-DAY PROTOCOL

Structured progression through the program.

PERSONAL PORTAL

Track your program and measurements.

DAILY TRACKING

Record the behaviors and inputs that matter.

WEEKLY SUPPORT

One weekly one-hour group call, open to everyone in the program.

DAY 90 TESTING

Repeat the same measurements.

YOUR COMPARISON

See what changed.

MAINTENANCE PLAN

Use the results to determine what you continue after Day 90.

The goal is to make the $1,000 program feel tangible before displaying the price.

⸻

10. PRICING

Create a premium, extremely transparent pricing section.

Main card:

THE HUMAN BATTERY PROJECT

90 DAYS

$1,000

Clearly separate:

PROGRAM COST

LAB TESTING COST

OPTIONAL PRODUCTS OR SUPPLEMENTS

Never hide additional expenses.

If an exact laboratory cost is available in the existing code/content, display it accurately.

If not, do NOT invent one.

Explain clearly what the $1,000 includes.

Include payment options if they already exist.

Primary CTA:

APPLY TO START

⸻

11. OPEN ENROLLMENT

This section is extremely important.

Heading:

START WHEN YOU'RE READY.

Copy:

"The Human Battery Project operates on open enrollment. New participants begin on the 1st and 15th of every month."

Create a simple timeline:

APPLY

↓

COMPLETE ONBOARDING

↓

DAY 0 TESTING

↓

START ON THE 1ST OR 15TH

↓

90-DAY PROGRAM

↓

DAY 90 TESTING

↓

COMPARE YOUR RESULTS

Make it obvious that enrollment is open and starts happen twice a month.

Do not show or promise any specific start date, per Override O2.

⸻

12. APPLICATION

Improve the application experience.

The CTA throughout the website should consistently use language such as:

APPLY TO START

or

START YOUR APPLICATION

Do not use:

CLAIM YOUR SEAT
ONLY X SPOTS LEFT
JOIN THE NEXT LIMITED COHORT

Add reassurance near the form:

"Applying does not charge you."

Explain what happens after submission.

For example:

1. Submit your application.
2. Receive onboarding information.
3. Complete required Day 0 testing.
4. Confirm your start date.
5. Begin on the 1st or 15th.

Preserve all existing working form/backend functionality.

Do not break analytics, submissions or integrations.

⸻

13. FAQ

Create or improve the FAQ around the questions most likely to stop someone from applying.

Include:

What exactly is the Human Battery Project?

Is this medical treatment?

What gets measured?

Why 90 days?

What is the Battery Score?

What happens on Day 0?

What happens on Day 90?

When can I start?

Is enrollment always open?

What does the $1,000 include?

Are laboratory costs included?

Do I need supplements?

What if I already exercise and eat well?

What happens if my laboratory testing shows something abnormal?

What happens to my data?

Can I delete my data?

⸻

14. MEDICAL / SCIENTIFIC BOUNDARIES

Retain and improve the existing disclosures.

Clearly communicate that:

The Human Battery Project is not a substitute for medical care.

The Battery Score is not a medical diagnosis.

The program does not diagnose or treat disease.

Abnormal findings may require evaluation by an appropriate licensed healthcare professional.

Scientific hypotheses should be identified as hypotheses.

Participant data should be handled according to the site's existing privacy and consent policies.

Do not bury these statements in microscopic legal text.

Good scientific boundaries increase credibility.

⸻

15. VISUAL DESIGN

Preserve the strongest parts of the existing Human Battery visual identity.

The site should feel:

premium
scientific
minimal
modern
data-driven
slightly futuristic
human rather than sterile

Use visual inspiration from:

biophysics
electrical potential
mitochondria
energy gradients
measurement dashboards
scientific instrumentation

Avoid:

generic stock wellness photography
yoga imagery
supplement bottles
doctors in white coats
generic DNA graphics
overused heartbeat graphics
biohacker clichés
neon sci-fi overload

Use whitespace aggressively.

Use large typography.

Reduce long walls of text.

Turn concepts into visual systems wherever possible.

⸻

16. MOTION

Use subtle animation only when it improves understanding.

Potential examples:

Subtle electrical gradient movement

Four subsystem indicators responding to scroll

Measurement timeline progression

Do NOT animate a Day 0 number climbing to a Day 90 number (Override O5).

Do NOT add animation simply because it looks impressive.

Avoid heavy animation libraries unless already present.

Respect prefers-reduced-motion.

Maintain excellent mobile performance.

⸻

17. MOBILE EXPERIENCE

Treat mobile as a primary experience, not a desktop adaptation.

The first mobile screen is the project name and the logo, per O1. Everything below
communicates, in the first section:

90 DAYS

MEASURE → CHANGE → MEASURE AGAIN

OPEN ENROLLMENT

STARTS 1ST & 15TH

APPLY TO START

After the visitor passes the hero, use a tasteful sticky bottom CTA:

APPLY TO START

Do not let the sticky CTA obstruct content or accessibility controls.

Ensure tap targets are large enough.

Avoid oversized text blocks.

Use progressive disclosure for detailed science.

⸻

18. PERFORMANCE / TECHNICAL AUDIT

Audit and improve, within the constraints of Override O6:

Core Web Vitals
LCP
CLS
INP
image optimization
responsive image delivery
lazy loading
font loading
unused JavaScript
accessibility
semantic HTML
keyboard navigation
contrast
form labels
error states
SEO metadata
OpenGraph metadata
Twitter/X cards
structured data
canonical URLs
sitemap
robots configuration
404 behavior

Do not sacrifice performance for visual effects.

⸻

19. ANALYTICS

Preserve existing analytics.

If analytics infrastructure exists, make sure we can measure the conversion funnel:

Homepage visit

↓

Application CTA click

↓

Application started

↓

Application submitted

Do not introduce duplicate tracking.

Do not change production analytics IDs.

Document any recommended additional events before adding them if they could affect existing reporting.

If no analytics exist, say so and recommend one privacy-respecting option. Do not install it without approval.

⸻

20. CONVERSION PHILOSOPHY

Do NOT use artificial urgency.

Do NOT use fake scarcity.

Do NOT use fake testimonials.

Do NOT invent participant outcomes.

Do NOT invent scientific validation.

Do NOT invent statistics.

Conversion should come from:

clarity
measurement
transparency
scientific credibility
beautiful visualization
low-friction enrollment
clear expectations

The central conversion message is:

"YOU DON'T HAVE TO GUESS WHETHER IT WORKED."

Because:

WE MEASURE BEFORE.

WE CHANGE THE INPUTS.

WE MEASURE AGAIN.

⸻

IMPLEMENTATION PROCESS

Before changing production code:

1. Inspect the entire repository.
2. Confirm the stack: static HTML and CSS, Cloudflare Pages, Pages Functions, Supabase. No framework.
3. Identify the design system in styles.css and the palette variables.
4. Identify reusable patterns.
5. Identify application/form functionality and the Supabase writes behind it.
6. Identify backend/API dependencies.
7. Identify analytics, if any.
8. Identify existing SEO implementation.
9. Identify anything that could break during the redesign.
10. Create an implementation plan mapped to Checkpoints A through F and show it before starting.

Then implement checkpoint by checkpoint.

Do not unnecessarily rewrite working infrastructure.

Preserve working functionality.

After each checkpoint, per Override O6: HTML parses, inline scripts pass node --check, no console errors, textstat on the front door, foundational model audit, screenshots at 1440 and 390, forms still submit, links resolve.

Then provide a final report containing:

WHAT CHANGED

WHY IT CHANGED

FILES MODIFIED

FUNCTIONALITY PRESERVED

SEO IMPROVEMENTS

ACCESSIBILITY IMPROVEMENTS

PERFORMANCE IMPROVEMENTS

ANY REMAINING RISKS

ANY ITEMS REQUIRING HUMAN REVIEW

Do not deploy blindly if a change could break application submissions, analytics, payment functionality or participant onboarding.

The finished website should make a new visitor understand one idea above everything else:

THE HUMAN BATTERY PROJECT IS A 90-DAY EXPERIMENT ON YOU.

MEASURE YOUR BASELINE.

CHANGE THE INPUTS.

MEASURE AGAIN.

SEE WHAT ACTUALLY CHANGED.
