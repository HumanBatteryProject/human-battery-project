#!/usr/bin/env bash
# The operational rehearsal. Part I Day 13.
#
# A RUNBOOK THAT NAMES A MISSING SCREEN IS WORSE THAN NONE, because it is read in the one
# situation where nobody has time to discover it is wrong. This walks docs/RUNBOOK.md and
# proves that every script it names exists and is executable, every admin screen it names
# is served, every endpoint it names answers, and every feature flag it describes really
# is in the state the table claims.
#
# It does not just check that files exist. It runs the read-only ones and asks the live
# site the questions the runbook tells the owner to ask, so the answers in it are the
# answers you actually get.
set -uo pipefail
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
cd "$(dirname "$0")/.."
set -a; [ -f ./.dev.vars ] && . ./.dev.vars; set +a

BASE="${HBP_BASE:-https://thehumanbatteryproject.com}"
RUNBOOK=docs/RUNBOOK.md
FAILED=0
ok ()   { printf '  pass  %s\n' "$1"; }
fail () { printf '  FAIL  %s  %s\n' "$1" "${2:-}"; FAILED=$((FAILED + 1)); }

[ -f "$RUNBOOK" ] || { echo "  $RUNBOOK does not exist"; exit 1; }
echo "  rehearsing $(wc -l < $RUNBOOK | tr -d ' ') lines of runbook against the live system"
echo

# ---------------------------------------------------------------------
echo "Every script the runbook names"
# ---------------------------------------------------------------------
# Pulled OUT OF THE DOCUMENT rather than listed here, so adding a command to the runbook
# without creating it is caught.
for s in $(grep -oE '\./scripts/[a-z_]+\.(sh|mjs)' "$RUNBOOK" | sed 's|^\./||' | sort -u); do
  if [ ! -f "$s" ]; then fail "$s is named in the runbook" "the file does not exist"
  elif [ ! -x "$s" ] && [ "${s##*.}" = "sh" ]; then fail "$s" "not executable"
  else
    # A shell script that cannot even be parsed is not a recovery path.
    if [ "${s##*.}" = "sh" ] && ! bash -n "$s" 2>/dev/null; then fail "$s" "does not parse"
    elif [ "${s##*.}" = "mjs" ] && ! node --check "$s" 2>/dev/null; then fail "$s" "does not parse"
    else ok "$s exists, is executable and parses"; fi
  fi
done

# ---------------------------------------------------------------------
echo
echo "Every admin screen the runbook sends you to"
# ---------------------------------------------------------------------
for p in $(grep -oE '/portal/admin/[a-z]*' "$RUNBOOK" | sort -u); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")
  # An admin screen serves its HTML to anybody and refuses the DATA, which is the whole
  # design: the gate is row level security, not the page being unreachable.
  if [ "$code" = "200" ]; then ok "$p is served (HTTP $code)"
  else fail "$p" "HTTP $code"; fi
done
for p in /portal/account; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$p")
  [ "$code" = "200" ] && ok "$p is served" || fail "$p" "HTTP $code"
done

# ---------------------------------------------------------------------
echo
echo "Every endpoint the runbook tells you to curl"
# ---------------------------------------------------------------------
if [ -z "${WEBHOOK_SECRET:-}" ]; then
  fail "WEBHOOK_SECRET" "not set, so the runbook's curl examples cannot be rehearsed"
else
  for ep in brief-run billing-run; do
    body='{"dry_run":true}'
    code=$(curl -s -o /tmp/ops.out -w '%{http_code}' -X POST "$BASE/api/$ep" \
      -H "x-hbp-secret: $WEBHOOK_SECRET" -H 'content-type: application/json' -d "$body")
    if [ "$code" = "200" ]; then ok "/api/$ep answers the runbook's own command"
    else fail "/api/$ep" "HTTP $code $(head -c 80 /tmp/ops.out)"; fi
  done
  # And that it REFUSES without the secret, since the runbook hands out the command.
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/brief-run" -d '{}')
  [ "$code" = "403" ] && ok "/api/brief-run refuses without the secret (HTTP 403)" \
                      || fail "/api/brief-run without the secret" "HTTP $code, expected 403"
fi

# ---------------------------------------------------------------------
echo
echo "build.json, which is how the runbook tells you what is live"
# ---------------------------------------------------------------------
LIVE=$(curl -s "$BASE/build.json" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin); print(d["commit"])
except Exception: print("")' 2>/dev/null)
if [ -n "$LIVE" ]; then ok "the live site reports commit $LIVE"
else fail "build.json" "the live site cannot say which commit it is, so a rollback cannot be verified"; fi

# ---------------------------------------------------------------------
echo
echo "The switches, as the runbook describes them"
# ---------------------------------------------------------------------
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  fail "SUPABASE_DB_URL" "not set, so the flag table cannot be checked"
else
  # The runbook has a table of switches and their states. A runbook that says a switch is
  # off while it is on is how somebody makes a decision on a wrong picture.
  while IFS='|' read -r key enabled; do
    key=$(echo "$key" | tr -d ' '); enabled=$(echo "$enabled" | tr -d ' ')
    claimed=$(grep -oE "\`$key\`[^|]*\| *(on|off)" "$RUNBOOK" | grep -oE '(on|off)$' | head -1)
    if [ -z "$claimed" ]; then
      # Not every flag needs a row, but the master switches do.
      case "$key" in
        AI_GENERATION_ENABLED|BATTERY_SCORE_ENABLED|WEARABLES_ENABLED)
          fail "$key" "is not described in the runbook's switch table" ;;
        *) : ;;
      esac
      continue
    fi
    # (boolean)::text YIELDS "true", NOT "t". An uncast boolean column prints "t", and
    # comparing the cast form against "t" makes every flag read as off. This is the THIRD
    # time that exact mistake has landed in this repository: it inverted check_rls.py so it
    # reported all 53 tables unprotected, it made the approvals PDF announce that five
    # matching hashes did not match, and now it made the runbook rehearsal insist the kill
    # switch was off while it was on. So this accepts every shape psql returns rather than
    # picking one and being right by luck.
    case "$enabled" in
      t|true|TRUE|yes|on|1) actual=on ;;
      *)                    actual=off ;;
    esac
    if [ "$claimed" = "$actual" ]; then ok "$key is $actual, which is what the runbook says"
    else fail "$key" "the runbook says $claimed and it is $actual"; fi
  done < <(psql "$SUPABASE_DB_URL" -At -F'|' -c \
      "select key, enabled::text from feature_flags where key in ('AI_GENERATION_ENABLED','BATTERY_SCORE_ENABLED','WEARABLES_ENABLED') order by key")
fi

# ---------------------------------------------------------------------
echo
echo "The claims the runbook makes about behaviour"
# ---------------------------------------------------------------------
# "Turning AI generation off does NOT break the product" is a promise. It is proved by
# prove_failure_modes.mjs, so the runbook is only allowed to say it if that passes.
if [ -n "${SUPABASE_DB_URL:-}" ] && [ -n "${WEBHOOK_SECRET:-}" ]; then
  if out=$(node scripts/prove_failure_modes.mjs 2>&1); then
    ok "the runbook's promise that the kill switch does not break the product holds"
  elif echo "$out" | grep -q REFUSING; then
    ok "failure modes skipped: real participants exist, which is the correct refusal"
  else
    fail "the kill switch promise" "prove_failure_modes.mjs does not pass, so the runbook is wrong"
  fi
fi

echo
if [ "$FAILED" -gt 0 ]; then
  echo "OPERATIONAL REHEARSAL FAILED: $FAILED step(s) in the runbook do not hold"
  exit 1
fi
echo "operational rehearsal ok: every script, screen, endpoint and switch the runbook names is real and in the state it claims"
