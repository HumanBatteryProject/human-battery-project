#!/usr/bin/env bash
# Put an earlier build back on the live site, from a terminal.
#
# WHY THIS SCRIPT EXISTS RATHER THAN A DASHBOARD BUTTON. Cloudflare Pages can roll back
# from its dashboard, and wrangler has no verb for it, so the documented answer is "log
# in and click". That is a rollback the owner can only perform if they can find the
# right screen, and it is one nobody has ever practised. Day 13 asks for a rollback
# PERFORMED AND REVERSED, which means it has to be a command.
#
# It deploys the public/ directory as it existed at a given commit, using git archive so
# the working tree is never touched. Nothing is checked out, nothing is stashed, and an
# interrupted rollback leaves the repository exactly as it was.
#
#   scripts/rollback.sh <git-ref>     put that commit's site live
#   scripts/rollback.sh main          roll forward again
#
# It does NOT roll back the database. Schema and data are a separate decision with a
# separate script, because code and data almost never want to move together: rolling
# code back to before a migration is usually safe, rolling a migration back under live
# code usually is not.
set -uo pipefail
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
cd "$(dirname "$0")/.."

REF="${1:-}"
if [ -z "$REF" ]; then
  echo "usage: scripts/rollback.sh <git-ref>"
  echo
  echo "recent commits:"
  git log --oneline -8 | sed 's/^/  /'
  echo
  echo "currently live:"
  curl -s https://thehumanbatteryproject.com/build.json | sed 's/^/  /'
  exit 1
fi

SHA=$(git rev-parse --short "$REF" 2>/dev/null) || { echo "  not a ref: $REF"; exit 1; }
SUBJECT=$(git log -1 --format=%s "$SHA")
WORK="${TMPDIR:-/tmp}/hbp-rollback-$SHA"
rm -rf "$WORK"; mkdir -p "$WORK"

echo "  rolling the site to $SHA: $SUBJECT"

# BOTH public/ AND functions/, and this was the bug the rehearsal existed to find.
#
# The first version extracted only public/ and ran wrangler from the repository root.
# Wrangler resolves Pages Functions from its working directory, not from the asset
# directory, so it deployed the OLD static site with the CURRENT functions. Every API
# endpoint stayed at HEAD while the pages went back. I only noticed because I checked
# whether the endpoints were still answering, and they were: 200, 403, 403, 405.
#
# That is the worst shape a rollback can have. An operator rolls back to escape a bad
# deploy, is told it is verified, and the half of the system that was actually broken is
# still running. Now both directories come from the ref, and wrangler runs with --cwd
# pointing at the extracted tree so it can only see that commit's functions.
if ! git archive "$SHA" public functions | tar -x -C "$WORK" 2>/dev/null; then
  echo "  could not extract public/ and functions/ at $SHA"; exit 1
fi
[ -d "$WORK/public" ]    || { echo "  $SHA has no public/ directory"; exit 1; }
[ -d "$WORK/functions" ] || { echo "  $SHA has no functions/ directory"; exit 1; }
echo "  extracted $(find "$WORK/functions" -name '*.js' | wc -l | tr -d ' ') function file(s) from $SHA"

# THE FUNCTIONS IMPORT FROM node_modules, so the extracted tree needs dependencies or
# the build fails with "Could not resolve stripe". That is how I learned the first
# rollback had not really used the extracted tree at all: it built fine because wrangler
# was looking at the repository root, which is also why it shipped HEAD's functions.
#
# The dependency VERSIONS belong to the commit being rolled back to, not to HEAD, since
# rolling back past a dependency bump should use the older dependency. So the lockfile is
# compared: identical means the installed tree is already correct and can be linked,
# which is the common case and takes no time. Different means install from that commit's
# lockfile, and say so, because it is slow and the operator should know why.
git show "$SHA:package.json"      > "$WORK/package.json" 2>/dev/null || true
git show "$SHA:package-lock.json" > "$WORK/package-lock.json" 2>/dev/null || true

if [ -f "$WORK/package-lock.json" ] && cmp -s "$WORK/package-lock.json" package-lock.json; then
  ln -s "$(pwd)/node_modules" "$WORK/node_modules"
  echo "  dependencies: unchanged at $SHA, linking the installed tree"
elif [ -f "$WORK/package-lock.json" ]; then
  echo "  dependencies: CHANGED at $SHA, installing that commit's lockfile (this takes a minute)"
  (cd "$WORK" && npm ci --silent --no-audit --no-fund 2>&1 | tail -3 | sed 's/^/    /')
  [ -d "$WORK/node_modules" ] || { echo "  npm ci failed, so this commit cannot be built"; exit 1; }
else
  echo "  $SHA has no package-lock.json, linking the installed tree and hoping"
  ln -s "$(pwd)/node_modules" "$WORK/node_modules"
fi


# The stamp describes the commit being deployed, not the commit checked out, or the
# rollback would claim to be whatever is in the working tree.
cat > "$WORK/public/build.json" <<JSON
{
  "commit": "$SHA",
  "committed_at": "$(git log -1 --format=%cI "$SHA")",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "subject": $(printf '%s' "$SUBJECT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),
  "rolled_back_from": "$(git rev-parse --short HEAD)"
}
JSON

# --cwd is what binds the functions to this commit. Without it wrangler looks beside
# ITSELF, which is the repository, which is HEAD.
npx wrangler pages deploy public \
  --cwd "$WORK" \
  --project-name=human-battery-project --branch=main \
  --commit-hash "$(git rev-parse "$SHA")" \
  --commit-message "rollback to $SHA: $SUBJECT" 2>&1 | tail -2 | sed 's/^/  /'

# THREE CONSECUTIVE AGREEING READS, each with a cache buster.
#
# One read is not proof. Immediately after the first rollback I read the site once, got
# the OLD commit back, and briefly believed the rollback had silently failed. Five
# cache-busted reads a moment later all agreed on the rolled-back commit: the single
# read had been stale. It works the other way too, which is the dangerous direction: one
# lucky read can report success while most of the edge still serves the previous build.
#
# So propagation is only accepted when three reads in a row agree, and a read that
# disagrees resets the count rather than being ignored.
echo "  waiting for the edge to serve it, three agreeing reads required"
AGREE=0
for i in $(seq 1 30); do
  sleep 2
  LIVE=$(curl -s "https://thehumanbatteryproject.com/build.json?cb=$RANDOM$i" | python3 -c 'import json,sys
try: print(json.load(sys.stdin)["commit"])
except Exception: print("")' 2>/dev/null)
  if [ "$LIVE" = "$SHA" ]; then
    AGREE=$((AGREE + 1))
    if [ "$AGREE" -ge 3 ]; then
      echo "  VERIFIED: three consecutive reads report $LIVE after $((i * 2))s"
      rm -rf "$WORK"
      exit 0
    fi
  else
    # A disagreeing read means the edge is still mixed. Start counting again.
    [ "$AGREE" -gt 0 ] && echo "  read $i disagreed (${LIVE:-nothing}), restarting the count"
    AGREE=0
  fi
done

echo "  NOT VERIFIED: the live site still reports '${LIVE:-nothing}', expected $SHA"
echo "  The deploy may still be propagating. Check: curl -s https://thehumanbatteryproject.com/build.json"
rm -rf "$WORK"
exit 1
