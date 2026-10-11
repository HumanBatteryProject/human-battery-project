# The agent organization

Twenty seven agents in four groups, plus the nine agents inside the product.
Every one answers, directly or through the CEO Agent, to Micah Pittman. None of
them can change the canon, move money, change access, publish a word a member
reads, or send anything on its own.

## The chain of command

1. **Micah directs the CEO Agent.** He is the only one who approves anything:
   anything new, any change to the canon, any member-facing wording, any legal
   document, any merge, any deploy.
2. **The CEO Agent** summarises everything and hands his directions to the right
   agent. It never approves, and approval requests reach him unchanged.
3. **The Lead Engineer** reports directly to him and runs the engineers.
   Engineers report only to the Lead. Approvals go engineer, to Lead, to him.
4. **The ops and assistant agents** report through the 7 AM ops brief and the
   CEO Agent's 7:30 summary.
5. **The in-product agents** answer to the canon: the book, then
   `docs/HBP-Canonical-Positions.md`. No agent writes the canon.

## The files

| Path | What it is |
|---|---|
| `.claude/agents/<name>.md` | One agent: its job, its never-allowed list, its tools, its model, its cost cap and the exact shape of its report |
| `.claude/hooks/protected-paths.py` | The PreToolUse hook that makes the load-bearing half of those lists a fact about the repository |
| `agents/roster.json` | The declaration: who exists, which group, what they may never do |
| `agents/DIRECTIONS.md` | Where Micah writes. The CEO Agent reads it every run |
| `agents/DIRECTIONS-done.md` | Lines that became issues, with the issue number |
| `agents/reports/<date>/<agent>.md` | Every run writes one and commits it |

## The protected paths

No agent writes these. The hook refuses them, and the refusal is enforced by
the harness rather than by the agent's own good behaviour.

| Path | Who may write it |
|---|---|
| `docs/` | Nobody. The canon is Micah's |
| `corpus/` | `canon-engineer` only |
| `functions/api/checkout.js` | Nobody while payments are parked |
| `functions/api/stripe-webhook.js` | Nobody while payments are parked |
| `public/privacy.html`, `terms.html`, `disclaimer.html`, `consumer-health-data.html` | Nobody |
| `public/assets/wordmark*`, `mark-*` | Nobody |
| a migration already on disk | Nobody. Write a new number |
| `.dev.vars` | Nobody |

A read-only agent may write nothing at all except its own report under
`agents/reports/`.

**The main session carries no `agent_type` and is allowed through.** That is the
chain of command written down: an agent is a subagent and has a name, and the
person is not an agent. The hook constrains agents. It is not a guard against
Micah and does not pretend to be one.

## Proving it

```sh
python3 .claude/hooks/protected-paths.py --seed       # every refusal, printed
python3 .claude/hooks/tests/test_protected_paths.py   # 49 cases, in the gate
```

A check that has never refused anything is not evidence that nothing needed
refusing. That is why the seed exists, and it is the same reason
`scripts/check_logo.py` has one.

## What stays with a person

Supabase owner access, the Cloudflare account, Stripe once it is live, the
domain registrar, Resend, GitHub owner access, the bank, the Zoom host seat,
the book and the canonical positions, every canon approval, every change to
words a member reads, and every physician referral decision. Micah, with two
factor login, using steps the agents prepare.
