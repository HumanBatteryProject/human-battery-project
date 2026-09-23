# Proposed: counter-evidence, and superseded claims

**Status: proposal. Not implemented. No migration written.**

Two requirements from brief 03, which turn out to be the same shape and should
be built once:

- §3: a claim must be structurally unable to be served without its opposition.
- §4: a withdrawn claim stays visible, marked superseded and linked to what
  replaced it, and no surface serves the superseded version.

---

## Why not a `counter_evidence` column

The obvious version is a text column, or an array of passage ids, on
`knowledge_passages`. It fails the actual requirement. A nullable column is
something a writer can leave empty, and a retrieval query can forget to
select. The brief asks for structurally impossible, not discouraged.

## Proposed shape: a typed relation, plus a serve-time gate

```sql
create type passage_link_kind as enum (
  'counters',      -- B is evidence against A. A may not be served without B.
  'supersedes',    -- B replaces A. A is never served at all.
  'supports'       -- B is evidence for A. Ordinary, no gate.
);

create table passage_links (
  from_passage uuid not null references knowledge_passages(id) on delete cascade,
  to_passage   uuid not null references knowledge_passages(id) on delete cascade,
  kind         passage_link_kind not null,
  note         text,
  created_at   timestamptz not null default now(),
  primary key (from_passage, to_passage, kind),
  constraint passage_links_no_self check (from_passage <> to_passage)
);
```

Plus two columns on `knowledge_passages`:

```sql
requires_counter boolean not null default false,  -- set true for hypothesis rows
superseded_by    uuid references knowledge_passages(id)
```

### What makes it structural rather than advisory

**One.** A row with `requires_counter = true` and no `counters` link is a
broken row, and a deferred constraint trigger refuses the transaction that
leaves it that way. You cannot commit a hypothesis without its opposition in
the same transaction.

**Two.** Retrieval never reads the table. It reads a view:

```sql
create view servable_passages as
  select p.* from knowledge_passages p
   where p.superseded_by is null
     and (not p.requires_counter
          or exists (select 1 from passage_links l
                      where l.from_passage = p.id and l.kind = 'counters'));
```

A superseded passage cannot appear because the view excludes it. A hypothesis
with no counter cannot appear either. **The coach is given no way to query the
base table**, so forgetting is not an available mistake. That is the part that
makes it structural: the failure mode is a missing row, which is loud, rather
than a forgotten join, which is silent.

**Three.** The retrieval function returns a passage together with its counters
in one object, so they cannot be separated downstream. The coach prompt
receives them adjacent, not as two lookups it might do one of.

### Applied to the two cases in the brief

**Seasonal Redox-Mismatch, amended.** The amended claim is
`requires_counter = true`, with five `counters` links: the Togo 2012 factorial
result, strain specificity, inconsistent human photoperiodism, the absence of
any human trial, and the PERIOD2 mechanism finding. The original claim, the one
with the redox limb, keeps its row, gets `superseded_by` pointing at the
amended claim, and drops out of `servable_passages` automatically.

**Structured water as an energy store.** `requires_counter = true`, countered
by the Sterpone and Laage hydration-shell figures and the Luzar and Chandler
picosecond result. Tier `hypothesis`, `is_authors_model` false. The coach's
rule 15 already says decline without calling it disproven; this makes the
reasons available to it rather than relying on the prompt alone.

---

## What I need decided

1. **Is the view-only rule acceptable operationally?** It means no
   `select * from knowledge_passages` in agent code, ever, and a lint would
   need to enforce that. It is the strongest version and also the most
   restrictive.

2. **Does a counter need its own tier and citation, or can it be free text?**
   A typed passage is auditable and slower to write. Free text is fast and
   rots. I would make counters real passages, which means the five counters
   for the seasonal claim are five rows needing five citations, of which only
   Togo is verified today.

3. **Does superseded content stay retrievable for audit?** The brief says a
   withdrawn claim stays visible so the correction can be audited. Visible to
   whom: staff only, or a public changelog? The schema supports both; the
   decision is a product one.

---

## Not in this proposal

The corpus is empty. `knowledge_passages` has zero rows, and there is no
loader. Nothing above can be applied until Phase 3 lands, and building it
before the loader would mean guessing at the loader's shape. This proposal is
written now because brief 03 asked for the shape, not the build.
