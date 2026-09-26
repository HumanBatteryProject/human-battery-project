#!/bin/sh
# Post-deploy smoke test. Calls every endpoint and the Worker against the
# internal member and fails on any non-200 or empty body.
#
# WHY THIS EXISTS. It did not, and it was listed in the project's own summary as
# something that did. Post-deploy checking was done by hand every time, which
# means it was done differently every time and was never done at all on the
# deploys where it mattered. The audit on 25 September found three of the six
# endpoints had never completed a single run against the live database, and a
# smoke test would have said so months earlier.
#
# WHAT IT WILL NOT DO. It never writes irreversibly. onboard, trend and complete
# are called with dry_run, because onboard emails the participant, trend writes a
# proposal row per call, and complete marks the membership completed and chains
# the next cycle. brief-run and analyze are idempotent by design and are called
# for real, which is the point: idempotence that is never exercised is a claim.
#
# Usage:  sh scripts/smoke.sh [origin]
#   origin defaults to the live site. Pass http://127.0.0.1:8788 to smoke a
#   local wrangler session.

set -e
cd "$(dirname "$0")/.."
[ -f ./.dev.vars ] && { set -a; . ./.dev.vars; set +a; }

ORIGIN="${1:-https://thehumanbatteryproject.com}"
WORKER="${WORKER_URL:-https://hbp-brief.micah-bc6.workers.dev}"

for v in SUPABASE_URL SUPABASE_SERVICE_KEY WEBHOOK_SECRET; do
  eval "val=\$$v"
  [ -n "$val" ] || { echo "  $v is not set, cannot smoke test"; exit 1; }
done

sb () {  # sb <path>
  curl -s "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
}

# Resolve the internal member, and refuse to run against anybody else. A smoke
# test that can point at a real participant is a smoke test that will, once.
MEM_JSON=$(sb "memberships?is_internal=eq.true&select=id,client_id,day_zero&limit=1")
CLIENT=$(printf '%s' "$MEM_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a[0]?a[0].client_id:'')})")
MEMBERSHIP=$(printf '%s' "$MEM_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a[0]?a[0].id:'')})")
if [ -z "$CLIENT" ]; then
  echo "  no membership with is_internal = true. Refusing to smoke test against a real participant."
  exit 1
fi
EMAIL=$(sb "profiles?id=eq.$CLIENT&select=email" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a[0]?a[0].email:'?')})")
PANEL=$(sb "lab_panels?client_id=eq.$CLIENT&select=id&limit=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a[0]?a[0].id:'')})")

echo "smoke: $ORIGIN"
echo "  internal member $EMAIL"

FAILED=""
PASSED=0

# hit <name> <method> <path> <body> [extra header]
hit () {
  name="$1"; method="$2"; path="$3"; data="$4"; hdr="$5"
  if [ -n "$hdr" ]; then
    code=$(curl -s -o /tmp/smoke.out -w '%{http_code}' -X "$method" "$path" \
      -H 'Content-Type: application/json' -H "$hdr" ${data:+-d "$data"})
  else
    code=$(curl -s -o /tmp/smoke.out -w '%{http_code}' -X "$method" "$path" \
      -H 'Content-Type: application/json' ${data:+-d "$data"})
  fi
  bytes=$(wc -c < /tmp/smoke.out | tr -d ' ')
  body=$(head -c 110 /tmp/smoke.out | tr '\n' ' ')
  if [ "$code" != "200" ]; then
    printf '  %-24s FAILED  HTTP %s  %s\n' "$name" "$code" "$body"
    FAILED="$FAILED $name"
  elif [ "$bytes" -lt 3 ]; then
    printf '  %-24s FAILED  HTTP 200 but the body is empty (%s bytes)\n' "$name" "$bytes"
    FAILED="$FAILED $name"
  else
    printf '  %-24s ok      %s\n' "$name" "$body"
    PASSED=$((PASSED + 1))
  fi
}

SEC="x-hbp-secret: $WEBHOOK_SECRET"

# --- the five service-secret endpoints ---
hit "brief-run"  POST "$ORIGIN/api/brief-run" "{\"client_id\":\"$CLIENT\"}" "$SEC"
hit "trend"      POST "$ORIGIN/api/trend"     "{\"client_id\":\"$CLIENT\",\"dry_run\":true}" "$SEC"
hit "complete"   POST "$ORIGIN/api/complete"  "{\"client_id\":\"$CLIENT\",\"force_end_date\":\"2026-11-09\",\"dry_run\":true}" "$SEC"
hit "onboard"    POST "$ORIGIN/api/onboard"   "{\"membership_id\":\"$MEMBERSHIP\",\"dry_run\":true}" "$SEC"
hit "cycle-boundary" POST "$ORIGIN/api/cycle-boundary" '{"dry_run":true}' "$SEC"
if [ -n "$PANEL" ]; then
  # A real marker with a real unit, so the classification path actually runs.
  # dry_run stops it writing lab_results or dimension_scores.
  hit "analyze"  POST "$ORIGIN/api/analyze" \
    "{\"client_id\":\"$CLIENT\",\"panel_id\":\"$PANEL\",\"draw_point\":\"day_0\",\"dry_run\":true,\"results\":[{\"marker\":\"ferritin\",\"value\":120,\"unit\":\"ng/mL\"}]}" "$SEC"
else
  printf '  %-24s FAILED  the internal member has no lab panel to analyse\n' "analyze"
  FAILED="$FAILED analyze"
fi

# --- the coach, which takes a member session rather than the service secret ---
HASH=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H 'Content-Type: application/json' -d "{\"type\":\"magiclink\",\"email\":\"$EMAIL\"}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).hashed_token||'')}catch(e){console.log('')}})")
JWT=$(curl -s -X POST "$SUPABASE_URL/auth/v1/verify" -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H 'Content-Type: application/json' -d "{\"type\":\"magiclink\",\"token_hash\":\"$HASH\"}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).access_token||'')}catch(e){console.log('')}})")
if [ -n "$JWT" ]; then
  hit "coach" POST "$ORIGIN/api/coach" '{"question":"What does the Omega-3 Index measure?"}' "Authorization: Bearer $JWT"
else
  printf '  %-24s FAILED  could not mint a member session\n' "coach"
  FAILED="$FAILED coach"
fi

# --- the Worker, through its own fetch handler ---
hit "worker hbp-brief" POST "$WORKER" "" "$SEC"

# --- and the two things a 200 does not prove ---
printf '  %-24s ' "worker rejects no secret"
wcode=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WORKER")
if [ "$wcode" = "403" ]; then printf 'ok      HTTP 403\n'; PASSED=$((PASSED + 1))
else printf 'FAILED  expected 403, got %s\n' "$wcode"; FAILED="$FAILED worker-auth"; fi

printf '  %-24s ' "endpoints reject no secret"
acode=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$ORIGIN/api/trend" -H 'Content-Type: application/json' -d '{}')
if [ "$acode" = "403" ] || [ "$acode" = "401" ]; then printf 'ok      HTTP %s\n' "$acode"; PASSED=$((PASSED + 1))
else printf 'FAILED  expected 401 or 403, got %s\n' "$acode"; FAILED="$FAILED api-auth"; fi

echo
if [ -n "$FAILED" ]; then
  echo "SMOKE TEST FAILED:$FAILED"
  exit 1
fi
echo "smoke ok: $PASSED checks, every endpoint and the Worker answered"
exit 0
