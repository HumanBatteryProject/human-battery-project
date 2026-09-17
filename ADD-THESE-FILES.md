# Files to add to the repo

These were built after the initial GitHub push and are not in your copy yet.
Drop this folder's contents into the repo root. Nothing here overwrites an
existing file except `public/portal/app.js`, which adds one field.

```
docs/HBP-Protocol-Complete.md              the four-tier protocol, full detail
docs/HBP-Genetic-Platform-Strategy.md      the genomics and epigenetics roadmap
docs/HBP-Foundational-Model.md             canonical model (may already be there)

database/migrations/016_tiers.sql          tier assignment + tier history
database/migrations/017_program_documents.sql   storage bucket + document registry + RLS

public/portal/program.html                 the Program tab: tier-gated PDF downloads
public/portal/app.js                       adds `tier` to activeMembership() select

program-docs/                              the five PDFs, build.py, README
  tier/pro/HBP-Protocol-PRO.pdf
  tier/advanced/HBP-Protocol-ADVANCED.pdf
  tier/intermediate/HBP-Protocol-INTERMEDIATE.pdf
  tier/beginner/HBP-Protocol-BEGINNER.pdf
  shared/HBP-Dietary-Guidelines.pdf

PROMPT-foundational-model-and-coach.md     the two-job prompt for Claude Code
```

## After copying, give Claude Code this

> New files were just added to the repo. Read ADD-THESE-FILES.md. Then:
> 1. Add the Program tab to the nav on index.html, log.html, labs.html and
>    account.html in public/portal, between Log and Results, matching the
>    markup in program.html. Do not overwrite those files, edit them.
> 2. Run migrations 016 and 017 against Supabase the same way you ran 001
>    through 015.
> 3. Upload the five PDFs from program-docs/ to the program-docs storage
>    bucket at the exact paths in program-docs/README.md.
> 4. Commit everything with a clear message and push.
> 5. Then read PROMPT-foundational-model-and-coach.md and start Job 1. The
>    three wording changes are already done, so skip those and pick up at
>    "run every protocol element through the four questions."
