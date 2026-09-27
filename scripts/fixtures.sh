#!/bin/sh
# Every fixture file under tests/, in one command.
#
#   sh scripts/fixtures.sh
#
# WHY THIS EXISTS. There were twenty four fixture files and nothing ran them.
# They were run by hand, which means they were run when someone remembered, which
# means a fixture could sit broken for days and the suite would still be
# described as passing. constants_pinned.mjs had been failing on two pinned
# constants and nothing said so.
#
# Fixtures that need live credentials source .dev.vars, the same way deploy.sh
# does. A fixture that cannot reach the database must still pass or fail on its
# own terms rather than erroring, so this reports the exit status and nothing else.

set -e
cd "$(git rev-parse --show-toplevel)"
set -a; [ -f ./.dev.vars ] && . ./.dev.vars; set +a

FAILED=''
COUNT=0
for f in tests/*.mjs; do
  COUNT=$((COUNT + 1))
  printf '  %-34s ' "$(basename "$f")"
  if out=$(node "$f" 2>&1); then
    echo "$out" | tail -1 | sed 's/^ *//'
  else
    echo "FAILED"
    echo "$out" | grep -i 'FAIL' | head -6 | sed 's/^/      /'
    FAILED="$FAILED $(basename "$f")"
  fi
done

if [ -n "$FAILED" ]; then
  echo
  echo "  failing:$FAILED"
  exit 1
fi
echo
echo "  $COUNT fixture file(s), all passing"
