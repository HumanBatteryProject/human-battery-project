#!/usr/bin/env bash
# Bump a stylesheet's cache-busting version to one above the highest value
# ever used in this repository's history.
#
# Why this is a script and not a sed one-liner. public/_headers lets a
# stylesheet be cached while HTML is served fresh, so a CSS change that does
# not change the ?v= number reaches nobody who has visited before. Twice now
# a hand-written sed has gone WRONG in the other direction: once setting the
# number lower than it already was, and once setting it to a value it already
# had. Reusing an old number is worse than not bumping, because a visitor who
# cached that exact number gets the old stylesheet served against new markup.
#
#   ./scripts/bump_css_version.sh styles       # public/styles.css
#   ./scripts/bump_css_version.sh portal       # public/portal/portal.css
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${1:?usage: bump_css_version.sh <styles|portal>}"

# The highest value this filename has ever carried, across every commit, not
# just the working tree. That is the only number that makes reuse impossible.
HIGH=$(
  {
    grep -rhoE "${NAME}\.css\?v=[0-9]+" public/ 2>/dev/null || true
    for c in $(git log --format=%H); do
      git grep -hoE "${NAME}\.css\?v=[0-9]+" "$c" -- public/ 2>/dev/null || true
    done
  } | grep -oE '[0-9]+$' | sort -n | tail -1
)
HIGH="${HIGH:-0}"
NEXT=$((HIGH + 1))

FILES=$(grep -rl "${NAME}\.css?v=" public/ || true)
if [ -z "$FILES" ]; then
  echo "no page references ${NAME}.css?v=, nothing to do" >&2
  exit 1
fi

echo "$FILES" | while read -r f; do
  perl -pi -e "s/\Q${NAME}.css?v=\E[0-9]+/${NAME}.css?v=${NEXT}/g" "$f"
  echo "  $f"
done
echo "${NAME}.css: highest ever used was v=${HIGH}, now v=${NEXT}"
