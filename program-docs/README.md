# Program documents

The PDFs an enrolled client downloads from the portal. Folder structure
mirrors the storage bucket exactly, so uploading is a drag of this tree.

```
tier/pro/HBP-Protocol-PRO.pdf
tier/advanced/HBP-Protocol-ADVANCED.pdf
tier/intermediate/HBP-Protocol-INTERMEDIATE.pdf
tier/beginner/HBP-Protocol-BEGINNER.pdf
shared/HBP-Dietary-Guidelines.pdf
shared/HBP-Your-Tests-Explained.pdf
```

## Upload

`python3 scripts/publish_docs.py` reports what differs from what is live.
`--publish` uploads it and points the row at it.

It uploads to a new path per version, pulls the object back down and compares
sha256 before touching the row, so a row never points at an object that is not
there. The old object stays in the bucket: that is what lets someone part way
through a program keep the version they started on.

Change is detected on the TEXT of the PDF, not on its bytes. WeasyPrint stamps a
creation time into the container, so two builds of an unchanged document have
different sha256 and identical text. Needs `pdftotext`.

The path is still the permission: a client can only sign a URL for `shared/*`
and `tier/<their tier>/*`.

## Regenerate

`sh scripts/build_docs.sh` builds every document. One generator:
`sh scripts/build_docs.sh tier_doc`.

It uses `.venv-docs`, built on first run from a homebrew python. That is not
optional tidiness: WeasyPrint needs the homebrew graphics libraries, and macOS
strips `DYLD_*` from SIP-protected binaries, so the system `python3` cannot find
them however the environment is set. Running `python3 tier_doc.py` directly fails
with a dlopen error that reads like a missing install. The tier PDFs sat four
days stale because of exactly that.

`build.py` renders the tier protocols. `tier_doc.py`, `diet_doc.py` and
`tests_doc.py` render the rest, and all three import `build` and `design`.
Needs the brand fonts from `/brand/fonts`.

## Versioning

`program_documents` is UNIQUE on `slug`, one row per document, so a version is an
update of that row rather than a second row. `publish_docs.py` does this; do not
edit the row by hand, because the row and the object in the bucket have to move
together.

Clients mid-program keep the version they started on through the path they were
given, which still resolves. `document_downloads` records which version each
person actually pulled.
