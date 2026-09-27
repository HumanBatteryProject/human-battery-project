#!/usr/bin/env python3
"""Publish the built PDFs to Supabase Storage and register the new version.

    python3 scripts/publish_docs.py            report what would change
    python3 scripts/publish_docs.py --publish  upload and register

WHY THIS EXISTS. program-docs/README.md said uploading was "a drag of this tree"
into the Supabase dashboard, and bumping the version was a manual edit of a row.
That makes two things impossible to know: whether the file a member downloads is
the file this repository builds, and which version they are getting. A document
that changed and was never uploaded looks exactly like one that was.

WHAT IT WILL NOT DO. It never overwrites a published storage object. A new
version is uploaded to a NEW path, and the row for that slug is then pointed at
it. program_documents is UNIQUE on slug, one row per document, so a version is an
update of that row and not a second row; the first attempt at this retired the old
row and inserted a new one, which 409ed on the unique index and left
protocol-advanced retired with nothing live in its place.

The old object stays in the bucket. That is what lets a participant part way
through a program keep the version they started on: the path they were given still
resolves, and document_downloads records which one each person actually pulled.

Needs SUPABASE_URL and SUPABASE_SERVICE_KEY.
"""
import hashlib
import json
import os
import re
import sys
import subprocess
import tempfile
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'program-docs', 'out')
BUCKET = 'program-docs'
PUBLISH = '--publish' in sys.argv

URL = os.environ.get('SUPABASE_URL')
KEY = os.environ.get('SUPABASE_SERVICE_KEY')
if not URL or not KEY:
    print('  SUPABASE_URL or SUPABASE_SERVICE_KEY not set', file=sys.stderr)
    sys.exit(1)

# slug -> the built filename. The folder a file goes to is the permission: a
# member can sign a URL for shared/* and for tier/<their own tier>/* only.
DOCS = {
    'protocol-beginner':      ('tier/beginner',     'HBP-Protocol-BEGINNER.pdf'),
    'protocol-intermediate':  ('tier/intermediate', 'HBP-Protocol-INTERMEDIATE.pdf'),
    'protocol-advanced':      ('tier/advanced',     'HBP-Protocol-ADVANCED.pdf'),
    'protocol-pro':           ('tier/pro',          'HBP-Protocol-PRO.pdf'),
    'first-steps-beginner':     ('tier/beginner',     'HBP-First-Steps-BEGINNER.pdf'),
    'first-steps-intermediate': ('tier/intermediate', 'HBP-First-Steps-INTERMEDIATE.pdf'),
    'first-steps-advanced':     ('tier/advanced',     'HBP-First-Steps-ADVANCED.pdf'),
    'first-steps-pro':          ('tier/pro',          'HBP-First-Steps-PRO.pdf'),
    'dietary-guidelines':   ('shared', 'HBP-Dietary-Guidelines.pdf'),
    'tests-explained':      ('shared', 'HBP-Your-Tests-Explained.pdf'),
    'battery-kitchen':      ('shared', 'HBP-Battery-Kitchen.pdf'),
}


def api(path, method='GET', body=None, headers=None, raw=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
    h.update(headers or {})
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    if body is not None and raw is None:
        h['Content-Type'] = 'application/json'
    req = urllib.request.Request(f'{URL}{path}', data=data, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        payload = r.read()
        return json.loads(payload) if payload and r.headers.get('Content-Type', '').startswith('application/json') else payload


def rest(path, method='GET', body=None, prefer=None):
    h = {'Prefer': prefer} if prefer else {}
    return api('/rest/v1/' + path, method, body, h)


def sha_of(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def text_of(blob):
    """The words on the page, which is what a member reads.

    Change is detected on TEXT, not on bytes. WeasyPrint stamps a creation time
    into the PDF container, so two builds of an unchanged document have different
    sha256 and identical text. Comparing bytes made every document look changed on
    every run, which would have bumped all eleven versions to v8 and told the owner
    that eleven documents had been revised when four had.
    """
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
        f.write(blob)
        path = f.name
    try:
        out = subprocess.run(['pdftotext', path, '-'], capture_output=True, timeout=120)
        if out.returncode != 0:
            raise RuntimeError('pdftotext failed: ' + out.stderr.decode()[:200])
        return re.sub(r'\s+', ' ', out.stdout.decode('utf-8', 'replace')).strip()
    finally:
        os.unlink(path)


def download(storage_path):
    """The bytes a member would actually get. None if the object is absent."""
    try:
        return api(f'/storage/v1/object/{BUCKET}/{storage_path}')
    except urllib.error.HTTPError:
        return None


live = {r['slug']: r for r in rest('program_documents?select=*&retired_at=is.null')}

changed, same, missing = [], [], []
for slug, (folder, fname) in sorted(DOCS.items()):
    local = os.path.join(OUT, fname)
    if not os.path.exists(local):
        missing.append((slug, fname))
        continue
    row = live.get(slug)
    local_sha = sha_of(local)
    if not row:
        changed.append((slug, folder, fname, local, local_sha, 1, None))
        continue
    cur = download(row['storage_path'])
    if cur is not None and text_of(cur) == text_of(open(local, 'rb').read()):
        same.append((slug, row['version']))
        continue
    n = int(re.sub(r'\D', '', row['version'] or 'v0') or 0) + 1
    changed.append((slug, folder, fname, local, local_sha, n, row))

for slug, fname in missing:
    print(f'  NOT BUILT  {slug}: {fname} is not in program-docs/out. Run scripts/build_docs.sh.')
for slug, v in same:
    print(f'  unchanged  {slug} stays at {v}')

if not changed:
    print(f'\n  nothing to publish. {len(same)} document(s) match what is live.')
    sys.exit(1 if missing else 0)

for slug, folder, fname, local, sha, n, row in changed:
    base = fname[:-4]
    new_path = f'{folder}/{base}-v{n}.pdf'
    was = row['version'] if row else 'not published'
    print(f'  {"PUBLISH" if PUBLISH else "would publish"}  {slug}: {was} -> v{n}  {new_path}  sha {sha[:12]}')
    if not PUBLISH:
        continue

    blob = open(local, 'rb').read()
    api(f'/storage/v1/object/{BUCKET}/{new_path}', 'POST', raw=blob,
        headers={'Content-Type': 'application/pdf', 'x-upsert': 'false'})

    # Verify by pulling the object back down, the way a member would, rather than
    # trusting the upload's own success. An upload that reports 200 and stores a
    # truncated object is the failure this catches.
    back = download(new_path)
    got = hashlib.sha256(back).hexdigest() if back else None
    if got != sha:
        print(f'    UPLOAD DID NOT VERIFY. wrote {sha[:12]}, read back {str(got)[:12]}. '
              'The row was NOT changed, so the old version is still what members get.')
        sys.exit(1)
    print(f'    verified by re-download: {len(back)} bytes, sha {got[:12]}')

    # One row per slug, so this is an update. Only now, after the re-download
    # verified, because a row pointing at an object that is not there is worse
    # than a row pointing at last week's.
    if row:
        rest(f'program_documents?id=eq.{row["id"]}', 'PATCH',
             {'storage_path': new_path, 'version': f'v{n}',
              'published_at': 'now()', 'retired_at': None},
             prefer='return=minimal')
    else:
        rest('program_documents', 'POST',
             {'slug': slug, 'title': slug.replace('-', ' ').title(), 'tier': None,
              'storage_path': new_path, 'version': f'v{n}', 'published_at': 'now()'},
             prefer='return=minimal')
    print(f'    row now points at v{n}. {was} stays in the bucket, so anyone '
          'already holding that path keeps it.')

print(f'\n  {len(changed)} published, {len(same)} unchanged')
