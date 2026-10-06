#!/usr/bin/env python3
"""The mark is shown as the file is, and it always carries its trademark.

    python3 scripts/check_logo.py
    python3 scripts/check_logo.py --seed

Ruled 2026-10-03. Three rules, each of which can be broken silently:

  1. No CSS rule may apply filter, box-shadow, text-shadow, mix-blend-mode or
     mask to the wordmark image. The mark gets no effects, ever.
  2. The old specular files must not exist in the repository, so nothing can
     fall back to a version of the mark that was replaced.
  3. The three wordmark assets ARE the clean files, byte for byte, by sha256.
     The mark that shipped until 2026-10-02 carried two lens flares, on the H
     of HUMAN and the second T of BATTERY, and its transparent conversion kept
     the glow around them at alpha 84 to 133, which showed as light blobs on
     the indigo field. The clean files have those two flares removed and
     nothing else changed (the flares on the PROJECT rules are the design). A
     stale asset copied back from any folder fails here, whatever its name.

The second and third rules are why this checks the FILES and not only the
stylesheets: a deleted asset that is still referenced, a replaced asset still
sitting in the tree under its old name, or the old bytes under the right name,
is how the old mark comes back.
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = '--seed' in sys.argv

# The clean assets, pinned. Rebuilding the mark means re-pinning these on purpose.
CLEAN = {
    'public/assets/wordmark.png':             '3a375cee3fea7d1789fa340e4fe231ebe263fa1a40c04ab8bbfa92377fd0b374',
    'public/assets/wordmark-flat-ink.png':    '5abffcb8a6f7c02279d9c24542354a214df2e6c12cab40804d086cffb88e823f',
    'public/assets/wordmark-flat-copper.png': 'e431947d3f364ac674b7e1f7efd6fc8cab1a77bd9eefe11b10c0a6b73fcfadd6',
}

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
# ...and under any other name, anywhere in the tree. The old mark came back once
# from a Downloads folder; it must not be able to come back from inside the repo.
for base, dirs, files in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in ('.git', 'node_modules', '.wrangler', '.venv-docs', '__pycache__')]
    for f in files:
        low = f.lower()
        if 'specular' in low or (low.startswith('wordmark') and ('-old' in low or '-orig' in low)):
            problems.append(f'{os.path.relpath(os.path.join(base, f), ROOT)} is a retired mark file and must not be in the repo')
if SEED:
    problems.append('public/assets/wordmark-specular.png still exists, so the old mark can still be served')

# The assets are the clean files. A query string on the <img> src (cache-busting,
# ?v=2) does not change which file is served, so the pin is on the file itself.
for rel, want in CLEAN.items():
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        problems.append(f'{rel} is missing')
        continue
    got = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    if SEED and rel.endswith('/wordmark.png'):
        got = '0' * 64
    if got != want:
        problems.append(f'{rel} is not the clean mark (sha256 {got[:12]}, the clean file is {want[:12]})')

# Every wordmark image on a page carries its symbol beside it. The src may carry
# a cache-busting query string, so the match does not stop at .png".
IMG = re.compile(r'<img\s[^>]*src="[^"]*wordmark[^"]*\.png(?:\?[^"]*)?"[^>]*>')
n_img = 0
for base, _dirs, files in os.walk(os.path.join(ROOT, 'public')):
    for f in sorted(files):
        if not f.endswith('.html'):
            continue
        path = os.path.join(base, f)
        rel = os.path.relpath(path, ROOT)
        src = open(path, encoding='utf-8').read()
        for m in IMG.finditer(src):
            n_img += 1
            after = src[m.end():m.end() + 160]
            if SEED and rel == 'public/404.html':
                after = ''
            if '&#8482;' not in after and '™' not in after:
                problems.append(f'{rel}: a wordmark has no trademark beside it')

if problems:
    print('  LOGO CHECK FAILED:', file=sys.stderr)
    for p in sorted(set(problems)):
        print('   ', p, file=sys.stderr)
    sys.exit(0 if SEED else 1)

print(f'  logo ok: the 3 assets are the clean mark by hash, no effect applied to the mark in '
      f'{len(css_files)} file(s), all {n_img} wordmarks carry their trademark, no retired mark file in the tree')
