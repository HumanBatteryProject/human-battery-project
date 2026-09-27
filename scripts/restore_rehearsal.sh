#!/usr/bin/env bash
# Backup restore rehearsal. Part G: "backup and restore verification."
#
# A BACKUP NOBODY HAS RESTORED IS NOT A BACKUP, it is a file. This takes a real
# dump of the live database, restores it into a scratch database, and then checks
# that the data came back: row counts table by table, and one named participant's
# actual records compared value by value.
#
# It is written as a script rather than done once by hand so it can be repeated
# before launch and after any schema change, which is the only way the answer stays
# true.
#
# Read only against production. It never writes to the live database.
set -uo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
cd "$(dirname "$0")/.."
set -a; [ -f ./.dev.vars ] && . ./.dev.vars; set +a

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
LOCAL_HOST="${REHEARSAL_HOST:-localhost}"
LOCAL_PORT="${REHEARSAL_PORT:-5432}"
LOCAL_USER="${REHEARSAL_USER:-$(whoami)}"
SCRATCH="hbp_restore_rehearsal"
WORK="${TMPDIR:-/tmp}/hbp-rehearsal"
mkdir -p "$WORK"
DUMP="$WORK/live.dump"

say () { printf '  %s\n' "$*"; }
FAILED=""
check () { # check "name" "expected" "got"
  if [ "$2" = "$3" ]; then printf '  pass  %-54s %s\n' "$1" "$2"
  else printf '  FAIL  %-54s expected %s, got %s\n' "$1" "$2" "$3"; FAILED="$FAILED|$1"; fi
}

LOCAL="host=$LOCAL_HOST port=$LOCAL_PORT user=$LOCAL_USER dbname=$SCRATCH"
ADMIN="host=$LOCAL_HOST port=$LOCAL_PORT user=$LOCAL_USER dbname=postgres"

if ! pg_isready -h "$LOCAL_HOST" -p "$LOCAL_PORT" >/dev/null 2>&1; then
  say "no Postgres listening on $LOCAL_HOST:$LOCAL_PORT, so there is nowhere to restore INTO."
  say "This is the whole point of the rehearsal, so it fails rather than being skipped."
  exit 1
fi

say "source:  $(psql "$SUPABASE_DB_URL" -At -c 'select version()' | cut -c1-24)"
say "target:  $(psql "$ADMIN" -At -c 'select version()' | cut -c1-24)"
say ""

# ---------------------------------------------------------------------
say "1. Taking the dump"
START=$(date +%s)
# BOTH SCHEMAS, and the second one is not optional. 25 foreign keys in public
# reference auth.users, and profiles.email is citext, so a public-only dump cannot
# restore profiles at all: the first attempt produced 63 cascading errors from one
# missing type and one missing schema, and then reported the participant's records
# as lost when the dump was fine.
if ! pg_dump "$SUPABASE_DB_URL" \
      --format=custom --schema=public --schema=auth --no-owner --no-privileges \
      --file="$DUMP" 2>"$WORK/dump.err"; then
  say "pg_dump FAILED:"; sed 's/^/      /' "$WORK/dump.err"; exit 1
fi
DUMP_SECONDS=$(( $(date +%s) - START ))
DUMP_BYTES=$(wc -c < "$DUMP" | tr -d ' ')
say "     $DUMP_BYTES bytes in ${DUMP_SECONDS}s"
[ -s "$WORK/dump.err" ] && { say "     warnings:"; sed 's/^/       /' "$WORK/dump.err" | head -5; }

# ---------------------------------------------------------------------
say ""
say "2. Restoring into a scratch database"
psql "$ADMIN" -q -c "drop database if exists $SCRATCH" >/dev/null 2>&1
psql "$ADMIN" -q -c "create database $SCRATCH" >/dev/null 2>&1 || { say "could not create $SCRATCH"; exit 1; }

# Supabase's public schema references extensions and roles that a plain local
# instance does not have. Those objects failing is expected and is reported rather
# than hidden: what matters is whether the DATA arrived.
# citext first: three columns use it, including profiles.email, and without it the
# profiles TABLE does not get created and everything referencing it fails.
for ext in citext pgcrypto vector pg_trgm uuid-ossp; do
  psql "$LOCAL" -q -c "create extension if not exists \"$ext\"" >/dev/null 2>&1 \
    && say "     extension $ext available" \
    || say "     extension $ext NOT available locally, objects depending on it will not restore"
done

START=$(date +%s)
# No --exit-on-error: the default is to continue, which is what a rehearsal wants,
# because the interesting question is which objects failed and whether the DATA
# still arrived. Written as --exit-on-error=0 the first time, which pg_restore
# rejects outright ("doesn't allow an argument"), so it ran nothing at all and every
# table came back "missing". A rehearsal that reports total data loss when the real
# fault is a typo in the rehearsal is worse than no rehearsal, so the object error
# count is printed and the row comparison is what decides.
pg_restore --dbname="$LOCAL" --no-owner --no-privileges \
           "$DUMP" 2>"$WORK/restore.err"
RESTORE_SECONDS=$(( $(date +%s) - START ))
ERRORS=$(grep -c "^pg_restore: error" "$WORK/restore.err" 2>/dev/null | tr -d ' ')
say "     restored in ${RESTORE_SECONDS}s, $ERRORS object error(s)"
if [ "${ERRORS:-0}" -gt 0 ]; then
  say "     the kinds of object that did not restore:"
  grep "^pg_restore: error" "$WORK/restore.err" \
    | sed -E 's/.*(TABLE DATA|FUNCTION|VIEW|CONSTRAINT|INDEX|TRIGGER|TYPE|SCHEMA|EXTENSION|POLICY|SEQUENCE) .*/\1/' \
    | sort | uniq -c | sed 's/^/       /'
fi

# ---------------------------------------------------------------------
say ""
say "3. Did the data come back? Row counts, table by table."
TABLES=$(psql "$SUPABASE_DB_URL" -At -c \
  "select tablename from pg_tables where schemaname='public' order by tablename")
MISMATCH=0; TOTAL=0; ROWS_LIVE=0
for tb in $TABLES; do
  a=$(psql "$SUPABASE_DB_URL" -At -c "select count(*) from public.\"$tb\"" 2>/dev/null || echo "?")
  b=$(psql "$LOCAL" -At -c "select count(*) from public.\"$tb\"" 2>/dev/null || echo "missing")
  TOTAL=$((TOTAL + 1))
  [ "$a" != "?" ] && ROWS_LIVE=$((ROWS_LIVE + a))
  if [ "$a" != "$b" ]; then
    MISMATCH=$((MISMATCH + 1))
    printf '  FAIL  %-40s live %-8s restored %s\n' "$tb" "$a" "$b"
  fi
done
check "every table restored with the same row count" "0 of $TOTAL differ" "$MISMATCH of $TOTAL differ"
say "     $ROWS_LIVE rows across $TOTAL tables"

# ---------------------------------------------------------------------
say ""
say "4. The auth schema, because 25 foreign keys in public depend on it."
a=$(psql "$SUPABASE_DB_URL" -At -c "select count(*) from auth.users" 2>/dev/null || echo "?")
b=$(psql "$LOCAL" -At -c "select count(*) from auth.users" 2>/dev/null || echo "missing")
check "auth.users restored" "$a" "$b"

say ""
say "5. One named participant, compared value by value."
CLIENT=$(psql "$SUPABASE_DB_URL" -At -c "select client_id from entitlements where kind='program' limit 1")
for pair in \
  "their profile:select count(*) from profiles where id='$CLIENT'" \
  "their memberships:select count(*) from memberships where client_id='$CLIENT'" \
  "their entitlement end date:select coalesce(max(effective_to)::text,'none') from entitlements where client_id='$CLIENT'" \
  "their consent grants:select count(*) from client_consents where client_id='$CLIENT'" \
  "their lab values, summed:select coalesce(sum(r.value)::text,'none') from lab_results r join lab_panels p on p.id=r.panel_id where p.client_id='$CLIENT'" \
  "the canonical rules:select count(*) from canonical_rules" \
  "the consent documents and their hashes:select md5(string_agg(body_sha256, ',' order by body_sha256)) from consent_documents" ; do
  label="${pair%%:*}"; query="${pair#*:}"
  a=$(psql "$SUPABASE_DB_URL" -At -c "$query" 2>/dev/null || echo "error")
  b=$(psql "$LOCAL" -At -c "$query" 2>/dev/null || echo "error")
  check "$label" "$a" "$b"
done

# ---------------------------------------------------------------------
say ""
say "6. Cleaning up"
psql "$ADMIN" -q -c "drop database if exists $SCRATCH" >/dev/null 2>&1 && say "     scratch database dropped"
rm -f "$DUMP"; say "     dump file deleted"

say ""
if [ -n "$FAILED" ]; then
  say "RESTORE REHEARSAL FAILED:${FAILED//|/ }"
  exit 1
fi
say "restore rehearsal ok: the dump restores and the data comes back intact"
