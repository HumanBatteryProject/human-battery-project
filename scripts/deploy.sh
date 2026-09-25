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

echo "suites:"
for c in check_prohibitions check_deliverables check_css check_claims check_palette; do
  if python3 "scripts/$c.py" >/dev/null 2>&1; then printf '  %-22s ok\n' "$c"
  else printf '  %-22s FAILED\n' "$c"; exit 1; fi
done

# These two need live credentials, so they belong here rather than in the commit
# hook. check_rls is the one that stops the anon hole coming back: instance fixes
# without a mechanism check is how it survived in the first place.
set -a; [ -f ./.dev.vars ] && . ./.dev.vars; set +a
for c in check_rls check_columns check_price_drift; do
  out=$(python3 "scripts/$c.py" 2>&1)
  if [ $? -eq 0 ]; then printf '  %-22s ok\n' "$c"
  else printf '  %-22s FAILED\n' "$c"; echo "$out" | sed 's/^/      /'; exit 1; fi
done

echo "deploying:"
npx wrangler pages deploy public --project-name=human-battery-project --branch=main 2>&1 | tail -2
