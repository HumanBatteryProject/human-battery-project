# The Human Battery Project

*An overview: what it is, where it stands, where it's going.*

---

## The idea

Most people who feel bad don't have a diagnosable disease. They're tired, heavier than they used to be, foggy, sleeping badly, and running on less than they had ten years ago. They go to a doctor, get bloodwork, and get told everything looks normal. Nothing is technically wrong, and nothing gets better.

The Human Battery Project treats that as a capacity problem rather than a disease problem. Your body runs on a battery: how much charge it holds, how fast it loses it, how well it recharges. Almost nobody has ever had that measured.

The five things people complain about most, chronic tiredness, weight that won't move, brain fog, broken sleep, no drive, get treated as five separate problems by five different approaches, usually one at a time and usually for years. They aren't separate. Each sits downstream of a system that has lost capacity.

Modern medicine is extraordinary at acute care: trauma, infection, cardiac events, cancer. Where it has failed is chronic metabolic disease, and the reason is structural. The system is built to intervene after pathology appears, it reimburses procedures and prescriptions rather than prevention, and it gives a physician twelve minutes to address something caused by twenty years of inputs. That's not incompetence. It's a system doing exactly what it was designed and paid to do. But it leaves an enormous gap, and that gap is the business.

---

## The program

Ninety days. Thirty seats in the first cohort. $1,000.

**Blood drawn twice**: day 0 and day 90, through a partner laboratory under a physician-signed requisition. The panel is read as four subsystems rather than a wall of numbers:

| | What it measures |
|---|---|
| **Charge** | How well you handle fuel, glucose, insulin, HbA1c and the ratios between them |
| **Drain** | What's quietly consuming capacity, inflammatory markers |
| **Output** | What you can actually spend, the hormonal panel governing drive, recovery, repair |
| **Reserve** | The raw material the other three draw on, substrate status, iron handling, vitamin D |

Those four become a single composite index, the **Battery Score**, calculated at both ends. It's a tracking instrument for the program, not a diagnostic tool, and it's never presented as one.

**Three phases, each with one job.**

1. **Days 1-30: Stop the drain.** Remove what's costing capacity before adding anything that builds it. Sugar and alcohol out, fixed sleep window, morning light non-negotiable, daily logging starts.
2. **Days 31-60: Recharge.** Protein target, real training on a holdable schedule, cold and heat exposure, meal timing aligned to the person's own clock.
3. **Days 61-90: Build capacity.** Load increases, work shifts from repair to headroom. Ends with the second blood draw and a session comparing it against day 0.

**Support:** a weekly group call for the cohort, a weekly one-to-one, a daily accountability thread across the cohort, and a written maintenance plan at the end.

---

## The part that makes it a business rather than a coaching practice

Every client logs daily in their own portal. What they ate, what training they did, sleep and light timing, whether they hit the day's protocol.

The logging is not free text. Every entry is structured, food selected from a controlled list with IDs, exercise against a fixed taxonomy, circadian items as timestamps. It has to be tappable and finish in under sixty seconds, because compliance collapses otherwise. Missing a day is logged, not punished, a program that shames people into silence produces a record of good days only, which is worthless.

That does two things at once. It keeps people honest day to day, and it produces a structured research dataset as a byproduct of the coaching. The clients do the documentation.

Layered on top of the blood panel is a second scoring axis built from the log, the behavioral inputs that drive capacity and that bloodwork doesn't capture:

- Social connection and sense of purpose
- Cognitive load: deliberate learning versus passive consumption
- Movement and muscle
- Light exposure and sleep timing
- Emotional and stress load

Two layers, measured at both ends, on the same cohort. Everyone in the longevity space has either bloodwork or lifestyle content. Nobody has both, structured from day one, on the same people. Over years and thousands of participants, that becomes a dataset capable of answering questions nobody can currently answer, such as whether adherence in a given behavioral domain predicts movement in a specific biomarker.

---

## The stance on evidence

This is the discipline the whole thing depends on.

There's an enormous amount of contrarian health content that feels true and doesn't survive scrutiny, sugar industry conspiracies, cholesterol denial, "they lied to you about everything." Some of it has real substance underneath. Most of the stated mechanisms don't hold.

The position here is deliberately different. Where the consensus is genuinely weak, say so and say why. Where it's strong, don't pick a fight to sound edgy. And in every case, end on measurement rather than assertion, not "they lied to you," but "here's what we measured in our people."

Anyone can be contrarian. Almost nobody can show two blood draws on the same person ninety days apart. The rigor isn't a constraint on the growth. It's the thing that makes the growth defensible when it comes.

---

## What's being built

**A software platform, not a website.** Three surfaces: a public marketing site, an authenticated client portal, and a coach/admin console.

The portal handles intake, consent capture, the daily log, lab upload and the day 0 versus day 90 comparison, and the content libraries, approved foods, exercises, circadian practices.

**The content:** an approved food list with IDs (which doubles as the log's vocabulary), a short list of daily non-negotiables, and a cookbook built only from approved items, sharing the same IDs so a logged meal can eventually be one tap.

**Also in the works:** a companion book, twenty chapters, and a solo podcast.

---

## Where it stands

**Done:** the brand and logo system, and the marketing site, built as a static site in a GitHub repo, deployed through Cloudflare Pages, with an application form writing to a database.

**Next, and in this order:** the database schema, the legal documents under attorney review, the lab partnership with its abnormal-result protocol, and then the client portal.

The schema comes first because it's the thing that's expensive to get wrong. Adding a page to the site later costs an afternoon. Discovering in year three that exercise was stored as free text costs the entire research thesis, because that data can't be recovered.

---

## Where it's going

Cohort 01 is twenty-five people, filled from a personal network. That's deliberate. Nobody buys the second cohort on the strength of the thesis. They buy it on the first cohort’s numbers.

From there: pods of ten to fifteen under trained coaches, with the founder running coaches instead of clients. Exception-based log review, where the system flags missed logs and adverse trends rather than a human reading everything. Group calls stay group; one-to-ones become milestone-only. Cohorts of hundreds are entirely plausible, the software scales for free, and the coaching is what has to be restructured.

The long-term ambition is live events and stage work in the mold of a Tony Robbins, but with a difference that matters: numbers from thousands of people rather than stories from a handful.

Which is exactly why the rigor comes first.
