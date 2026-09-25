#!/usr/bin/env python3
"""The one price that exists in two places must agree in both.

PROGRAM_TOTAL_CENTS lives in functions/api/_payments.js because Stripe needs it
at request time, and program_settings.program_price_cents exists so the console
has one place to show every price. That is a duplication, documented as one, and
a duplication that nothing checks is a duplication that drifts. If they drift,
the console shows one price and the card is charged the other, and the member
finds out first.

cohorts.price_cents is the third copy and is checked too.

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY, so it runs in deploy rather than
in the commit hook.
"""
import json, os, re, sys, urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

src = open(os.path.join(root, 'functions/api/_payments.js'), encoding='utf-8').read()
m = re.search(r'export const PROGRAM_TOTAL_CENTS\s*=\s*(\d+)', src)
if not m:
    print('  PROGRAM_TOTAL_CENTS not found in _payments.js', file=sys.stderr)
    sys.exit(1)
code_cents = int(m.group(1))

url, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_KEY')
if not url or not key:
    print('  SUPABASE_URL or SUPABASE_SERVICE_KEY not set, cannot compare', file=sys.stderr)
    sys.exit(1)

def get(path):
    req = urllib.request.Request(f'{url}/rest/v1/{path}',
                                headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

rows = get('program_settings?key=eq.program_price_cents&select=value')
if not rows or not rows[0].get('value'):
    print('  program_settings.program_price_cents is not set', file=sys.stderr)
    sys.exit(1)
db_cents = int(rows[0]['value'])

problems = []
if db_cents != code_cents:
    problems.append(f'_payments.js says {code_cents}, program_settings says {db_cents}')

# The INTERNAL cohort is priced at 0 on purpose: internal members are never
# billed, which is the whole point of is_internal. Exempted by name rather than
# by "ignore any zero price", because a zero on a real cohort would mean the
# program is free and that must fail loudly.
INTERNAL_COHORTS = {'INTERNAL'}
for c in get('cohorts?select=code,price_cents'):
    if c['code'] in INTERNAL_COHORTS:
        if int(c.get('price_cents') or 0) != 0:
            problems.append(f"cohort {c['code']} is an internal cohort and must be priced 0, not {c['price_cents']}")
        continue
    if c.get('price_cents') is not None and int(c['price_cents']) != code_cents:
        problems.append(f"cohort {c['code']} says {c['price_cents']}, _payments.js says {code_cents}")

if problems:
    print('  PRICE DRIFT:', file=sys.stderr)
    for p in problems:
        print('   ', p, file=sys.stderr)
    sys.exit(1)

print(f'  program price agrees in all places: {code_cents} cents')
