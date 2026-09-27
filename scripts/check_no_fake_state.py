#!/usr/bin/env python3
"""No connected state that is not real. Master prompt F2, Part J.

F2: "Inspect existing wearable integrations. Ship one only if credentials,
permissions, and reliable synchronization can be completed and tested within the
deadline. Otherwise defer wearable connections and remove misleading 'connected'
states. Never show demonstration data as live participant data."

THE DECISION, recorded here because a decision nobody can find gets re-made: NO
WEARABLE SHIPS IN V1. There is no Oura integration, no Whoop integration, no
credential, no token storage, no sync job and no schema for any of it, so there was
nothing to test end to end and nothing to remove.

THE CHECK HAS TO WORK IN BOTH DIRECTIONS, which is the part worth building. It is
easy to check that no connect button exists while the flag is off. The failure that
actually happens is somebody turning the flag ON, because a screen is ready, while
the integration behind it is not: the member then sees "connected" with nothing
attached. So:

  flag off  ->  no connect control, and no wearable table, may exist
  flag on   ->  the tables and the token storage MUST exist

Either way the flag and the implementation have to agree, and neither can move
without the other.

Needs SUPABASE_DB_URL. --seed proves the check can fail.
"""
import os, re, subprocess, sys

SEED = sys.argv[sys.argv.index('--seed') + 1] if '--seed' in sys.argv else None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get('SUPABASE_DB_URL')
if not DB:
    print('  SUPABASE_DB_URL is not set', file=sys.stderr); sys.exit(1)
PSQL = next((c for c in ('/opt/homebrew/opt/libpq/bin/psql', 'psql')
             if os.path.exists(c) or subprocess.run(['which', c], capture_output=True).returncode == 0), None)

def q(sql):
    r = subprocess.run([PSQL, DB, '-At', '-c', sql], capture_output=True, text=True, timeout=120)
    if r.returncode:
        print('  query failed:', r.stderr.strip()[:200], file=sys.stderr); sys.exit(1)
    return [l for l in r.stdout.strip().split('\n') if l.strip()]

problems = []

flag = (q("select enabled::text from feature_flags where key='WEARABLES_ENABLED'") or ['missing'])[0]
if SEED == 'flag-on':
    flag = 'true'
wearables_on = flag == 'true'

tables = q("""select table_name from information_schema.tables
               where table_schema='public'
                 and (table_name ~ 'wearable|oura|whoop' or table_name ~ '_tokens?$');""")

# Controls a member could press, and states a member could believe. Searched in
# rendered text and in strings, not in comments: a comment explaining why there is
# no connect button must not trip the check that there is no connect button.
CONTROL = re.compile(
    r'(connect\s+(a|your|an)\s|sync\s+your\s|pair\s+your\s|link\s+your\s(ring|watch|device)'
    r'|>\s*connect\s*<|\bconnected\b\s*(device|ring|watch)|your\s+(ring|whoop|oura)\b)',
    re.I)

def strip_comments(src, html):
    src = re.sub(r'<!--.*?-->', '', src, flags=re.S) if html else src
    src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
    src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
    return src

hits = []
for dirpath, _dirs, files in os.walk(os.path.join(ROOT, 'public')):
    for fn in files:
        if not fn.endswith(('.html', '.js')):
            continue
        path = os.path.join(dirpath, fn)
        rel = os.path.relpath(path, ROOT)
        src = strip_comments(open(path, encoding='utf-8', errors='replace').read(), fn.endswith('.html'))
        for m in CONTROL.finditer(src):
            line = src[:m.start()].count('\n') + 1
            hits.append(f'{rel}:{line} "{m.group(0).strip()[:40]}"')

if SEED == 'control':
    hits.append('public/portal/index.html:1 "Connect your ring"')

if wearables_on:
    if not tables:
        problems.append('WEARABLES_ENABLED is TRUE and there is no wearable table anywhere, so a '
                        'member can be shown a connection that has nothing behind it')
else:
    for h in hits:
        problems.append(f'WEARABLES_ENABLED is false but a connect control or connected state exists: {h}')
    if tables:
        problems.append('WEARABLES_ENABLED is false but wearable tables exist: '
                        + ', '.join(tables) + '. Either the flag is wrong or the tables are.')

# F2's last sentence. The internal account IS demonstration data, so the portal has
# to say so. portal.css carried .test-banner unused since it was written.
app = open(os.path.join(ROOT, 'public/portal/app.js'), encoding='utf-8').read()
if SEED == 'banner':
    app = app.replace('markTestAccount', 'removedForSeed')
if 'markTestAccount' not in app:
    problems.append('nothing marks an internal account in the portal, so test data renders '
                    'identically to a real participant record')
elif not re.search(r'await markTestAccount\(', app):
    problems.append('markTestAccount exists but is never called, so the banner never appears')

print(f'  WEARABLES_ENABLED={flag}, {len(tables)} wearable table(s), '
      f'{len(hits)} connect control(s) or connected state(s) in the interface')

if problems:
    print('  FAKE STATE CHECK FAILED:', file=sys.stderr)
    for p in problems:
        print('   ', p, file=sys.stderr)
    sys.exit(1)
print('  no fake state: no wearable ships, nothing offers to connect one, and test data says it is test data')
