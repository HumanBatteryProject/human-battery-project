#!/usr/bin/env python3
"""The built Battery Kitchen must match the menu that was approved.

    python3 scripts/check_menu.py
    python3 scripts/check_menu.py --seed   breaks each rule in turn

Two files, two jobs. program-docs/kitchen_data.json is what the document renders.
docs/research/menu-90-proposed.json is the plan the owner approved, and it carries
the lineage and the quota tags. The names must match across both, or the document
has drifted from what was agreed and nothing would say so.

Quotas, from Prompt A: 90 recipes, exactly 30 per meal, every chef at 3 or more,
at least 22 oily fish, at least 9 organ or offcut, at least 9 fire or ember, and
starch or fruit never offered to pro or advanced. Style rules that reach a member:
no em dash, and no chef name in a recipe name or in any text a member reads.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = '--seed' in sys.argv
built = json.load(open(os.path.join(ROOT, 'program-docs/kitchen_data.json'), encoding='utf-8'))
plan  = json.load(open(os.path.join(ROOT, 'docs/research/menu-90-proposed.json'), encoding='utf-8'))

if SEED:
    built = [dict(r) for r in built]
    built[0]['meal'] = 'lunch'                                  # breaks 30 per meal
    built[1]['name'] = 'A Recipe Nobody Approved'               # drifts from the plan
    built[2]['why'] = 'Heston Blumenthal would approve of this.'# chef name in member text
    built[3]['steps'] = ['Cook it — then eat it.']              # em dash
    built[4]['ing'] = ['2 tbsp sunflower oil']                  # a seed oil
    for r in built:
        if 'sweet potato' in ' '.join(r['ing']).lower():
            r['tiers_raw'] = 'A'                                # starch to every tier
            break

problems = []
MEALS = ('breakfast', 'lunch', 'dinner')

if len(built) != 90:
    problems.append(f'the Battery Kitchen holds {len(built)} recipes, not 90')
for m in MEALS:
    n = sum(1 for r in built if r['meal'] == m)
    if n != 30:
        problems.append(f'{m} holds {n} recipes, not 30')

# The built document and the approved plan must name the same 90 dishes.
bn, pn = {r['name'] for r in built}, {r['name'] for r in plan}
for n in sorted(bn - pn):
    problems.append(f'"{n}" is in the document and not in the approved menu')
for n in sorted(pn - bn):
    problems.append(f'"{n}" was approved and is missing from the document')

tags = {r['name']: set(r.get('tags', [])) for r in plan}
chefs = {}
for r in plan:
    chefs[r['chef']] = chefs.get(r['chef'], 0) + 1
for c, n in sorted(chefs.items()):
    if n < 3:
        problems.append(f'{c} inspires only {n} recipe(s), the brief says at least 3')

for tag, need, label in (('fish', 22, 'oily fish or shellfish'),
                         ('organ', 9, 'organ meat or offcut'),
                         ('fire', 9, 'fire or ember')):
    have = [r for r in plan if tag in r['tags']]
    if len(have) < need:
        problems.append(f'only {len(have)} {label} recipe(s), the brief says at least {need}')
    for m in MEALS:
        if not any(r['meal'] == m for r in have):
            problems.append(f'no {label} recipe in {m}, the brief says spread them across all three')

# The tier rule is a MAXIMUM tier, which is why it is checked against the text and
# not against a tier_min column: starch and fruit stop at intermediate.
STARCH_FRUIT = ('white rice', 'sweet potato', 'squash', 'berries', 'blueberries',
                'blackberries', 'raspberries')
for r in built:
    text = (r['name'] + ' ' + ' '.join(r['ing'])).lower()
    hit = [w for w in STARCH_FRUIT if w in text]
    if hit and r['tiers_raw'].strip() == 'A':
        problems.append(f'"{r["name"]}" contains {hit[0]} and is offered to every tier')

BANNED = re.compile(r'\b(sunflower|canola|rapeseed|soybean|corn|grapeseed|vegetable) oil|'
                    r'\b(sugar|flour|bread|pasta|pastry|wine|beer|brandy|sherry|vermouth)\b', re.I)

# A sentence that FORBIDS a thing is the opposite of that thing, and these recipes
# say so on purpose: "the dish works without the pastry", "there is no flour in
# this", "no wine, and none needed", "mustard, no sugar". Same approach and same
# narrowness as check_prohibitions.py: the negation has to be in the same sentence.
NEGATED = re.compile(r'\b(no|not|never|without|instead of|nothing|none|replaces|'
                     r'unlike|rather than|no need|-free|free of)\b', re.I)

def sentences(text):
    return re.split(r'(?<=[.!?])\s+|,\s*(?=no\b)|\n', text)

def banned_hit(text):
    for sent in sentences(text):
        hit = BANNED.search(sent)
        if hit and not NEGATED.search(sent):
            return hit.group(0)
    return None
CHEFS = {w for r in plan for w in r['chef'].split() if len(w) > 3}
for r in built:
    member_text = ' '.join([r['name'], r['why'], *r['ing'], *r['steps']])
    if '—' in member_text:
        problems.append(f'"{r["name"]}" contains an em dash')
    hit = banned_hit(member_text)
    if hit:
        problems.append(f'"{r["name"]}" names {hit}')
    for w in CHEFS:
        if re.search(r'\b' + re.escape(w) + r'\b', member_text):
            problems.append(f'"{r["name"]}" puts the chef name {w} in text a member reads')

if problems:
    print('  MENU CHECK FAILED:', file=sys.stderr)
    for p in sorted(set(problems)):
        print('   ', p, file=sys.stderr)
    sys.exit(0 if SEED else 1)

print(f'  menu ok: {len(built)} recipes, 30 per meal, matches the approved menu exactly, '
      f'{len(chefs)} chefs all at 3 or more, {sum(1 for r in plan if "fish" in r["tags"])} oily fish, '
      f'{sum(1 for r in plan if "organ" in r["tags"])} organ or offcut, '
      f'{sum(1 for r in plan if "fire" in r["tags"])} fire, no starch or fruit above intermediate, '
      'no chef name and no em dash in anything a member reads')
