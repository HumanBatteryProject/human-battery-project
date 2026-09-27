#!/usr/bin/env python3
"""Every participant table is exported, or excluded with a reason. Part J.

WHY. The export button said "Download everything" and read 12 tables out of 39 that
hold a participant's records. The missing 27 included their dimension scores, their
briefs, their plans, their weekly reviews, their measurements, their intake answers,
their memberships, their entitlements and their payments. Nothing failed. The file
downloaded, looked substantial, and was a quarter of their record.

That is drift, and drift is what a check is for: a table added by a migration joins
the database and does not join the export, and no test notices because the export
has no idea what it is missing.

THE RULE. For every base table in public that holds participant data, either it is
in DIRECT, or in INDIRECT, or in EXCLUDED with a stated reason. Participant data
means it has a client_id, or a foreign key into something that does.

Needs SUPABASE_DB_URL. --seed proves the check can fail.
"""
import os, re, subprocess, sys

SEED = '--seed' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get('SUPABASE_DB_URL')
if not DB:
    print('  SUPABASE_DB_URL is not set', file=sys.stderr)
    sys.exit(1)

PSQL = next((c for c in ('/opt/homebrew/opt/libpq/bin/psql', 'psql')
             if os.path.exists(c) or subprocess.run(['which', c], capture_output=True).returncode == 0), None)
if not PSQL:
    print('  psql not found', file=sys.stderr)
    sys.exit(1)

def q(sql):
    r = subprocess.run([PSQL, DB, '-At', '-c', sql], capture_output=True, text=True, timeout=120)
    if r.returncode:
        print('  query failed:', r.stderr.strip()[:200], file=sys.stderr)
        sys.exit(1)
    return [l for l in r.stdout.strip().split('\n') if l.strip()]

src = open(os.path.join(ROOT, 'functions/api/_export.js'), encoding='utf-8').read()

def block(name):
    """The text between `export const NAME = ` and the matching close."""
    m = re.search(r'export const ' + name + r'\s*=\s*([\[{])', src)
    if not m:
        return ''
    open_ch = m.group(1)
    close_ch = ']' if open_ch == '[' else '}'
    depth, i = 0, m.end() - 1
    while i < len(src):
        if src[i] == open_ch:
            depth += 1
        elif src[i] == close_ch:
            depth -= 1
            if depth == 0:
                return src[m.end():i]
        i += 1
    return ''

# DIRECT is an array of quoted names. INDIRECT and EXCLUDED are objects whose KEYS
# are the table names and are NOT quoted, so reading quoted strings out of them
# returns the values instead: the first version reported lab_panels, daily_logs,
# panel_id and daily_log_id as table names, then complained that panel_id did not
# exist. Keys and values are different things and the parser has to know which it
# wants.
def array_names(name):
    return set(re.findall(r"'([a-z_]+)'", block(name)))

def object_keys(name):
    return set(re.findall(r'^\s*([a-z_]+)\s*:', block(name), re.M))

direct = array_names('DIRECT')
indirect = object_keys('INDIRECT')
excluded = object_keys('EXCLUDED')
covered = direct | indirect | excluded

# Every base table carrying participant data, asked of the database.
scoped = set(q("""
  select c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
   where c.relkind='r'
     and (
       exists (select 1 from information_schema.columns col
                where col.table_schema='public' and col.table_name=c.relname
                  and col.column_name='client_id')
       or exists (
         select 1 from pg_constraint fk
         join pg_class parent on parent.oid = fk.confrelid
         where fk.conrelid = c.oid and fk.contype='f'
           and exists (select 1 from information_schema.columns col2
                        where col2.table_schema='public' and col2.table_name=parent.relname
                          and col2.column_name='client_id'))
     );"""))

if SEED:
    scoped.add('seeded_new_participant_table')

missing = sorted(scoped - covered)
# A name in the lists that no longer exists is also worth knowing: the export would
# ask for a table that is gone and the request would fail for everybody.
gone = sorted((direct | indirect) - set(q("""
  select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r';""")))

print(f'  {len(scoped)} table(s) hold participant data; '
      f'{len(direct)} exported directly, {len(indirect)} through a parent row, '
      f'{len(excluded)} excluded with a reason')

problems = []
for t in missing:
    problems.append(f'{t} holds participant data and is neither exported nor excluded, '
                    f'so a person asking for everything would not get it')
for t in gone:
    problems.append(f'{t} is named in the export but no longer exists, so the export would fail')

# The pinned publishable key must match the one the browser gets. If they drift,
# the export either stops working or, worse, falls back to a key with no row level
# security.
import re as _re
cfg = open(os.path.join(ROOT, 'public/portal/config.js'), encoding='utf-8').read()
in_config = _re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", cfg)
in_export = _re.search(r"PUBLISHABLE_KEY\s*=\s*'([^']+)'", src)
if not in_export:
    problems.append('_export.js no longer pins PUBLISHABLE_KEY, so the export may fall back to the service key, which has no row level security')
elif in_config and in_config.group(1) != in_export.group(1):
    problems.append('the publishable key in _export.js does not match public/portal/config.js')

# The endpoints named as reachable while suspended have to exist. Two of the seven
# did not: /api/export and /api/data-request were listed in _billing.js as rights a
# suspended person keeps, and neither had a file.
billing = open(os.path.join(ROOT, 'functions/api/_billing.js'), encoding='utf-8').read()
m = _re.search(r'REACHABLE_WHILE_SUSPENDED\s*=\s*\[(.*?)\]', billing, _re.S)
for path in _re.findall(r"'(/api/[a-z-]+)'", m.group(1) if m else ''):
    fn = os.path.join(ROOT, 'functions', path.lstrip('/') + '.js')
    if not os.path.exists(fn):
        problems.append(f'{path} is listed as reachable while suspended but functions{path}.js does not exist')

if problems:
    print('  EXPORT COVERAGE CHECK FAILED:', file=sys.stderr)
    for p in problems:
        print('   ', p, file=sys.stderr)
    print('\n    Add it to DIRECT or INDIRECT in functions/api/_export.js, or to EXCLUDED',
          file=sys.stderr)
    print('    with a reason somebody could disagree with.', file=sys.stderr)
    sys.exit(1)
print('  export ok: every table holding participant data is exported or excluded with a reason')
