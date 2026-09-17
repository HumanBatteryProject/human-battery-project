# Program documents

The PDFs an enrolled client downloads from the portal. Folder structure
mirrors the storage bucket exactly, so uploading is a drag of this tree.

```
tier/pro/HBP-Protocol-PRO.pdf
tier/advanced/HBP-Protocol-ADVANCED.pdf
tier/intermediate/HBP-Protocol-INTERMEDIATE.pdf
tier/beginner/HBP-Protocol-BEGINNER.pdf
shared/HBP-Dietary-Guidelines.pdf
```

## Upload

Supabase → Storage → `program-docs` bucket (created by migration 017).
Upload each file to the exact path above. The path is the permission:
a client can only sign a URL for `shared/*` and `tier/<their tier>/*`.

## Regenerate

`build.py` renders all five from the content inside it. Edit the content
there, run it, re-upload. Requires weasyprint and the brand fonts from
`/brand/fonts`.

## Versioning

When a document changes, bump `version` on its row in
`program_documents`. Clients mid-program keep the version they started
on; do not overwrite a file that a running cohort is following.
