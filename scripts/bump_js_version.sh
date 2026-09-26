#!/bin/sh
# Re-stamp the portal's JavaScript imports with app.js's content hash.
#
# The CSS has had a version query for months. app.js did not, and it is the file
# that decides whether a member can reach the portal at all: a fix to the consent
# gate could sit behind a four hour cache while the member saw a spinner.
#
# Hashed rather than counted, so it cannot be forgotten. The version changes if
# and only if app.js changes. Run this after editing app.js; deploy.sh calls it.
set -e
cd "$(dirname "$0")/.."
H=$(shasum -a 256 public/portal/app.js | cut -c1-8)
for f in public/portal/*.html public/portal/admin/*.html; do
  [ -f "$f" ] || continue
  perl -pi -e "s{from '(\.\./|\./)?app\.js(\?v=[0-9a-f]+)?'}{from '\${1}app.js?v=$H'}g" "$f"
done
echo "  app.js version stamped: $H"
