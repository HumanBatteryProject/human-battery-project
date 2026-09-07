# Working in this repo

## Migrations are append-only

Never edit a migration that has been run against production. Postgres has
already applied it; changing the file changes nothing and makes the repo lie
about the database. Write a new numbered file instead.

## The portal config is a real file with fake values

`public/portal/config.js` is committed with placeholders. Replace the values
locally, and do not commit real keys — the anon key is technically safe to
expose, but keeping the file clean means nobody has to think about which key
is which.

## Never put the service key in `public/`

Anything under `public/` is served to the browser. The `service_role` key
bypasses row-level security entirely and belongs only in `functions/`, which
runs server-side and reads from environment variables.

## Changing the Battery Score

Do not edit an existing `score_methods` row. Publish a new version, and never
activate a new method mid-cohort — changing the methodology between day 0 and
day 90 invalidates the comparison for every client in that cohort.

## Evidence tiers

Protocol content carries a tier: `established`, `contested`, or
`working_model`. Anything marked `working_model` shapes the design of the
protocol and never appears as a claim in marketing or a consent form. See
`docs/HBP-Integration-Architecture.md`.
