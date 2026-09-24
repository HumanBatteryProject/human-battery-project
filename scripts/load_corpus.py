#!/usr/bin/env python3
"""Load the program's own material into knowledge_passages.

    python3 scripts/load_corpus.py            # load and embed
    python3 scripts/load_corpus.py --dry-run  # chunk and report, write nothing
    python3 scripts/load_corpus.py --no-embed # write rows, skip the API call

WHAT IT LOADS, AND NOTHING ELSE
-------------------------------
corpus/book/book_rev318.md and the source text of the eleven deliverables.
No web content, no external papers, no notes. The corpus is the program's own
material, which is what keeps the coach inside it.

IDEMPOTENT ON CONTENT, NOT ON ORDER
-----------------------------------
Every passage carries sha256 of its own text. A rerun after a manuscript
revision updates the passages whose text changed and leaves the rest alone,
including their embeddings, so re-running is cheap and a revision does not
re-embed the whole book.

TIERS ARE READ, NOT INFERRED
----------------------------
The book states its own standing for each claim in the "Where the evidence
stands in this chapter" tables. Those tables are parsed and the standing is
matched to a passage by the claim text appearing in it. Where the book does not
tier a claim, the passage gets `unsupported`, which is deliberate: the coach may
quote it as context and may never present it as established.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- constants
# DECISION LEFT TO THE OWNER. Safe values set here and listed in the report.
EMBED_MODEL      = "voyage-3"     # one model, recorded on every row
EMBED_VERSION    = "2024-09"      # pinned so a silent upgrade is visible
EMBED_DIM        = 1024
CHUNK_MIN_WORDS  = 150            # brief 06 section 3
CHUNK_MAX_WORDS  = 400
BOOK_PATH        = ROOT / "corpus" / "book" / "book_rev318.md"

# DECISION LEFT TO THE OWNER. How much of a claim's distinctive wording has to
# appear in a passage before the book's standing for that claim is applied to
# it. Matching on literal substring was the first attempt and left 92 percent
# of passages untiered, because the book's tables SUMMARISE claims rather than
# quoting the prose. Overlap is still reading the book rather than inferring a
# tier, but the threshold is a judgement and it is set conservatively: high
# enough that a passage only inherits a standing when it is plainly about that
# claim, which errs toward `unsupported`, which is the safe direction.
TIER_MATCH_THRESHOLD = 0.60
STOPWORDS = set("""a an the of to in on for and or is are was were be been being
that this those these it its as at by with from than then so such not no any all
can may might will would should could does do did have has had more most less
least other another each both few many much very own same s t just now""".split())

# The book's own standing vocabulary, mapped onto the evidence_tier enum.
# Longest pattern first: "well established as an association" must not be eaten
# by "well established".
TIER_RULES = [
    (r"not supported|no supporting evidence|not established|no\. it is",  "unsupported"),
    (r"my working model|my idea|my own model|author'?s model",            "hypothesis"),
    (r"hypothes",                                                         "hypothesis"),
    (r"contested|argued about|disputed|debated",                          "contested"),
    (r"emerging",                                                         "emerging"),
    (r"strong",                                                           "strong"),
    (r"well[- ]established|well established",                             "established"),
]
AUTHORS_MODEL = re.compile(r"my working model|my idea|my own model|author'?s model", re.I)

DIMENSION_CUES = {
    "flow":        r"\bfuel handling|substrate switch|metabolic flexib|glycaemi|glycemi|insulin|hba1c|triglyceride",
    "capacity":    r"\bvo2|vo₂|aerobic capacity|grip strength|sit-to-stand|walking speed|balance\b",
    "timing":      r"\bcircadian|clock|sleep timing|wake time|meal timing|regularity|hrv|heart rate recovery",
    "structure":   r"\bmembrane composition|omega-3 index|dha\b|epa\b|red cell membrane",
    "environment": r"\bmorning light|light exposure|first meal|last meal|daylight|sun exposure",
}


def sha(s):
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ------------------------------------------------------------------ parsing
def parse_book(text):
    """Walk H1 part -> H2 chapter -> H3 section, keeping the text under each."""
    part = chapter = section = None
    buf, out = [], []

    def flush():
        if buf and chapter:
            body = "\n".join(buf).strip()
            if body:
                out.append(dict(part=part, chapter=chapter, section=section, body=body))
        buf.clear()

    for line in text.split("\n"):
        m = re.match(r"^(#{1,3})\s+(.*)$", line)
        if m:
            level, title = len(m.group(1)), m.group(2).strip()
            flush()
            if level == 1:
                part, chapter, section = title, None, None
            elif level == 2:
                chapter, section = title, None
            else:
                section = title
            continue
        buf.append(line)
    flush()
    return out


def parse_standings(text):
    """The book's own claim -> standing tables. Returns [(claim, tier, authors)]."""
    out = []
    for block in re.finditer(
            r"###\s*Where the evidence stands[^\n]*\n(.*?)(?=\n#{1,3}\s|\Z)", text, re.S | re.I):
        for row in re.finditer(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$", block.group(1), re.M):
            claim, standing = row.group(1).strip(), row.group(2).strip()
            if claim.lower() in ("claim", "") or set(claim) <= set("- :"):
                continue
            out.append((claim, tier_of(standing), bool(AUTHORS_MODEL.search(standing))))
    return out


def tier_of(standing):
    s = standing.lower()
    for pat, tier in TIER_RULES:
        if re.search(pat, s):
            return tier
    return "unsupported"


def split_passages(body, min_w=CHUNK_MIN_WORDS, max_w=CHUNK_MAX_WORDS):
    """Blocks -> passages of min..max words, ending on a sentence.

    A table, a list or a figure caption is never separated from the paragraph
    that introduces it: those blocks are glued to the previous block before any
    size rule is applied, so the size rule can never be the thing that splits
    them.
    """
    raw = [b.strip() for b in re.split(r"\n\s*\n", body) if b.strip()]
    blocks = []
    for b in raw:
        glue = (b.startswith("|") or re.match(r"^\s*[-*+]\s", b)
                or re.match(r"^\s*\d+\.\s", b) or b.lower().startswith("figure"))
        if glue and blocks:
            blocks[-1] = blocks[-1] + "\n\n" + b
        else:
            blocks.append(b)

    passages, cur = [], []

    def words(x):
        return len(" ".join(x).split())

    for b in blocks:
        if words(cur) >= min_w and words(cur) + len(b.split()) > max_w:
            passages.append("\n\n".join(cur))
            cur = []
        cur.append(b)
        # a single block over the ceiling is cut on sentence ends, never mid-sentence
        while words(cur) > max_w:
            joined = "\n\n".join(cur)
            if "|" in joined or re.search(r"^\s*[-*+]\s", joined, re.M):
                break                                   # do not cut a table or list
            sents = re.split(r"(?<=[.!?])\s+", joined)
            take, n = [], 0
            for s in sents:
                if n + len(s.split()) > max_w and take:
                    break
                take.append(s); n += len(s.split())
            if len(take) == len(sents):
                break
            passages.append(" ".join(take))
            cur = [" ".join(sents[len(take):])]
    if cur:
        passages.append("\n\n".join(cur))
    return [p for p in passages if p.strip()]


def dimension_of(text):
    t = text.lower()
    best, hits = None, 0
    for dim, pat in DIMENSION_CUES.items():
        n = len(re.findall(pat, t))
        if n > hits:
            best, hits = dim, n
    return best


def markers_in(text, canonical):
    """Only markers the passage NAMES. Never inferred, never guessed."""
    t = text.lower()
    found = []
    for slug, names in canonical.items():
        if any(re.search(r"\b%s\b" % re.escape(n.lower()), t) for n in names):
            found.append(slug)
    return sorted(found)


REF = re.compile(r"\[(\d{1,3})\]|\(ref\.?\s*(\d{1,3})\)")


def reference_ids(text):
    return sorted({m.group(1) or m.group(2) for m in REF.finditer(text)})


# ---------------------------------------------------------------- embedding
def embed(texts, key):
    req = urllib.request.Request(
        "https://api.voyageai.com/v1/embeddings",
        data=json.dumps({"input": texts, "model": EMBED_MODEL,
                         "input_type": "document"}).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return [d["embedding"] for d in json.load(r)["data"]]


# ------------------------------------------------------------------- db i/o
PSQL_DIRS = ["/opt/homebrew/opt/libpq/bin", "/opt/homebrew/opt/postgresql@16/bin",
             "/usr/local/opt/libpq/bin", "/usr/bin"]


def pg(dburl):
    import subprocess
    env = dict(os.environ)
    env["PATH"] = ":".join(PSQL_DIRS) + ":" + env.get("PATH", "")
    def run(sql, *params):
        args = ["psql", dburl, "-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "\x1f", "-c", sql]
        r = subprocess.run(args, capture_output=True, text=True, env=env)
        if r.returncode:
            raise RuntimeError(r.stderr.strip()[:500])
        return [l.split("\x1f") for l in r.stdout.strip().split("\n") if l.strip()]
    return run


def canonical_markers(run):
    """slug -> the names a passage might use for it. Only markers with a
    canonical Chapter 21 role; an unmapped alias is never guessed into one."""
    rows = run("select slug, name from lab_markers where role is not null order by slug;")
    out = {}
    for slug, name in rows:
        alt = {slug.replace("-", " "), name.lower()}
        if slug == "hba1c":         alt |= {"hba1c", "a1c"}
        if slug == "omega3-index":  alt |= {"omega-3 index", "omega 3 index"}
        if slug == "trig-hdl-ratio":alt |= {"triglyceride to hdl", "triglyceride-to-hdl"}
        if slug == "insulin-fasting": alt |= {"fasting insulin"}
        if slug == "hs-crp":        alt |= {"hs-crp", "c-reactive protein"}
        out[slug] = sorted(a for a in alt if len(a) > 3)
    return out


def deliverable_sources():
    """The eleven deliverables, from their SOURCE, never from tool output."""
    out = []
    for p in sorted((ROOT / "program-docs").glob("*.py")):
        if p.stem == "design":
            continue
        txt = p.read_text(encoding="utf-8")
        txt = re.sub(r"^\s*#.*$", " ", txt, flags=re.M)     # code comments out
        txt = re.sub(r"<[^>]+>", " ", txt)                  # html tags out
        txt = re.sub(r"[ \t]+", " ", txt)
        out.append(("deliverable", p.stem, txt))
    md = ROOT / "docs" / "HBP-Protocol-Complete.md"
    out.append(("deliverable", "protocol-complete", md.read_text(encoding="utf-8")))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-embed", action="store_true")
    a = ap.parse_args()

    dburl = None
    for line in (ROOT / ".dev.vars").read_text(encoding="utf-8").split("\n"):
        if line.startswith("SUPABASE_DB_URL="):
            dburl = line.split("=", 1)[1].strip().strip('"')
    run = pg(dburl)
    canon = canonical_markers(run) if not a.dry_run else {}

    book = BOOK_PATH.read_text(encoding="utf-8")
    standings = parse_standings(book)
    print("book: %d claim/standing rows parsed from its own tables" % len(standings))

    units = []
    for sec in parse_book(book):
        for i, p in enumerate(split_passages(sec["body"])):
            units.append(dict(kind="book", source="book_rev318", part=sec["part"],
                              chapter=sec["chapter"], section=sec["section"],
                              ord=len(units), passage=p))
    nbook = len(units)
    for kind, name, txt in deliverable_sources():
        for p in split_passages(txt):
            units.append(dict(kind=kind, source=name, part=None, chapter=name,
                              section=None, ord=len(units), passage=p))

    # tag
    for u in units:
        u["content_sha"] = sha(u["passage"])
        u["word_count"] = len(u["passage"].split())
        u["dimension"] = dimension_of(u["passage"])
        u["markers"] = markers_in(u["passage"], canon) if canon else []
        u["reference_ids"] = reference_ids(u["passage"])
        tier, authors, best = "unsupported", False, 0.0
        low = u["passage"].lower()
        words = set(re.findall(r"[a-z0-9-]+", low))
        for claim, t, am in standings:
            key = [w for w in re.findall(r"[a-z0-9-]+", claim.lower())
                   if w not in STOPWORDS and len(w) > 2]
            if len(key) < 3:
                continue
            frac = sum(1 for w in key if w in words) / len(key)
            if frac >= TIER_MATCH_THRESHOLD and frac > best:
                tier, authors, best = t, am, frac
        u["evidence_tier"] = tier
        u["is_authors_model"] = authors

    # report
    import collections
    per_chapter = collections.Counter(u["chapter"] for u in units if u["kind"] == "book")
    per_source = collections.Counter(u["source"] for u in units)
    print("\npassages: %d total, %d from the book, %d from the deliverables"
          % (len(units), nbook, len(units) - nbook))
    print("\nby source:")
    for s, n in per_source.most_common():
        print("  %-28s %d" % (s[:28], n))
    print("\nby chapter:")
    empty = []
    for ch, n in sorted(per_chapter.items(), key=lambda x: str(x[0])):
        print("  %-58s %d" % (str(ch)[:58], n))
        if n == 0:
            empty.append(ch)
    # a chapter the book HAS that produced nothing is a loader failure
    have = {m.group(1).strip() for m in re.finditer(r"^## (.*)$", book, re.M)}
    missing = sorted(c for c in have if per_chapter.get(c, 0) == 0)
    if missing:
        print("\nFAIL: %d chapter(s) yielded zero passages: %s" % (len(missing), missing))
        return 1
    print("\nevery chapter yielded at least one passage")
    tiers = collections.Counter(u["evidence_tier"] for u in units)
    print("tiers: %s" % dict(tiers))
    print("passages naming a marker: %d" % sum(1 for u in units if u["markers"]))
    print("passages with a dimension: %d" % sum(1 for u in units if u["dimension"]))

    if a.dry_run:
        print("\ndry run, nothing written")
        return 0

    key = None
    for line in (ROOT / ".dev.vars").read_text(encoding="utf-8").split("\n"):
        if line.startswith("VOYAGE_API_KEY="):
            key = line.split("=", 1)[1].strip().strip('"')

    # sources
    src_ids = {}
    for s in sorted(per_source):
        # knowledge_sources_kind_check allows doc | program_doc |
        # citation_summary. The book is a doc, the eleven are program_doc.
        kind = "doc" if s == "book_rev318" else "program_doc"
        body = "".join(u["passage"] for u in units if u["source"] == s)
        run("""insert into knowledge_sources (kind,title,repo_path,evidence_tier,content_sha)
                values ('{k}','{t}','{rp}','established','{s}')
                on conflict do nothing;""".format(
                    k=kind, t=s.replace("'", "''"), s=sha(body),
                    rp=("corpus/book/book_rev318.md" if s == "book_rev318"
                        else ("docs/HBP-Protocol-Complete.md" if s == "protocol-complete"
                              else "program-docs/%s.py" % s))))
        # repo_path is UNIQUE. Writing the literal 'corpus' for every source
        # meant the first insert took the value and every other source silently
        # hit the conflict clause and was skipped, leaving one row where there
        # should have been eight.
        # Always read the id back with a SELECT. `insert ... returning` prints
        # the command tag "INSERT 0 0" when the conflict clause skips the row,
        # and that tag was being parsed as a uuid.
        got = run("select id from knowledge_sources where title='%s' limit 1;"
                  % s.replace("'", "''"))
        assert got and re.match(r"^[0-9a-f-]{36}$", got[0][0]), \
            "no source id for %s, got %r" % (s, got)
        src_ids[s] = got[0][0]

    # passages, keyed on content hash
    existing = {r[0] for r in run("select content_sha from knowledge_passages where content_sha is not null;")}
    fresh = [u for u in units if u["content_sha"] not in existing]
    print("\n%d passage(s) new or changed, %d unchanged and left alone"
          % (len(fresh), len(units) - len(fresh)))

    vecs = {}
    if fresh and not a.no_embed and key:
        for i in range(0, len(fresh), 96):
            batch = fresh[i:i + 96]
            for u, v in zip(batch, embed([b["passage"] for b in batch], key)):
                vecs[u["content_sha"]] = v
            print("  embedded %d/%d" % (min(i + 96, len(fresh)), len(fresh)))

    import subprocess, tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as fh:
        fh.write("begin;\n")
        for u in fresh:
            v = vecs.get(u["content_sha"])
            fh.write(
                "insert into knowledge_passages "
                "(source_id,ord,passage,evidence_tier,is_authors_model,part,chapter,section,"
                " dimension,markers,reference_ids,content_sha,embed_model,embed_version,"
                " word_count,embedding) values ("
                "'{sid}',{ord},$p${p}$p$,'{tier}',{am},{part},{chap},{sec},{dim},"
                "'{{{mk}}}','{{{rf}}}','{sha}','{em}','{ev}',{wc},{vec});\n".format(
                    sid=src_ids[u["source"]], ord=u["ord"], p=u["passage"],
                    tier=u["evidence_tier"], am=str(u["is_authors_model"]).lower(),
                    part="$q$%s$q$" % u["part"] if u["part"] else "null",
                    chap="$q$%s$q$" % u["chapter"] if u["chapter"] else "null",
                    sec="$q$%s$q$" % u["section"] if u["section"] else "null",
                    dim="'%s'" % u["dimension"] if u["dimension"] else "null",
                    mk=",".join(u["markers"]), rf=",".join(u["reference_ids"]),
                    sha=u["content_sha"], em=EMBED_MODEL, ev=EMBED_VERSION,
                    wc=u["word_count"],
                    vec="'[%s]'" % ",".join("%.6f" % x for x in v) if v else "null"))
        fh.write("commit;\n")
        path = fh.name
    env = dict(os.environ)
    env["PATH"] = ":".join(PSQL_DIRS) + ":" + env.get("PATH", "")
    r = subprocess.run(["psql", dburl, "-v", "ON_ERROR_STOP=1", "-q", "-f", path],
                       capture_output=True, text=True, env=env)
    if r.returncode:
        print("LOAD FAILED: %s" % r.stderr.strip()[:600]); return 1
    total = run("select count(*) from knowledge_passages;")[0][0]
    print("loaded. knowledge_passages now holds %s row(s)" % total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
