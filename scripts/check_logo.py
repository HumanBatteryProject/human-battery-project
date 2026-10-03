#!/usr/bin/env python3
"""The mark is shown as the file is, and it always carries its trademark.

    python3 scripts/check_logo.py
    python3 scripts/check_logo.py --seed

Ruled 2026-10-03. Two rules, both of which a stylesheet can break silently:

  1. No CSS rule may apply filter, box-shadow, text-shadow, mix-blend-mode or
     mask to the wordmark image. The mark gets no effects, ever.
  2. The old specular files must not exist in the repository, so nothing can
     fall back to a version of the mark that was replaced.

The second rule is why this checks the FILES and not only the stylesheets: a
deleted asset that is still referenced, or a replaced asset still sitting in the
tree under its old name, is how the old mark comes back.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = '--seed' in sys.argv

# Selectors that mean "the wordmark image".
MARK_SEL = re.compile(r'(\.mk\b[^{]*|\.landing-mark[^{]*|\.brand\s+img|\.loader-mark[^{]*|'
                      r'\.loader-face[^{]*|\[src\*=["\']?wordmark)', re.I)
EFFECTS = re.compile(r'\b(filter|box-shadow|text-shadow|mix-blend-mode|mask|mask-image|'
                     r'-webkit-mask-image|backdrop-filter)\s*:', re.I)
# `none` is the point of several of these rules, so a declaration that switches an
# effect OFF is not a violation.
OFF = re.compile(r':\s*(none|normal|initial|unset)\s*(!important)?\s*$', re.I)

# Files that must not come back. The mark was replaced; these are the names the
# old one shipped under in earlier revisions.
FORBIDDEN_FILES = [
    'public/assets/wordmark-specular.png',
    'public/assets/wordmark-shine.png',
    'public/assets/lockup-dark.png',
]

problems = []

def rules(css):
    """(selector, body) for every rule in a stylesheet, comments stripped."""
    css = re.sub(r'/\*.*?\*/', ' ', css, flags=re.S)
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        yield m.group(1).strip(), m.group(2)

css_files = []
for base, _dirs, files in os.walk(os.path.join(ROOT, 'public')):
    for f in files:
        if f.endswith(('.css', '.html')):
            css_files.append(os.path.join(base, f))

for path in sorted(css_files):
    src = open(path, encoding='utf-8').read()
    rel = os.path.relpath(path, ROOT)
    if SEED and rel == 'public/styles.css':
        src += '\n.landing-mark img{filter:drop-shadow(0 0 12px gold)}\n'
    blocks = [src]
    if path.endswith('.html'):
        blocks = re.findall(r'<style[^>]*>(.*?)</style>', src, re.S)
    for block in blocks:
        for sel, body in rules(block):
            if not MARK_SEL.search(sel):
                continue
            for decl in body.split(';'):
                decl = decl.strip()
                if not decl or not EFFECTS.match(decl):
                    continue
                if OFF.search(decl):
                    continue
                problems.append(f'{rel}: "{sel.strip()[:48]}" applies {decl[:44]} to the mark')

for rel in FORBIDDEN_FILES:
    if os.path.exists(os.path.join(ROOT, rel)):
        problems.append(f'{rel} still exists, so the old mark can still be served')
if SEED:
    problems.append('public/assets/wordmark-specular.png still exists, so the old mark can still be served')

# Every wordmark image on a page carries its symbol beside it.
for base, _dirs, files in os.walk(os.path.join(ROOT, 'public')):
    for f in sorted(files):
        if not f.endswith('.html'):
            continue
        path = os.path.join(base, f)
        rel = os.path.relpath(path, ROOT)
        src = open(path, encoding='utf-8').read()
        for m in re.finditer(r'<img\s[^>]*src="[^"]*wordmark[^"]*\.png"[^>]*>', src):
            after = src[m.end():m.end() + 160]
            before = src[max(0, m.start() - 160):m.start()]
            if '&#8482;' not in after and '™' not in after and 'class="mk' not in before:
                problems.append(f'{rel}: a wordmark has no trademark beside it')

if problems:
    print('  LOGO CHECK FAILED:', file=sys.stderr)
    for p in sorted(set(problems)):
        print('   ', p, file=sys.stderr)
    sys.exit(0 if SEED else 1)

print(f'  logo ok: no effect applied to the mark in {len(css_files)} file(s), '
      f'every wordmark carries its trademark, no retired mark file in the tree')
