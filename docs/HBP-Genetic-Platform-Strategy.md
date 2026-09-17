# From Program to Platform

## How The Human Battery Project becomes a genetic software system for health and longevity

---

## The short answer

You add two layers underneath what you already have, and you build the software that learns from the relationship between them.

**What you have now** measures phenotype: what a person's body is doing, twice, and what they do every day. That is the middle of the stack.

**What is missing** is the bottom and the top. The bottom is the genome: what the person was built from and cannot change. The top is the epigenome: the actual pace at which they are aging, which changes, and which is the only real longevity number that exists.

Once those are in the schema, the question the software can answer changes from *what changed in this person* to *which protocol works for which kind of person*. That is the difference between a program and a platform, and it is the thing nobody in this space has built properly.

---

## The five layers

| Layer | What it is | Changes? | Measured by | Status |
|---|---|---|---|---|
| **1. Genome** | The instruction set. Fixed at birth. | Never | One-time sequencing | Not built |
| **2. Epigenome** | Which instructions are switched on. The pace of aging. | Yes, over months | DNA methylation clocks | Not built |
| **3. Phenotype** | What the body is doing right now | Yes, over weeks | Your 33 markers, VO₂max, grip | **Built** |
| **4. Inputs** | What the person does every day | Daily | The structured log | **Built** |
| **5. The learning layer** | Which inputs move which phenotype in which genotype | Improves with every cohort | The software | Not built |

Layer 5 is the product. Layers 1 and 2 are what make it possible. Layers 3 and 4 are why you are ahead of everyone else, because almost nobody has 4 as structured data.

---

## Layer 2 first: the epigenetic clock

This is the single most important addition, and it should go in before genomics.

**What it is.** DNA methylation patterns change with age in a predictable way. Several validated algorithms read those patterns and produce a biological age. The newer ones, DunedinPACE especially, measure the *pace* of aging rather than the accumulated total, which is what makes them useful over a 90-day window.

**Why it matters more than anything else you could add.** Your program claims to work on longevity. Right now you measure things that correlate with longevity. An epigenetic clock measures longevity itself, or as close as science currently gets. A client who moves their pace of aging from 1.1 to 0.9 years per year has a number that means something to every physician and every journal, and you would be one of very few programs in the world producing it at scale on a defined protocol.

**Practical.** TruDiagnostic and similar labs run it from a finger-prick blood spot, mailed in, $300 to $500. Day 0 and day 90. Participant pays, same as everything else. Results take two to three weeks.

**The honest caveat.** Ninety days is short for most clocks. GrimAge and Horvath move slowly and noise can swamp signal over one quarter. DunedinPACE is designed for exactly this problem and has shown intervention response in trials. Run DunedinPACE as primary, and report the others as secondary with the caveat stated.

**The schema change** is one table, one migration. `epigenetic_panels` with clock name, value, and draw point, joined to the client like everything else.

---

## Layer 1: the genome, and which genes actually matter to you

Sequencing is cheap now: whole genome for a few hundred dollars, one time, never repeated. The trap is that most consumer genomics is noise dressed as insight. Polygenic risk scores for common disease are weak. MTHFR is wildly overhyped. Half of what 23andMe tells people is astrology.

But a small set of variants have real, replicated effects on exactly the things your protocol manipulates. These are the ones worth building on:

**Circadian.** CLOCK, PER2, PER3, CRY1, and the ADRB1 short-sleep variant. These set chronotype: whether someone is genuinely a morning person or a night person. Your protocol puts light and food early for everyone. A person with a strong evening chronotype may need the window shifted, and the genome tells you that before day one instead of after they fail.

**DHA response.** APOE. Carriers of APOE4, roughly a quarter of people, handle dietary fat and DHA differently, and there is real evidence that they need more DHA and respond differently to it. Your Omega-3 Index dosing table is currently the same for everyone. APOE status is how it becomes personal.

**Vitamin D response.** VDR and GC variants affect how much serum vitamin D a person makes from the same sun exposure and the same supplement dose. Two people on your midday sun protocol will land in different places. The genome explains why and lets you dose accordingly.

**Caffeine.** CYP1A2. Fast and slow metabolizers. Slow metabolizers on afternoon coffee are wrecking their sleep and do not know it. One variant, one clear rule.

**Fuel handling.** PPARG, TCF7L2, FTO. Modest effects individually, but they bear on how someone responds to the eating window and the carbohydrate level of their tier.

**Mitochondria.** This is the Wallace layer that has been sitting unmeasured in your model since Addendum II. mtDNA haplogroup, one time, explains why two people on identical protocols get different results. It does not change the protocol yet. It makes the dataset far more valuable, because it is the variable that will eventually explain the outliers.

**Nothing else on day one.** Resist the full panel. Six or seven variants with real evidence, tied directly to things your protocol already does, is a system. Two hundred variants with weak evidence is a horoscope.

---

## Layer 5: what the software has to become

Right now the portal collects and displays. A genetic longevity platform has to *recommend* and *learn*. That is three components.

### 1. A rules engine

The first version is not machine learning. It is if-then rules written from the literature, applied to a genotype and a phenotype:

- APOE4 carrier with Omega-3 Index under 5%: DHA dose moves from 1,500 to 2,500 mg
- CYP1A2 slow metabolizer: coffee cutoff moves from noon to 10am, and the log flags any coffee after it
- Evening chronotype variant with early-window tier: window shifts one hour later, light block moves later
- VDR low-responder with vitamin D under 30: supplement dose doubles, sun exposure held constant

Twenty rules covers most of it. Each rule is a row in a table with the genotype condition, the phenotype condition, the protocol adjustment, and the citation. Transparent, auditable, and a client can see exactly why their protocol differs from the default.

### 2. A protocol generator

The four tier documents you have now are static PDFs. They become templates with variables. The generator takes tier, genotype, day 0 phenotype, and the rules engine's output, and produces *this person's* protocol. Same structure, personalized numbers.

That is what "genetic software" means in practice: the document a Beginner APOE4 carrier with an evening chronotype receives is different from the one a Beginner APOE3 morning person receives, and the difference is explained on the page.

### 3. The outcome model

This is the layer that gets better with every cohort, and it is where the research value lives.

Every client produces a row: genotype, day 0 phenotype, tier, adherence by domain, day 90 phenotype, epigenetic pace change. After a few hundred rows you can start asking real questions. Do APOE4 carriers on the high-DHA rule actually reach 8% faster? Do evening chronotypes on the shifted window improve HbA1c as much as morning types on the standard one? Which behavioral domain in the log predicts pace-of-aging change most strongly?

Those are the questions that turn into papers, and the answers feed back into the rules engine. That loop is the platform.

---

## What has to change in the build

**Schema.** Three new tables: `genotypes` (client, variant, allele, source, date), `epigenetic_panels` (client, clock, value, draw point), and `protocol_rules` (condition, adjustment, evidence citation, version). All three join to existing tables. The structured design you already have is exactly what makes this straightforward.

**Consent.** Genomic data is a separate consent, above the health-data consent you already capture. It is protected under GINA federally and by additional state laws. The research consent needs explicit language about genetic data, and the de-identification pipeline has to handle the fact that a genome is inherently identifying. This is a real legal lift and it should be scoped before the first sample is collected, not after.

**Lab partners.** One for sequencing, one for methylation. Both mail-in, both participant-paid. The requisition path is the same one you are building for the blood panel.

**The portal.** A genome page that shows the variants that matter and what each one changed in their protocol. Not a raw genome dump. Six variants, plain language, and the rule each one triggered.

**Testing cadence.** Genome once, ever. Epigenetic clock at day 0 and day 90, and then annually for alumni. That last part matters: the alumni annual test is how you get five-year longitudinal data from people who have finished the program, which is the dataset that would actually be worth something.

---

## The honest constraints

**Most nutrigenomics is weak.** The six variants above are the defensible core. Be ready to say no to the seventy others clients will ask about.

**Epigenetic clocks are the best longevity measure that exists and they are still noisy over 90 days.** Report them honestly. A client whose pace does not move in one quarter has not failed.

**A genome is the most identifying data there is.** Your privacy obligations go up a level. This is where the entity separation, the consent architecture, and the row-level security you built early stop being cautious and start being necessary.

**You are not a physician.** Genotype-guided protocol adjustments are coaching decisions on lifestyle inputs, not medical treatment. Keep it that way. A rule that adjusts DHA dose is coaching. A rule that suggests stopping a medication is not, and it never appears.

**n is everything.** The learning layer is worthless at 25 people and interesting at 250. The first several cohorts are collecting, not learning. Say so.

---

## The sequence

| When | What | Why then |
|---|---|---|
| **Cohort 01** | Phenotype and log only. Exactly what you have. | Prove the program works before adding layers. |
| **Cohort 02** | Add DunedinPACE at day 0 and 90. | The longevity number. Cheapest, highest-value addition. |
| **Cohort 03** | Add the six-variant genotype panel. Ship the rules engine with twenty rules. | Personalization becomes real and explainable. |
| **Cohort 04** | Protocol generator replaces static PDFs. Alumni annual testing begins. | The system now produces individual protocols and starts longitudinal collection. |
| **Cohort 08+** | Outcome model with enough rows to test hypotheses. First paper. | The loop closes. Rules get updated from your own data. |

---

## What it becomes

A person arrives. They are sequenced once, tested twice, and they log every day. The software knows their chronotype, their fat handling, their vitamin D response, and their mitochondrial lineage. It hands them a protocol that is theirs, explains every deviation from the default, and tracks their pace of aging against it. At the end, it has one more row, and every person after them gets a slightly better protocol because of it.

That is a genetic software system for health and longevity. Every piece of it is buildable with what exists today, and you already have the two hardest parts done: the structured log and the access architecture. The rest is sequencing.

---

## The line

**We sequence you once, measure you twice, and learn from everyone who came before you.**
