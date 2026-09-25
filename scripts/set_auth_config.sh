#!/bin/sh
# Record the Supabase Auth redirect configuration through the management API,
# so it is set deliberately and can be read back rather than clicked in a
# dashboard and forgotten.
#
#   SUPABASE_ACCESS_TOKEN=sbp_... sh scripts/set_auth_config.sh
#
# The token is a PERSONAL ACCESS TOKEN from Supabase, Account, Access Tokens.
# It is not the service key and not the publishable key, and it must not go in
# .dev.vars, which is for runtime secrets the app reads.

set -e
REF=tjfpzdpfrztqksixcjfz
SITE=https://thehumanbatteryproject.com

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "SUPABASE_ACCESS_TOKEN is not set. Nothing was changed." >&2
  exit 1
fi

echo "BEFORE:"
curl -s "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  site_url =',d.get('site_url'));print('  uri_allow_list =',d.get('uri_allow_list'))"

curl -s -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"site_url\": \"$SITE\",
    \"uri_allow_list\": \"$SITE/portal/,$SITE/portal/**,$SITE/portal/confirm,$SITE/portal/confirm**\",
    \"mailer_otp_exp\": 3600
  }" > /dev/null

# The magic-link template must carry {{ .TokenHash }} and point at our own
# confirm page. The DEFAULT template links to /auth/v1/verify, which a mail
# scanner can fetch and thereby spend the token before the person clicks. Only
# the TokenHash shape survives a prefetch, because the exchange then happens in
# our page on a click rather than in the link itself.
curl -s -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mailer_subjects_magic_link": "Your sign-in link",
    "mailer_templates_magic_link_content": "<h2>Sign in to The Human Battery Project</h2><p>Press the button below. The link works once and expires in an hour.</p><p><a href=\"https://thehumanbatteryproject.com/portal/confirm?token_hash={{ .TokenHash }}&type=magiclink\">Sign in</a></p><p>If you did not ask for this, ignore it.</p>"
  }' > /dev/null

echo "AFTER:"
curl -s "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('  site_url =',d.get('site_url'));print('  uri_allow_list =',d.get('uri_allow_list'));print('  mailer_otp_exp =',d.get('mailer_otp_exp'))"
