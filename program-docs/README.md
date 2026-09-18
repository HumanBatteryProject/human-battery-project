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

Supabase → Storage → `program-docs` bucket (created by migration 017).
Upload each file to the exact path above. The path is the permission:
a client can only sign a URL for `shared/*` and `tier/<their tier>/*`.

## Regenerate

`build.py` renders the tier protocols. `tier_doc.py`, `diet_doc.py` and
`tests_doc.py` render the rest, and all three import `build` and `design`.
Together they produce all six documents. Edit the content
there, run it, re-upload. Requires weasyprint and the brand fonts from
`/brand/fonts`.

## Versioning

When a document changes, bump `version` on its row in
`program_documents`. Clients mid-program keep the version they started
on; do not overwrite a file that a running cohort is following.
