#!/usr/bin/env python3
"""No connected state that is not real. Master prompt F2, Part J.

F2: "Inspect existing wearable integrations. Ship one only if credentials,
permissions, and reliable synchronization can be completed and tested within the
deadline. Otherwise defer wearable connections and remove misleading 'connected'
states. Never show demonstration data as live participant data."

THE DECISION CHANGED ON 27 SEPTEMBER, and this check changed with it. It previously
recorded "no wearable ships in V1" and enforced, in both directions, that a wearable
table must not exist while WEARABLES_ENABLED is false. The owner's wearables brief
now asks for Oura, WHOOP, Polar and Withings built, with Garmin and Google built
behind flags that ship off. So the tables exist on purpose and that rule is wrong.

WHAT REPLACES IT, because "the tables may exist now" on its own would delete the only
thing this check was for. F2 is unchanged: nothing may show as connected unless a sync
has actually succeeded. So the rules become assertions about STATE rather than about
schema, which is what F2 was ever about:

  a provider flag off  ->  no connection may sit in status 'connected' for it, and
                           no connect control for it may be reachable
  a provider flag on   ->  a client id and secret must be configured for it, or the
                           member is being offered a connection that cannot complete
  always               ->  the database constraint that makes 'connected' require an
                           actual successful sync must still exist

The second is the one that earns its keep. The failure that happens is somebody
turning a provider on because its screen looks finished, while no credential exists,
and the member then meets an OAuth page that 400s. The third stops the constraint
being quietly dropped by a later migration.

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

# Per-provider flags, and the credential each one needs to be honest.
# Flag, the enum value it governs, and the credential it needs to be honest. Written
# out rather than derived: deriving the provider from the flag name gave 'google' for
# WEARABLE_GOOGLE when the enum value is 'google_health', and the query failed on the
# enum rather than silently checking nothing, which is the good version of that
# mistake. A three-column map cannot be wrong by string mangling.
PROVIDERS = {
    'WEARABLE_OURA':         ('oura',                'OURA_CLIENT_ID'),
    'WEARABLE_WHOOP':        ('whoop',               'WHOOP_CLIENT_ID'),
    'WEARABLE_POLAR':        ('polar',               'POLAR_CLIENT_ID'),
    'WEARABLE_WITHINGS':     ('withings',            'WITHINGS_CLIENT_ID'),
    'WEARABLE_GARMIN':       ('garmin',              'GARMIN_CONSUMER_KEY'),
    'WEARABLE_GOOGLE':       ('google_health',       'GOOGLE_HEALTH_CLIENT_ID'),
    'WEARABLE_APPLE_UPLOAD': ('apple_health_upload', None),   # a file upload needs no credential
}

provider_flags = dict(
    (r.split('|')[0], r.split('|')[1] == 'true')
    for r in q("""select key||'|'||enabled::text from feature_flags
                   where key like 'WEARABLE\\_%' escape '\\' order by key;""")
)
if SEED == 'provider-on-no-credential':
    provider_flags['WEARABLE_OURA'] = True

# .dev.vars is the local record of which credentials exist. It is not committed, so
# its absence is not a failure: the check only fires when a flag is ON.
devvars = {}
dv = os.path.join(ROOT, '.dev.vars')
if os.path.exists(dv):
    for line in open(dv, encoding='utf-8'):
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.split('=', 1)
            devvars[k.strip()] = v.strip()

# Every flag in the database must be one this check knows about, or a provider could
# be switched on that nothing here examines.
unknown = sorted(set(provider_flags) - set(PROVIDERS))
for k in unknown:
    problems.append(f'{k} exists as a flag and this check does not know which provider it '
                    f'governs, so turning it on would be unexamined')

for flag_key, on in provider_flags.items():
    if flag_key not in PROVIDERS:
        continue
    provider, secret = PROVIDERS[flag_key]
    if on and secret and not devvars.get(secret):
        problems.append(f'{flag_key} is ON and {secret} is not set, so a member would be '
                        f'offered a connection that cannot complete')
    if not on:
        # Nothing may be sitting in a connected state for a provider that is switched off.
        live = q(f"""select count(*) from wearable_connections
                      where provider = '{provider}' and status = 'connected';""")
        n = (live or ['0'])[0]
        if SEED == 'connected-while-off' and flag_key == 'WEARABLE_OURA':
            n = '1'
        if n != '0':
            problems.append(f'{flag_key} is off but {n} connection(s) for {provider} are in '
                            f'status connected, so a member is being shown a live device on a '
                            f'provider that is switched off')

# The constraint that makes 'connected' mean something. F2 in one line of SQL, and
# worth asserting because a later migration can drop a constraint without noticing.
con = q("""select conname from pg_constraint
            where conrelid = 'wearable_connections'::regclass
              and conname = 'wearable_connected_has_synced';""")
if SEED == 'constraint-dropped':
    con = []
if not con:
    problems.append('wearable_connected_has_synced is gone, so a connection can claim to be '
                    'connected without a successful sync behind it')

# Connect controls in the interface, for providers that are off.
for h in hits:
    problems.append(f'a connect control or connected state exists in the interface while its '
                    f'provider is switched off: {h}')

# F2's last sentence.# F2's last sentence. The internal account IS demonstration data, so the portal has
# to say so. portal.css carried .test-banner unused since it was written.
app = open(os.path.join(ROOT, 'public/portal/app.js'), encoding='utf-8').read()
if SEED == 'banner':
    app = app.replace('markTestAccount', 'removedForSeed')
if 'markTestAccount' not in app:
    problems.append('nothing marks an internal account in the portal, so test data renders '
                    'identically to a real participant record')
elif not re.search(r'await markTestAccount\(', app):
    problems.append('markTestAccount exists but is never called, so the banner never appears')

on_now = [k for k, v in provider_flags.items() if v]
print(f'  WEARABLES_ENABLED={flag}, {len(tables)} wearable table(s), '
      f'{len(provider_flags)} provider flag(s) of which {len(on_now)} on'
      + (': ' + ', '.join(on_now) if on_now else '')
      + f', {len(hits)} connect control(s) in the interface')

if problems:
    print('  FAKE STATE CHECK FAILED:', file=sys.stderr)
    for p in problems:
        print('   ', p, file=sys.stderr)
    sys.exit(1)
print('  no fake state: no provider is on without a credential, nothing sits connected on a '
      'provider that is off, the connected-means-synced constraint holds, and test data says it is test data')
