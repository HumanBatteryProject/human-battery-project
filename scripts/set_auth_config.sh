#!/bin/sh
# Record the Supabase Auth redirect configuration through the management API,
# so it is set deliberately and can be read back rather than clicked in a
# dashboard and forgotten.
#
#   SUPABASE_ACCESS_TOKEN=sbp_REALTOKEN sh scripts/set_auth_config.sh
#
# The token is a PERSONAL ACCESS TOKEN from Supabase, Account, Access Tokens.
# It is not the service key and not the publishable key, and it must not go in
# .dev.vars, which is for runtime secrets the application reads.
#
# EVERY CALL HERE CHECKS ITS HTTP STATUS. The first version of this script did
# not: it piped the response straight into a JSON parser, so an unauthorized
# reply printed "site_url = None" and read as "the configuration is empty"
# rather than "you are not authenticated". A check that reports the same thing
# for a failed request and an empty answer cannot tell you which happened.

set -e
REF=tjfpzdpfrztqksixcjfz
SITE=https://thehumanbatteryproject.com
API="https://api.supabase.com/v1/projects/$REF/config/auth"

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "SUPABASE_ACCESS_TOKEN is not set. Nothing was changed." >&2
  exit 1
fi
case "$SUPABASE_ACCESS_TOKEN" in
  sbp_xxx|sbp_REPLACE_ME|xxx)
    echo "SUPABASE_ACCESS_TOKEN is still the placeholder from the example." >&2
    echo "Get a real one at Supabase, Account, Access Tokens." >&2
    exit 1 ;;
esac

show () {
  code=$(curl -s -o /tmp/hbp_auth.json -w '%{http_code}' "$API" \
           -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")
  if [ "$code" != "200" ]; then
    echo "  READ FAILED, HTTP $code" >&2
    sed 's/^/  /' /tmp/hbp_auth.json >&2; echo >&2
    echo "  Nothing was changed." >&2
    exit 1
  fi
  python3 - <<'PY'
import json
d=json.load(open('/tmp/hbp_auth.json'))
for k in ('site_url','uri_allow_list','mailer_otp_exp'):
    print('  %-16s %s' % (k, d.get(k)))
print('  %-16s %s' % ('magic_link_tpl',
      ('carries TokenHash' if '{{ .TokenHash }}' in (d.get('mailer_templates_magic_link_content') or '')
       else 'DEFAULT, links to /auth/v1/verify')))
PY
}

patch () {
  code=$(curl -s -o /tmp/hbp_patch.json -w '%{http_code}' -X PATCH "$API" \
           -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
           -H "Content-Type: application/json" -d "$1")
  if [ "$code" != "200" ]; then
    echo "  WRITE FAILED, HTTP $code" >&2
    sed 's/^/  /' /tmp/hbp_patch.json >&2; echo >&2
    exit 1
  fi
}

echo "BEFORE:"
show

patch "{
  \"site_url\": \"$SITE\",
  \"uri_allow_list\": \"$SITE/portal/,$SITE/portal/**,$SITE/portal/confirm,$SITE/portal/confirm**\",
  \"mailer_otp_exp\": 3600
}"

# The magic-link template must carry {{ .TokenHash }} and point at our own
# confirm page. The DEFAULT template links to /auth/v1/verify, which a mail
# scanner can fetch and thereby spend the token before the person clicks. Only
# the TokenHash shape survives a prefetch, because the exchange then happens in
# our page on a click rather than in the link itself.
patch '{
  "mailer_subjects_magic_link": "Your sign-in link",
  "mailer_templates_magic_link_content": "<h2>Sign in to The Human Battery Project</h2><p>Press the button below. The link works once and expires in an hour.</p><p><a href=\"https://thehumanbatteryproject.com/portal/confirm?token_hash={{ .TokenHash }}&type=magiclink\">Sign in</a></p><p>If you did not ask for this, ignore it.</p>"
}'

echo "AFTER:"
show
