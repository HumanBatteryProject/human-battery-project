# Runbook

What to do, and what to do when something is wrong.

Every command and every screen named here is checked by `scripts/rehearse_ops.sh`, which
fails if this document refers to something that does not exist. A runbook that names a
missing screen is worse than none, because it is read in the one situation where nobody
has time to discover it is wrong.

Run it before launch and after any change to operations:

    ./scripts/rehearse_ops.sh

---

## Every day

The jobs run themselves, from one cron in `workers/brief.js`. You do not start them.

1. Open **the admin console**, `/portal/admin/`. It shows applications waiting, rules
   waiting, held results, open support requests, and whether AI generation is on.
2. If **Applications** shows a number, answer those people. `/portal/admin/applications`.
   Accepting somebody is what lets them pay: until then checkout refuses their email.
3. If **Held results** shows a number, resolve them. `/portal/admin/results`. A held result
   is a value we could not map to a marker or a value with no unit. It is not in anybody's
   score until you resolve it.
4. If **AI generation is STOPPED**, that is the emergency stop and nothing is writing
   briefs. `/portal/admin/ops` turns it back on.

## Every week

1. Approve or retire any rules waiting in **Canon**, `/portal/admin/canon`. No participant
   gets a daily plan from an unapproved rule.
2. Read the **Audit log**, `/portal/admin/audit`, for anything you did not do yourself.
3. Run the smoke test: `./scripts/smoke.sh`. Seventeen checks against the live site.

---

## When something is wrong

### A deploy broke the site

    ./scripts/rollback.sh              # shows recent commits and what is live
    ./scripts/rollback.sh <commit>     # put that commit back
    ./scripts/rollback.sh main         # roll forward again

It rolls back the pages AND the API together, supplies that commit's dependencies, and
refuses to claim success until three consecutive reads agree. Ask the live site what it is
at any time:

    curl -s https://thehumanbatteryproject.com/build.json

### The AI is producing something wrong

`/portal/admin/ops` has the emergency stop. Turning AI generation off does NOT break the
product: the protocol rules are deterministic, so plans keep being written. Briefs stop,
because a brief is the model's words. The job reports those as `paused`, not `failed`.

### A job did not run

Check `agent_runs` on the member, visible under `/portal/admin/members`. Any job can be
re-run by hand with the service secret, for example:

    curl -X POST https://thehumanbatteryproject.com/api/brief-run \
      -H "x-hbp-secret: $WEBHOOK_SECRET" -H 'content-type: application/json' \
      -d '{"client_id":"<id>"}'

Every job is idempotent on the member and the day, so running it twice does not write twice.

### A payment failed

The billing job offers a weekly recovery plan on its own. What matters is the distinction
it makes: a charge it could not ATTEMPT is recorded as `blocked`, never as `failed`, so
nobody is offered a recovery plan for money that was never requested. Check with:

    curl -X POST https://thehumanbatteryproject.com/api/billing-run \
      -H "x-hbp-secret: $WEBHOOK_SECRET" -d '{"dry_run":true}'

### A member cannot sign in

Sign-in needs the Supabase auth configuration, which needs a personal access token:

    SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/set_auth_config.sh

Until that has been run, the magic link uses Supabase's default template, which points at
`/auth/v1/verify` and breaks when a mail client prefetches the link.

### A member asks for their data, or asks to be deleted

They can do both themselves from `/portal/account`. A deletion request is RECORDED with a
forty-five day due date and is never performed automatically, because deletion cannot be
undone. You fulfil it by hand. Their request is in `data_requests`.

### The database is wrong

    ./scripts/restore_rehearsal.sh

Takes a real dump, restores it into a scratch database, and verifies the data comes back.
It is read-only against production. Run it before launch so the answer is known rather
than hoped.

---

## What is still switched off, and why

| Switch | State | Why |
|---|---|---|
| `AI_GENERATION_ENABLED` | on | The kill switch. Off means plans without narratives. |
| `BATTERY_SCORE_ENABLED` | off | The composite formula is not confirmed. |
| `WEARABLES_ENABLED` | off | No provider credential exists yet. |
| `WEARABLE_OURA` | off | Needs `OURA_CLIENT_ID` and `OURA_CLIENT_SECRET`. |
| `WEARABLE_WHOOP` | off | Needs `WHOOP_CLIENT_ID` and `WHOOP_CLIENT_SECRET`. API v2 only. |
| `WEARABLE_POLAR` | off | Needs `POLAR_CLIENT_ID` and `POLAR_CLIENT_SECRET`. |
| `WEARABLE_WITHINGS` | off | Needs `WITHINGS_CLIENT_ID` and `WITHINGS_CLIENT_SECRET`. |
| `WEARABLE_GARMIN` | off | Needs the Connect Developer Program application approved. |
| `WEARABLE_GOOGLE` | off | Needs the restricted scope security review. |
| `WEARABLE_APPLE_UPLOAD` | off | Needs nothing but your word: no credential is involved. |

Turning one on is one line, and `check_no_fake_state.py` refuses the deploy if a provider is
on without its credential, because that offers a member a connection that cannot complete:

    psql "$SUPABASE_DB_URL" -c "update feature_flags set enabled=true where key='WEARABLE_OURA'"
    psql "$SUPABASE_DB_URL" -c "update feature_flags set enabled=true where key='WEARABLES_ENABLED'"

### A member wants to connect a ring or a watch

They do it themselves at `/portal/devices`. Connecting needs their agreement to the health data
policy first, and withdrawing that agreement disconnects every device. Disconnecting asks
whether to keep or delete the readings already taken, and never guesses.

---

## What only you can do

These are not code. Nothing here can proceed without them.

1. A Supabase personal access token, so sign-in works from a real mailbox.
2. Stripe keys. Both of them: a secret key without a webhook secret means the payment
   succeeds and nobody gets onboarded.
3. Legal review of the terms, the privacy policy and the consent text. Three of the five
   consent documents say `v1-unreviewed` on their face.
4. The six wrong sentences in the stored consent text, which still describe cohorts and a
   payment schedule the software does not charge.
5. Two pilot participants with phones.
6. Provider credentials for any wearable, and a real device for each.
