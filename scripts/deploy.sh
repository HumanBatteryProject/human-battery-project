#!/bin/sh
# The deploy step. One command, so a deploy cannot skip a thing by being done
# from memory.
#
#   sh scripts/deploy.sh
#
# WHY THE CORPUS LOAD IS IN HERE.
# The corpus is built from corpus/ and from the deliverable sources. Before
# this, a manuscript revision left the corpus stale and nothing said so: the
# coach kept citing passages that no longer matched the book, and the only
# symptom was an answer that was subtly out of date. Now any change under those
# paths reloads the corpus as part of deploying, keyed on a content hash so an
# unchanged tree costs nothing.

set -e
cd "$(git rev-parse --show-toplevel)"

STAMP=.corpus-hash
WATCH="corpus program-docs/build.py program-docs/diet_doc.py program-docs/tests_doc.py \
       program-docs/first_steps_doc.py program-docs/tier_doc.py program-docs/kitchen_doc.py \
       program-docs/kitchen_data.json docs/HBP-Protocol-Complete.md"

hash_now () {
  # shellcheck disable=SC2086
  find $WATCH -type f \( -name '*.md' -o -name '*.py' -o -name '*.json' \) 2>/dev/null \
    | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -d' ' -f1
}

NOW=$(hash_now)
WAS=$(cat "$STAMP" 2>/dev/null || echo none)

echo "corpus sources hash: $NOW"
if [ "$NOW" != "$WAS" ]; then
  echo "  changed since $WAS, reloading the corpus"
  # The corpus load MUST be able to stop a deploy. The first version piped it
  # through tail, which discards the exit status, so a failed load printed
  # LOAD FAILED and the deploy carried on and shipped against a stale corpus.
  if ! python3 scripts/load_corpus.py --no-embed > /tmp/hbp_corpus.log 2>&1; then
    echo "  CORPUS LOAD FAILED. Nothing deployed."
    tail -6 /tmp/hbp_corpus.log | sed 's/^/    /'
    exit 1
  fi
  tail -3 /tmp/hbp_corpus.log | sed 's/^/    /'
  # fill in vectors if the key exists; a missing key is not a deploy failure
  python3 scripts/load_corpus.py --reembed 2>/dev/null | tail -1 | sed 's/^/    /' || true
  printf '%s' "$NOW" > "$STAMP"
else
  echo "  unchanged, corpus load skipped"
fi

# Stamp the portal JavaScript before the suites, so the committed tree and the
# deployed tree carry the same version.
sh scripts/bump_js_version.sh

echo "suites:"
for c in check_prohibitions check_deliverables check_css check_claims check_palette; do
  if python3 "scripts/$c.py" >/dev/null 2>&1; then printf '  %-22s ok\n' "$c"
  else printf '  %-22s FAILED\n' "$c"; exit 1; fi
done

# These two need live credentials, so they belong here rather than in the commit
# hook. check_rls is the one that stops the anon hole coming back: instance fixes
# without a mechanism check is how it survived in the first place.
set -a; [ -f ./.dev.vars ] && . ./.dev.vars; set +a
for c in check_rls check_columns check_canon check_price_drift check_export check_no_fake_state; do
  # `if out=$(...)` rather than an assignment followed by a test. With set -e a
  # bare assignment from a failing command kills the script at that line, so the
  # FAILED branch never printed and the deploy died with no message at all. The
  # assignment has to be INSIDE the if for its status to be handled.
  if out=$(python3 "scripts/$c.py" 2>&1); then printf '  %-22s ok\n' "$c"
  else printf '  %-22s FAILED\n' "$c"; echo "$out" | sed 's/^/      /'; exit 1; fi
done

# Cross-user isolation, run against the live database on every deploy. Two
# ordinary participants are created, each reaches for the other's records across
# every table carrying a client_id, and both are deleted afterwards. It belongs in
# the deploy rather than the commit hook because it needs real sessions, and it
# belongs on EVERY deploy because "one user cannot access another user's records"
# is the acceptance line that a single new policy can quietly break.
#
# Without --show-it-fails it never disables row level security, so it is safe to
# run against production.
if [ -n "$SUPABASE_DB_URL" ]; then
  ANON=$(grep -o "sb_publishable_[A-Za-z0-9_-]*" public/portal/config.js | head -1)
  if out=$(SUPABASE_ANON_KEY="$ANON" node scripts/prove_isolation.mjs 2>&1); then
    printf '  %-22s ok      %s\n' "cross-user isolation" "$(echo "$out" | tail -1)"
  else
    printf '  %-22s FAILED\n' "cross-user isolation"
    echo "$out" | sed 's/^/      /'
    exit 1
  fi
fi

echo "deploying:"
npx wrangler pages deploy public --project-name=human-battery-project --branch=main 2>&1 | tail -2

# Failure modes, end to end against what just went live. It switches AI generation
# off and back on, so it refuses to run once any real participant exists: see the
# guard in the script. That guard expires when the pilot starts, and this becomes a
# staging exercise at that point.
if [ -n "$SUPABASE_DB_URL" ]; then
  echo "failure modes:"
  if out=$(node scripts/prove_failure_modes.mjs 2>&1); then
    echo "$out" | tail -1 | sed 's/^/  /'
  elif echo "$out" | grep -q "REFUSING"; then
    echo "$out" | grep REFUSING | sed 's/^/  /'
    echo "  skipped, which is correct once real people are in the system"
  else
    echo "$out" | sed 's/^/  /'
    echo "  THE DEPLOY IS LIVE AND A FAILURE MODE DID NOT DEGRADE SAFELY."
    exit 1
  fi
fi

# Accessibility at phone width, AFTER the deploy, because it measures the live pages
# at a true 390px viewport rather than reading the source. It cannot un-deploy what
# just went out, and it is not meant to: it reports, loudly, and a failure is a thing
# to fix forward. Run it alone with:
#   node scripts/a11y.mjs
if [ -n "$SUPABASE_DB_URL" ]; then
  echo "accessibility at 390px:"
  sleep 6
  if out=$(node scripts/a11y.mjs 2>&1); then
    echo "$out" | tail -1 | sed 's/^/  /'
  else
    echo "$out" | sed 's/^/  /'
    echo "  THE DEPLOY IS LIVE AND THE ACCESSIBILITY CHECK FAILED. Fix forward."
    exit 1
  fi
fi
