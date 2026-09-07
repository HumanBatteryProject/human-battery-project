# The Human Battery Project: Build List

Platform + business. Phase tags: **[C1]** = required before Cohort 01 opens · **[C2]** = required by Cohort 02 · **[L]** = later, but design for it now.

---

## PART ONE: THE PLATFORM

### 1. Public marketing site

| # | Item | Phase |
|---|---|---|
| 1.1 | Landing page, thesis, program structure, what's measured, price | C1 |
| 1.2 | Program detail page, the 90 days, three phases, Daily Five | C1 |
| 1.3 | About / who runs it, credentials framed as coach + researcher | C1 |
| 1.4 | Pricing page with the three payment shapes | C1 |
| 1.5 | Application / waitlist form → admin queue | C1 |
| 1.6 | FAQ, including an explicit "this is not medical care" section | C1 |
| 1.7 | Legal footer set, Terms, Privacy Policy, **Consumer Health Data Privacy Policy as its own top-level link**, Medical Disclaimer | C1 |
| 1.8 | Cookie/tracking consent banner (needed the moment you run ads) | C1 |
| 1.9 | Logo reductions, flat single-color atom for favicon, embroidery, print | C1 |
| 1.10 | OG images, meta, sitemap, analytics | C1 |
| 1.11 | Results / outcomes page, cohort-level aggregate data | C2 |
| 1.12 | Blog or research notes section | L |

### 2. Client portal

| # | Item | Phase |
|---|---|---|
| 2.1 | Auth, email/password + magic link, password reset, session management | C1 |
| 2.2 | Onboarding wizard, account → consents → demographics → questionnaire | C1 |
| 2.3 | **Consent capture flow**, separate versioned checkboxes for Terms, health-data collection, research use, sharing. Store text version, timestamp, IP | C1 |
| 2.4 | Demographic form, age, sex, state of residence (drives which privacy regime applies), height, weight, occupation, sleep schedule | C1 |
| 2.5 | Intake questionnaire, symptoms, energy scoring, medications/supplements, history, goals | C1 |
| 2.6 | Daily diary, structured entry, not free text (see §4.1) | C1 |
| 2.7 | Diary streak / adherence view, current Daily Five score, week at a glance | C1 |
| 2.8 | Lab results view, Day 0 vs Day 90 side by side, per marker, with direction of change | C1 |
| 2.9 | Battery Score display, composite index only, never per-marker interpretation | C1 |
| 2.10 | Program content library, foods, exercises, circadian practices (static content is fine at launch) | C1 |
| 2.11 | Document vault: client can view their own uploaded lab PDFs | C1 |
| 2.12 | Account settings, password, email, **data export**, **account deletion** (legally required) | C1 |
| 2.13 | Notifications, daily log reminder by email or SMS | C2 |
| 2.14 | Weekly check-in form | C2 |
| 2.15 | Progress photos / measurements module | C2 |
| 2.16 | Client-side upload of their own lab PDFs | C2 |
| 2.17 | Wearable integrations, Oura, Whoop, Apple Health | L |
| 2.18 | Cohort community feed or messaging | L |
| 2.19 | Mobile app or PWA wrapper | L |

### 3. Admin / coach console

| # | Item | Phase |
|---|---|---|
| 3.1 | Role-based access, admin, coach, client | C1 |
| 3.2 | Cohort management, create cohort, set dates, assign seats | C1 |
| 3.3 | Client roster with adherence at a glance, who logged, who didn't | C1 |
| 3.4 | Individual client detail, intake, diary history, labs, notes | C1 |
| 3.5 | **Lab upload + parse**, upload PDF, enter/extract marker values into structured rows | C1 |
| 3.6 | Battery Score calculation engine, configurable weights per subsystem | C1 |
| 3.7 | Application review queue, approve, waitlist, reject | C1 |
| 3.8 | Coach notes per client, timestamped | C2 |
| 3.9 | Bulk messaging to a cohort | C2 |
| 3.10 | Content CMS, edit food/exercise/circadian library without a deploy | C2 |
| 3.11 | Cohort-level dashboard, mean deltas, adherence vs outcome | C2 |
| 3.12 | Coach pod assignment (needed at 30 seats) | L |

### 4. Data & research layer

| # | Item | Phase |
|---|---|---|
| 4.1 | **Structured diary schema**, food against a controlled list with IDs; exercise taxonomy (modality, duration, intensity, time of day); circadian items as booleans + timestamps; sleep window; free text only as an optional note field | C1 |
| 4.2 | Food reference table, seed list, IDs, categories, tags | C1 |
| 4.3 | Exercise reference table, same | C1 |
| 4.4 | Lab marker table, marker, value, unit, reference range, draw date, LOINC code | C1 |
| 4.5 | Consents table, versioned, per client, per consent type | C1 |
| 4.6 | Row-level security policies, clients see only their own rows, enforced at the database | C1 |
| 4.7 | Audit log, who viewed or changed what, when | C1 |
| 4.8 | Encryption at rest + in transit; PDFs in private object storage with signed URLs only | C1 |
| 4.9 | Automated backups + a tested restore | C1 |
| 4.10 | De-identification pipeline, research view with direct identifiers stripped, stable pseudonymous IDs | C2 |
| 4.11 | Data dictionary / codebook, every field defined, versioned | C2 |
| 4.12 | Research export, CSV/Parquet of the de-identified set | C2 |
| 4.13 | Cross-cohort analysis tooling, adherence vs marker delta, subgroup analysis | L |
| 4.14 | Schema versioning discipline so 2026 data is still comparable to 2031 data | L |

### 5. Infrastructure

| # | Item | Phase |
|---|---|---|
| 5.1 | Supabase project, Postgres, Auth, Storage, RLS | C1 |
| 5.2 | Frontend hosting + custom domain + SSL | C1 |
| 5.3 | Stripe integration, three payment shapes, webhooks, failed-payment handling | C1 |
| 5.4 | Transactional email (Resend), welcome, receipt, reset, reminders | C1 |
| 5.5 | Staging environment separate from production | C1 |
| 5.6 | Error monitoring + uptime alerts | C1 |
| 5.7 | Git repo, branch discipline, CI deploy | C1 |
| 5.8 | SMS provider for reminders (Twilio) | C2 |
| 5.9 | Cyber liability / data breach insurance | C2 |

---

## PART TWO: THE BUSINESS

### 6. Entity & legal

- **[C1]** LLC formed, separate from 620, own EIN, bank account, Stripe account, domain, email
- **[C1]** Operating agreement
- **[C1]** No shared records with 620 under any circumstance, a 620 chart flowing into this database pulls the platform back under HIPAA
- **[C1]** Terms of Service, Privacy Policy, standalone Consumer Health Data Privacy Policy, Medical Disclaimer, Participation Agreement, attorney-reviewed
- **[C1]** Research consent language, drafted before a single signup
- **[C1]** Refund and cancellation policy, including mid-program withdrawal
- **[C1]** Trademark search on "The Human Battery Project"; file intent-to-use
- **[C2]** Trademark filing completed
- **[C2]** General liability + professional liability (coaching, not clinical)
- **[C2]** IRB decision, independent IRB now, or broad consent now and secondary-analysis exemption later

### 7. Lab & clinical partnership

- **[C1]** DTC lab partner selected, physician-signed orders, national draw network, API or portal access
- **[C1]** Final panel locked, the exact markers, priced
- **[C1]** Draw logistics, how a client books, where they go, turnaround time
- **[C1]** Abnormal-result protocol, written escalation path referring out to a physician. Non-negotiable
- **[C2]** Medical advisor on retainer for edge cases

### 8. Program content

- **[C1]** 90-day protocol finalized in three phases
- **[C1]** Dietary guidelines, what's in, what's out, the cheat definition
- **[C1]** Exercise guidelines by phase and fitness level
- **[C1]** Circadian practice guidelines
- **[C1]** Daily Five definition + scoring rules
- **[C1]** Battery Score methodology documented, subsystems, weights, how the composite is built
- **[C1]** Welcome kit / onboarding packet
- **[C1]** Weekly Zoom curriculum, 12 sessions outlined
- **[C2]** Video library, food prep, movement demos
- **[C2]** Printable/downloadable guides
- **[L]** Alumni maintenance tier content

### 9. Commerce

- **[C1]** Price set for Cohort 01
- **[C1]** Three payment shapes live: paid in full · two payments (day 0 / day 45) · three monthly
- **[C1]** Failed payment and dunning policy
- **[C1]** Bookkeeping + accountant, separate books from 620
- **[C2]** Sales tax / service tax review for a digital program in Texas
- **[L]** Alumni recurring tier

### 10. Marketing & acquisition

- **[C1]** Brand guide from the final logo, flat reductions, color usage, type
- **[C1]** Domain + branded email
- **[C1]** Social handles reserved
- **[C1]** Cohort 01 fill plan (personal network is fine and is the honest answer for ten seats)
- **[C2]** Email list + nurture sequence
- **[C2]** Testimonials and before/after with signed release
- **[C2]** Podcast launch as the top of funnel
- **[L]** Paid acquisition, affiliate/referral program

### 11. Delivery operations

- **[C1]** Cohort calendar, start date, Zoom cadence, milestone conversations, Day 90 draw
- **[C1]** Onboarding checklist per client, start to finish
- **[C1]** Daily accountability mechanism
- **[C1]** Exit interview + outcome capture at Day 90
- **[C2]** Coach hire profile and training material
- **[C2]** SOP manual so the program runs without you in every seat
- **[L]** Pod structure for 30-seat cohorts

---

## Critical path to Cohort 01

Everything above is real, but these four are the ones that block a launch and are expensive to fix later:

1. **Schema**: structured diary + labs + consents (§4.1-4.6)
2. **Legal set**: entity, consents, disclaimers, research language (§6)
3. **Lab partner + abnormal-result protocol** (§7)
4. **Portal MVP**: auth, intake, daily log, lab view, admin roster (§2, §3)

The content libraries, the analytics engine, and everything in §11 can be thin at launch. The schema cannot.
