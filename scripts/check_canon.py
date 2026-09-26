#!/usr/bin/env python3
"""The seeded canon must only name things that exist.

Three ways a canonical rule can be quietly useless:

  1. It names a contraindication that is not a screening key, so the Safety gate
     compares against a flag that can never be raised and permits everything.
     A trigger now blocks this; the check stays because a trigger can be dropped.
  2. It requires a data field the check-in never collects, so the rule is
     permanently "insufficient" and never reaches good confidence.
  3. It belongs to a pillar that does not exist.

All three look like a working system. Needs SUPABASE_URL and SUPABASE_SERVICE_KEY.
  --seed injects each fault in turn, to prove the check can fail.
"""
import json, os, re, sys, urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = '--seed' in sys.argv
url, key = os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_KEY')
if not url or not key:
    print('  SUPABASE_URL or SUPABASE_SERVICE_KEY not set', file=sys.stderr)
    sys.exit(1)

def get(path):
    req = urllib.request.Request(f'{url}/rest/v1/{path}',
                                headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

# The code's own lists, read from source so this cannot drift from what the
# Planner actually reads.
plan_src = open(os.path.join(root, 'functions/api/_plan.js'), encoding='utf-8').read()
m = re.search(r'export const FIELDS = \[(.*?)\];', plan_src, re.S)
FIELDS = set(re.findall(r"'([a-z_]+)'", m.group(1))) if m else set()

med_src = open(os.path.join(root, 'functions/api/_medical.js'), encoding='utf-8').read()
CODE_KEYS = set(re.findall(r"\{ key: '([a-z_]+)'", med_src))

db_keys = {r['key'] for r in get('screening_keys?select=key')}
pillars = {r['key'] for r in get('pillars?select=key')}
rules = get('canonical_rules?select=rule_key,version,pillar_key,required_data,contraindications,review_status&retired_at=is.null')

problems = []
if SEED and rules:
    rules = [dict(rules[0]) for _ in range(3)]
    rules[0]['contraindications'] = ['levothyroxine']
    rules[1]['required_data'] = ['blood_pressure_at_home']
    rules[2]['pillar_key'] = 'cellular_voltage'

# The screening table is duplicated in code on purpose: _medical.js must work
# when the database is unreachable. Duplication that nothing checks is drift.
if CODE_KEYS != db_keys:
    problems.append(f'screening keys differ. code has {sorted(CODE_KEYS - db_keys)} extra, '
                    f'database has {sorted(db_keys - CODE_KEYS)} extra')

for r in rules:
    rk = f"{r['rule_key']} v{r['version']}"
    for c in (r.get('contraindications') or []):
        if c not in db_keys:
            problems.append(f'{rk}: contraindication "{c}" is not a screening key, so the Safety gate can never fire on it')
    for f in (r.get('required_data') or []):
        if f not in FIELDS:
            problems.append(f'{rk}: requires "{f}", which the check-in never collects, so it stays insufficient forever')
    if r['pillar_key'] not in pillars:
        problems.append(f'{rk}: pillar "{r["pillar_key"]}" does not exist')

if problems:
    print('  CANON CHECK FAILED:', file=sys.stderr)
    for p in sorted(set(problems)):
        print('   ', p, file=sys.stderr)
    sys.exit(1)

approved = sum(1 for r in rules if r['review_status'] == 'approved')
print(f'  canon ok: {len(rules)} rule(s) across {len(pillars)} pillars, '
      f'{approved} approved, every contraindication and data field real')
