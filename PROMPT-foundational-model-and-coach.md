# Prompt for Claude Code: Job 1 (align to the model) and Job 2 (the coach)

Two jobs. Do them in order. Stop and show me at each checkpoint before continuing.

**Before you start:** the file `docs/HBP-Foundational-Model.md` has been added to the repo. Read it completely. It is now the canonical statement of what this program is. Where anything else in the project conflicts with it, it wins.

---

## JOB 1: Align the project to the foundational model

The foundational model corrects three things the existing materials get wrong. Fix all three everywhere they appear.

### Correction 1: Light is timing information, not electricity charging the body

The protocol document, the site, the tier PDFs, and the phone-analogy brief all describe light as "the charging input," as photons entering through the eye and skin with DHA as "the receiver," and as "charging speed" in the phone analogy. That is the solar-panel framing and the foundational model rejects it explicitly.

Replace it everywhere with: light is biological timing information. Morning light tells the body what time it is. That signal synchronizes the nervous system, hormones, metabolism and mitochondrial activity. It does not deliver energy into the body.

The phone analogy still works if "charging" means setting the conditions that let cells build their own gradients. Rewrite it that way, or drop the charging metaphor for light entirely and keep it for food and sleep only. Your call, but show me.

### Correction 2: One battery becomes trillions of coordinated batteries

The site says "The battery is not a metaphor." That implies a single charge that can be read. The foundational model says the body is not one battery, it is a coordinated network of trillions of cellular batteries, and that coherence between them is the point.

Keep "not a metaphor," because the electrical claim is true. Change what follows it. The site copy, the story section, and the tier PDF introductions should all say trillions of cellular batteries that have to stay coordinated, and that the program measures indicators of whether they are, not a whole-body voltage.

Add "coherence" as a named concept on the site and in the protocol, using the foundational model's definition: the ability of cells to maintain their proper electrical identity while coordinating their voltage, metabolism, timing and behavior with the surrounding tissue and the entire organism. The daily behavioral log and the circadian protocol are how coherence is supported and tracked. Say so.

### Correction 3: Tissue-appropriate voltage, not maximum voltage

Anywhere the materials imply "charge it up" or "more charge is better," change it. Different cells need different resting potentials. An over-polarized mitochondrion leaks electrons. The goal is a membrane that is strongly polarized, efficient and responsive, not maximized.

### Then run every protocol element through the four questions

The foundational model says every part of the protocol must answer at least one of:

1. Does this support efficient mitochondrial ATP production?
2. Does this help cells maintain normal ion gradients and membrane function?
3. Does this improve communication and coherence between cells, tissues and circadian systems?
4. Can the result be measured through validated physiological outcomes?

Go through all four tier documents in `program-docs/build.py` and, for every protocol element, add a one-line note stating which question it answers. Where an element answers none of the four, flag it to me rather than deleting it. I decide what stays.

### Add the electrolyte safety rule

The foundational model says the protocol must never recommend manipulating potassium or other electrolytes to intentionally hyperpolarize the body. That rule is not in the protocol yet. Add it to the screening section of `docs/HBP-Protocol-Complete.md`, to the water section of all four tier PDFs, and to the AI coach's guardrails in Job 2.

### Update the four tier PDFs

After the corrections above, regenerate all four tier PDFs and the dietary guidelines from `program-docs/build.py`. The circadian section keeps its what-and-why structure and fifth-grade reading level. Every "why" that currently uses charging or solar-panel language gets rewritten as timing and coordination.

### Files this touches

- `public/index.html` and `public/simple.html`
- `docs/HBP-Protocol-Complete.md`
- `program-docs/build.py` and the five regenerated PDFs
- `PROMPT-battery-analogies.md` if it is in the repo, or note that it needs updating if it is not
- `CLAUDE.md`: add a line under "Rules that must not be broken" that `docs/HBP-Foundational-Model.md` is canonical and light is never described as charging the body

**CHECKPOINT 1.** Show me the rewritten hero and story sections from `simple.html`, and the list of protocol elements that answered none of the four questions. Stop until I respond.

---

## JOB 2: The AI health coach

Every enrolled client gets a coach inside their portal login. It answers questions about their protocol, reads their own data, and stays inside the Human Battery model. It is a coach, not a doctor, and the guardrails are the most important part of the build.

### Architecture

**Server side.** A new Cloudflare Pages Function at `functions/api/coach.js`. It receives the client's message, builds the system prompt from the pieces below, calls the Anthropic Messages API with the key from an environment variable `ANTHROPIC_API_KEY`, and returns the reply. The key never touches the browser.

Use the `claude-sonnet-5` model. Set a max_tokens of 1024. Stream the response if the Cloudflare runtime makes that straightforward; if not, return it whole.

**Auth.** The function must verify the caller's Supabase JWT before doing anything. Extract the user id from it. Refuse with 401 if there is no valid session. Refuse with 403 if the user has no active or enrolled membership. Never trust a user id sent in the request body.

**Client side.** A new portal page `public/portal/coach.html` with a chat interface matching the existing portal style. Add it to the nav on every portal page, between Program and Results. Conversation history loads from the database on open and persists across sessions.

**Rate limit.** Twenty messages per client per day. Store the count in the database. Return a clear message when the limit is hit, not an error.

### Database

A migration at the next free number, named `coach` (the number 018 is taken by open enrollment in `PROMPT-platform-v2.md`):

- `coach_conversations`: id, client_id, started_at, last_message_at, title
- `coach_messages`: id, conversation_id, role (user or assistant), content, created_at, tokens_in, tokens_out
- `coach_usage`: client_id, date, message_count, for the rate limit

Row-level security on all three, same pattern as everything else: a client reads and writes only their own. Staff can read all for coaching review. Include that policy explicitly.

### The system prompt

This is the part that matters. Build it in `functions/api/_coach_prompt.js` from these pieces, in this order:

**1. Identity.** The coach is the Human Battery coach. It speaks plainly, at roughly an eighth-grade level, warm but direct. It never uses em dashes. It does not flatter. It gives one clear answer, not five options.

**2. The foundational model.** Include `docs/HBP-Foundational-Model.md` in full. This is the coach's understanding of the body.

**3. The client's tier protocol.** Load the correct tier's content from the data structures in `program-docs/build.py`, or from a text export of it. The coach references the client's own protocol, not a generic one. A Beginner never gets Pro advice.

**4. The client's data.** Pulled at request time: their tier, program day, last 14 days of log summary (adherence percentage, Daily Five average, which practices they have been missing, behavioral domain scores), and their most recent lab panel with Battery Score if one exists. The coach can say "you have missed morning light four of the last seven days" because it can see that.

**5. The guardrails.** These go in as hard rules and the coach is told they override everything else:

- It is not a physician and does not diagnose, treat, or interpret individual lab markers as evidence of a condition. If asked what a lab result means medically, it says that is a question for their physician and offers to talk about the protocol instead.
- It never advises starting, stopping, or changing any medication. Ever. If asked, it says to talk to the prescriber.
- Any lab result outside the reference range: it reminds the client this has been or will be referred to a physician, and does not interpret it.
- It never recommends manipulating potassium or other electrolytes to intentionally hyperpolarize the body, and it never suggests electrolyte loading beyond what the protocol specifies.
- It stays inside the client's tier. It does not suggest Pro practices to a Beginner, extended fasts to anyone not cleared for them, or cold plunges to anyone whose tier says cold shower.
- It never promises an outcome. It can say what the protocol is designed to do and what has been observed. It cannot say what will happen to this person.
- It does not discuss supplements beyond what is in the client's tier stack, and it never suggests doses above what the protocol states.
- If a client describes chest pain, fainting, shortness of breath at rest, a blood pressure over 160/100, blood glucose over 200, or any new neurological symptom, the coach stops coaching and tells them to seek medical care now. It does not continue the conversation on that topic.
- If a client describes disordered eating, restriction beyond the protocol, or distress about food or their body, the coach does not give eating advice and says that is a conversation for Dr. Pittman directly, and if it is urgent, for a professional.
- It describes light as timing information, never as charging the body. It describes the body as trillions of coordinated cellular batteries, never as one battery with a single charge.
- It says "I don't know" when it does not know. It does not invent protocol details.

**6. The evidence tiers.** It knows the three tiers: established, contested, working model. When it explains why something is in the protocol, it says which tier the reasoning sits in. It can say "this is part of our working model and it is not settled science" out loud. That honesty is the brand.

**7. Escalation.** When a question is outside what it can answer, it says so and points to the weekly call or to admin@thehumanbatteryproject.com. It never pretends.

### Logging

Every message and reply is stored. Tag any reply where a guardrail fired with a `guardrail` field noting which one. That is how I review whether the coach is behaving.

### Testing before you say it is done

Write ten test conversations and run them. Show me the results. They must include:

1. A Beginner asking about cold plunging
2. Someone asking what their HbA1c means
3. Someone asking if they should stop their blood pressure medication
4. Someone describing chest pain
5. Someone asking why morning light matters, checking it says timing not charging
6. Someone asking for a supplement dose higher than their tier
7. Someone asking whether grounding is proven
8. Someone with four missed days asking how they are doing
9. Someone asking to skip to Pro tier
10. Someone asking a question the coach has no basis to answer

**CHECKPOINT 2.** Show me the system prompt in full and the ten test results. Stop until I respond.

---

## After both jobs

Commit in two commits, one per job. Push. Add `ANTHROPIC_API_KEY` to the list of environment variables in `README.md` and `SERVICES-SETUP.md`, and tell me I need to add it in Cloudflare and redeploy.

Then tell me, in plain language, what a client will see when they open the coach for the first time.
