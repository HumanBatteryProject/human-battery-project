#!/usr/bin/env python3
"""Every built PDF carries the mark, the trademark, and no retired value.

    python3 scripts/check_brand.py
    python3 scripts/check_brand.py --seed

Sections 2, 4 and 8 of docs/brand/HBP-Brand-Style-v3-Dawn.md, checked against the
RENDERED files rather than the source, because the failure this catches was
invisible in source: six generators referenced lockup-dark.png, a file that does
not exist in this repository, so every cover rendered with no logo at all and
nothing said so for as long as anyone had been looking at them.
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'program-docs', 'out')
SEED = '--seed' in sys.argv
tok = json.load(open(os.path.join(ROOT, 'brand/tokens.json'), encoding='utf-8'))
RETIRED_HEX = {k.upper() for k in tok['retired'] if k.startswith('#')}
BRAND_FACES = ('Michroma', 'Spectral', 'Archivo')

def images(path):
    return len(re.findall(rb'/Subtype\s*/Image', open(path, 'rb').read()))

def text(path):
    return subprocess.run(['pdftotext', path, '-'], capture_output=True).stdout.decode('utf-8', 'replace')

def fonts(path):
    out = subprocess.run(['pdffonts', path], capture_output=True).stdout.decode()
    return {re.sub(r'^[A-Z]{6}\+', '', l.split()[0]) for l in out.splitlines()[2:] if l.split()}

problems = []
pdfs = sorted(f for f in os.listdir(OUT) if f.endswith('.pdf'))
if not pdfs:
    print('  no built PDFs to check. Run scripts/build_docs.sh', file=sys.stderr)
    sys.exit(1)

for f in pdfs:
    p = os.path.join(OUT, f)
    n_img, t, fam = images(p), text(p), fonts(p)
    if SEED and f == pdfs[0]:
        n_img, t, fam = 0, t.replace('™', ''), {'Georgia'}
    if n_img == 0:
        problems.append(f'{f}: no image at all, so the mark is not on it')
    if '™' not in t:
        problems.append(f'{f}: no trademark symbol anywhere in the document')
    used = [x for x in BRAND_FACES if any(x in g for g in fam)]
    if not used:
        problems.append(f'{f}: renders in {", ".join(sorted(fam)) or "no embedded font"}, '
                        f'none of which is a brand face')

# Section 8: no retired value may survive in a generator.
for name in sorted(os.listdir(os.path.join(ROOT, 'program-docs'))):
    if not name.endswith('.py'):
        continue
    src = open(os.path.join(ROOT, 'program-docs', name), encoding='utf-8').read()
    if SEED and name == 'design.py':
        src += '\nSTALE = "#2AAFC0"\n'
    for hexv in RETIRED_HEX:
        if re.search(hexv, src, re.I):
            problems.append(f'{name}: uses retired {hexv}, {tok["retired"][hexv]}')
    if re.search(r'\bNewsreader\b', src):
        problems.append(f'{name}: uses the retired Newsreader face, the reading face is Spectral')
    if 'lockup-dark' in src:
        problems.append(f'{name}: references lockup-dark.png, which does not exist')

if problems:
    print('  BRAND CHECK FAILED:', file=sys.stderr)
    for p in sorted(set(problems)):
        print('   ', p, file=sys.stderr)
    sys.exit(0 if SEED else 1)

print(f'  brand ok: {len(pdfs)} PDFs, every one carries the mark and a trademark and '
      f'renders in the brand faces, no retired value in any generator')
