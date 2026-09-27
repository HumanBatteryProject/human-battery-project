#!/usr/bin/env python3
"""Every name a module uses from another module in this project must be imported.

    python3 scripts/check_imports.py
    python3 scripts/check_imports.py --seed   removes one import, to prove it fails

WHY THIS EXISTS. plan-run.js called attachPractices() without importing it. That
is not a syntax error, so `node --check` passed, and it is not a module-load
error, so importing the file passed too. It was a ReferenceError thrown inside a
request handler, which meant the planner failed for every member and the only
thing that noticed was the post-deploy failure-mode proof. The code was live by
then.

The gap was specific: a missing import is invisible to every check that does not
do scope analysis. This does the narrow version of that analysis, over the names
this project exports from its own modules, which is where the mistake happens.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = os.path.join(ROOT, 'functions', 'api')
SEED = '--seed' in sys.argv


def strip_noise(src):
    """Remove comments and string bodies, so a name mentioned in prose is not a use.

    Both false positives this produced on its first run were names inside
    comments: "Thrown by ask() when generation is paused" and a header comment
    naming safetyBlock() as the Safety gate.
    """
    src = re.sub(r'/\*.*?\*/', ' ', src, flags=re.S)
    src = re.sub(r'(?m)//.*$', ' ', src)
    src = re.sub(r'`(?:[^`\\]|\\.)*`', '``', src)
    src = re.sub(r"'(?:[^'\\\n]|\\.)*'", "''", src)
    src = re.sub(r'"(?:[^"\\\n]|\\.)*"', '""', src)
    return src


files = sorted(f for f in os.listdir(API) if f.endswith('.js'))
raw = {f: open(os.path.join(API, f), encoding='utf-8').read() for f in files}

# Every name this project exports from functions/api. Only these are checked: a
# global, a Web API or a Node builtin is not this script's business.
exported = {}
for f, src in raw.items():
    for m in re.finditer(r'export\s+(?:async\s+)?function\s+(\w+)', src):
        exported.setdefault(m.group(1), set()).add(f)
    for m in re.finditer(r'export\s+(?:const|let|class)\s+(\w+)', src):
        exported.setdefault(m.group(1), set()).add(f)

problems = []
for f in files:
    src = strip_noise(raw[f])

    imported = set()
    for m in re.finditer(r'import\s*\{([^}]*)\}\s*from', src, re.S):
        for part in m.group(1).split(','):
            part = part.strip()
            if part:
                imported.add(re.split(r'\s+as\s+', part)[-1].strip())
    for m in re.finditer(r'import\s+(\w+)\s*(?:,|from)', src):
        imported.add(m.group(1))

    local = set()
    for m in re.finditer(r'(?:export\s+)?(?:async\s+)?function\s+(\w+)', src):
        local.add(m.group(1))
    for m in re.finditer(r'(?:export\s+)?(?:const|let|var|class)\s+(\w+)', src):
        local.add(m.group(1))

    if SEED and f == 'plan-run.js':
        imported.discard('observe')

    for name, homes in exported.items():
        if f in homes or name in imported or name in local:
            continue
        # A call, not a mention. Never preceded by a dot, so `obj.observe()` is
        # a method and not this name.
        if re.search(r'(?<![\w.$])' + re.escape(name) + r'\s*\(', src):
            problems.append(f'{f} calls {name}() and does not import it. '
                            f'It is exported by {", ".join(sorted(homes))}.')

if problems:
    print('  IMPORT CHECK FAILED:', file=sys.stderr)
    for p in sorted(set(problems)):
        print('   ', p, file=sys.stderr)
    sys.exit(1)

print(f'  imports ok: {len(files)} module(s), {len(exported)} project export(s), '
      'every cross-module call is imported')
