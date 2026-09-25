#!/usr/bin/env python3
"""Every column name the code asks for must exist in the live schema.

Written after trend.js was found asking for intake_responses.answer, a column
that has never existed. PostgREST answered 42703, the endpoint threw, and
because nothing ever called trend the failure sat undiscovered. Every fixture
passed throughout: they test pure modules, and a column name is not a pure
module. The same mistake was made twice more the same day, once in a query I
wrote by hand.

This reads the column list a query names and checks it against the database.
It cannot catch everything (a dynamic column name is invisible to it) and it
says so rather than implying full coverage.

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY. Runs in deploy.
  --seed  injects a column that does not exist, to prove the check can fail.
"""
import json, os, re, sys, urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = '--seed' in sys.argv

url, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_KEY')
if not url or not key:
    print('  SUPABASE_URL or SUPABASE_SERVICE_KEY not set', file=sys.stderr)
    sys.exit(1)

def api(path):
    req = urllib.request.Request(f'{url}/rest/v1/{path}',
                                headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

# The live schema, straight from PostgREST's own description of itself.
req = urllib.request.Request(url + '/rest/v1/',
                             headers={'apikey': key, 'Authorization': f'Bearer {key}',
                                      'Accept': 'application/openapi+json'})
with urllib.request.urlopen(req, timeout=30) as r:
    spec = json.load(r)
SCHEMA = {name: set(d.get('properties', {}).keys())
          for name, d in (spec.get('definitions') or {}).items()}
if not SCHEMA:
    print('  could not read the schema from PostgREST', file=sys.stderr)
    sys.exit(1)

# sb.select('table', { ... columns: 'a,b,c' ... })  and  .select('a,b,c') after
# .from('table'). Both forms appear in this codebase.
SEL = re.compile(r"""\.select\(\s*['"]([a-z_]+)['"]\s*,\s*\{(.*?)\}\s*\)""", re.S)
COLS = re.compile(r"""columns:\s*['"]([^'"]+)['"]""")
FROM = re.compile(r"""\.from\(\s*['"]([a-z_]+)['"]\s*\)\s*(?:\n\s*)?\.select\(\s*['"]([^'"]+)['"]""", re.S)

def split_cols(raw):
    """Plain column names only.

    An embedded resource, lab_panels(drawn_on), is a join and not a column of
    this table, so the whole segment is skipped. The first version stripped the
    parentheses instead, which glued the two together into the non-existent
    column "lab_panelsdrawn_on" and reported a real query as broken. A check
    that cries wolf gets switched off, so this matters as much as the misses.
    """
    out, depth, cur = [], 0, ''
    for ch in raw:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            out.append(cur); cur = ''
        else:
            cur += ch
    out.append(cur)
    names = []
    for c in out:
        c = c.strip()
        if not c or c == '*' or '(' in c:      # embedded resource, not a column
            continue
        c = c.split('!')[0].strip()            # profiles!fkey -> profiles
        c = c.split(':')[-1].strip()           # alias:col -> col
        if re.fullmatch(r'[a-z_][a-z0-9_]*', c):
            names.append(c)
    return names

problems, checked = [], 0
targets = []
for dirpath, _dirs, files in os.walk(root):
    if any(p in dirpath for p in ('node_modules', '.git', '.wrangler')):
        continue
    for f in files:
        if f.endswith(('.js', '.html')):
            targets.append(os.path.join(dirpath, f))

for path in targets:
    src = open(path, encoding='utf-8', errors='ignore').read()
    rel = os.path.relpath(path, root)
    found = []
    for m in SEL.finditer(src):
        table, opts = m.group(1), m.group(2)
        cm = COLS.search(opts)
        if cm:
            found.append((table, cm.group(1)))
    for m in FROM.finditer(src):
        found.append((m.group(1), m.group(2)))
    if SEED and rel.endswith('functions/api/trend.js'):
        found.append(('intake_responses', 'answer'))
    for table, raw in found:
        if table not in SCHEMA:
            problems.append(f'{rel}: no table named {table}')
            continue
        for col in split_cols(raw):
            checked += 1
            # An embedded resource is a table name, not a column.
            if col in SCHEMA[table] or col in SCHEMA:
                continue
            problems.append(f'{rel}: {table} has no column "{col}"')

if problems:
    print('  COLUMN CHECK FAILED:', file=sys.stderr)
    for p in sorted(set(problems)):
        print('   ', p, file=sys.stderr)
    sys.exit(1)

print(f'  columns ok: {checked} column references across {len(SCHEMA)} tables all exist '
      f'(dynamic column names are not visible to this check)')
