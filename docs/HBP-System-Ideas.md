# What Turns This Into a System

## Ideas beyond what is already built

*Grouped by what they do. Near-term means buildable on the current stack in weeks. Far means it needs scale, partners, or both.*

---

## 1. Make the data objective, not self-reported

**Wearable ingestion.** Oura, Whoop, Apple Watch, Garmin. Nightly HRV, resting heart rate, sleep stages, skin temperature, respiratory rate, without anyone logging anything. HRV under standardized conditions is the closest thing to a daily coherence readout your foundational model has, and right now it is not being collected. One integration, and every client contributes a hundred data points a day instead of ten. *Near-term. Highest-value single addition.*

**CGM at both ends.** Stelo and Lingo are over the counter now. Two weeks at day 0, two at day 90. The system sees the glucose response to every logged meal and builds a personal food list: not the approved list, *this person's* list, ranked by what their own body did. *Near-term.*

**The phone as a light meter.** The phone has a lux sensor and knows if it is outdoors. The app can confirm morning light actually happened, at what intensity, for how long, without asking. Same for screens after sunset. The circadian protocol becomes measured instead of reported. *Near-term.*

**Photo logging.** Snap the plate. Vision model identifies the foods, matches them to the reference list, logs them structured. Removes the last friction from the thing everyone stops doing first. *Near-term.*

**Voice logging.** "Eggs and sardines, walked fifteen minutes, slept badly." Transcribed, parsed, logged. Under ten seconds. *Near-term.*

---

## 2. Make the system learn causation, not just correlation

**N-of-1 experiments.** The system runs personal experiments inside the 90 days. "For the next fourteen days, move your last meal an hour earlier. We are watching your fasting glucose and your sleep score." Each person is their own control. This is how a learning system moves from *people who did X had better Y* to *when this person did X, their Y changed*. With CGM and a wearable, the results are visible in days. *Near-term, and the thing that makes the trend agent worth something.*

**A digital twin per client.** Given their genotype, day 0 phenotype, tier and adherence, the model projects a day 90 trajectory with honest confidence bands. The client sees "if you hold 80 percent adherence, here is where the data says you land." As real outcomes accumulate, the projections tighten. At 25 people the bands are wide and it says so. At 2,500 they are useful. *Far, but the schema for it should exist now.*

**Dropout prediction.** Three missed days, falling behavioral scores, no brief opened in a week. The system knows who is about to quit before they do, and intervenes: a message, a call from you, a pod nudge. Retention is the entire game in a 90-day program, and this is the single most valuable prediction the system can make. *Near-term.*

**Symptom-to-marker mapping.** The log captures how they feel every day. The panel captures the biology twice. Connect them: "your afternoon crash stopped in week six, and your HOMA-IR dropped from 3.1 to 1.8." That sentence is what every client wants and no lab report has ever given anyone. *Near-term.*

---

## 3. Make it social, because adherence is social

**Pods.** Open enrollment lost the cohort, but it does not have to lose the group. Match people by tier and start wave into pods of five to eight with a shared thread. Peer accountability is the strongest adherence lever that exists and it costs nothing. *Near-term. The schema already has pods.*

**Household enrollment.** The kitchen is shared, the bedroom light is shared, the router is shared. One person doing the protocol alone in a house that is not is fighting their environment. Partner pricing, shared food list, shared log for the household elements. *Near-term.*

**The 90-day report.** At day 90 the system generates a beautiful branded document: their before and after, every marker that moved, their adherence, their briefs, their story. Shareable. It is the best marketing you will ever produce and every copy of it is also data. *Near-term.*

---

## 4. Make it a research instrument

**Alumni for life.** Every graduate is offered an annual panel at cost, forever. That is the dataset that matters: five- and ten-year outcomes on people who did the protocol once versus people who kept going. Nobody has that. *Starts now, pays off in years.*

**IRB, pre-registration, publication.** Register the protocol on OSF before the next wave. Get an IRB review or a documented exemption. Pre-specify primary outcomes. Then publish the first hundred. Fighting disease at scale means the findings have to leave the building in a form other people can build on. *Near-term to start, years to complete.*

**A de-identified open registry.** Once n is large enough, publish the dataset. Researchers who would never enroll in a coaching program will use it, and every paper that cites it is a paper that makes the model more credible. *Far.*

**Physician partners, both directions.** When a client's marker is out of range, the physician who receives the referral gets a clear branded summary with the day 0 data, not a scared patient with a printout. That physician starts referring their own patients *in*. The referral protocol becomes a network. *Near-term to start.*

---

## 5. Make it precise

**Season and latitude.** The system knows where each client is. Morning light timing adjusts to their sunrise. Midday exposure adjusts to UV index. Vitamin D targets adjust to season. A Beginner in Minnesota in January and one in Austin in July should not receive the same light instructions, and right now they do. *Near-term.*

**The genomic layer.** Already specified: six variants, twenty rules, personalized DHA and vitamin D dosing, chronotype-adjusted windows, mtDNA lineage. This is where "your protocol" becomes literally true. *Cohort 3.*

**The epigenetic clock.** DunedinPACE at day 0 and 90. The only real longevity number. *Cohort 2.*

---

## 6. Make it reach people

**Practitioner licensing.** Other chiropractors, coaches and clinics run the program under license, with their clients' data flowing into the central system. You cannot personally coach ten thousand people. A hundred practitioners can. And the dataset grows a hundred times faster. *Far, and the most important scaling decision.*

**Employer programs.** Self-insured employers pay for HbA1c and blood pressure improvements because they pay the claims. A twenty-person workplace wave with a shared Zoom is the same product sold once instead of twenty times. *Mid-term.*

**Condition-adjacent tracks with physician co-management.** Not "we reverse prediabetes." Rather: a metabolic track where a physician manages the medical side and the program manages the inputs, with shared data. The physician sees the log and the panel. The client gets both. This is how the program participates in fighting disease without claiming to treat it. *Mid-term, needs the physician network first.*

**The book as curriculum.** Each chapter unlocks by program day. The Beginner reads chapter one in week one. The Pro reads the appendix with the papers. The book stops being a product next to the program and becomes the program's voice. *Near-term.*

---

## 7. Put skin in the game

**Outcome-linked pricing.** If a client holds 80 percent adherence and their Battery Score does not improve, they get a credit toward the next cycle. It is a bold promise. It is also exactly the promise a measurement-based program can make that a testimonial-based one cannot, and it converts the honesty into a selling point. *Decision, not a build.*

---

## 8. Close the loop with the kitchen

**Grocery integration.** The approved food list becomes a shopping list. The recipes become an order. The order becomes a one-tap log. A grocery agent already in the works could be the front end for this; the protocol supplies the constraints and the log supplies the feedback. Food is where most programs die, and it dies at the store, not at the table. *Near-term if the pieces connect.*

---

## The three I would do first

1. **Wearable ingestion.** It turns self-reported sleep and stress into measured HRV and sleep stages overnight, for every client, and it is the coherence readout the model is missing.
2. **Dropout prediction.** Every other idea on this list is worthless for a client who quit in week three.
3. **N-of-1 experiments.** It is the mechanism by which the system actually learns, and it makes every client a participant in the research instead of a subject of it.

---

## The sentence

**A health program helps the people in it. A system learns from the people in it and helps the ones who come after. The difference is whether every client leaves the data richer than they found it.**
