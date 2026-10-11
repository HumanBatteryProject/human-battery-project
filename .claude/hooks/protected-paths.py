#!/usr/bin/env python3
"""
PreToolUse hook: refuse a write to a protected path by any agent but the one
allowed, and refuse any write at all by a read-only agent.

    python3 .claude/hooks/protected-paths.py          reads a hook payload on stdin
    python3 .claude/hooks/protected-paths.py --seed    demonstrates every refusal

===== WHY THIS EXISTS =======================================================

The agent organization gives twenty three agents the ability to act. Each one
carries a never-allowed list in its own file. A list in a file is a sentence an
agent reads, and a sentence an agent reads is a sentence an agent can talk
itself past. This hook is what turns the load-bearing half of those lists into
a fact about the repository.

It is the second of two layers and not the first. The first is the `tools:`
line in each agent file: an agent with no Edit and no Write cannot write,
whatever it decides. This hook exists because that layer has two holes. Bash can
write without Edit (`sed -i`, a heredoc, `cp`), and an agent that does hold Edit
legitimately, for its own files, must still be stopped at the files that are
not its own.

===== WHAT IDENTIFIES THE AGENT =============================================

`agent_type` on the hook payload, supplied by the harness. It is not read from
the environment and not read from anything the agent writes, so unlike an
environment variable it is not a value the agent can set for itself.

**It is absent in the main conversation.** That is deliberate and it is the
chain of command: the main session is the one the person directing this work
started, and canon, legal text and the mark are his. An agent is a subagent and
carries a name; the person is not an agent and carries none. A payload with no
`agent_type` is therefore allowed through, and that is the only way an edit to
`docs/` or a legal page can happen at all.

Be precise about the limit of that. This hook constrains AGENTS. It is not a
guard against the person, it is not a guard against a human who opens the file
in an editor, and it does not pretend to be either.

===== WHAT IS PROTECTED =====================================================

  docs/                              the canon. No agent writes it, ever.
  corpus/                            canon-engineer only. It becomes the
                                     agents' voice the moment the loader runs.
  functions/api/checkout.js          parked. CLAUDE.md rule 8c: neither file is
  functions/api/stripe-webhook.js    to be edited while payments are parked,
                                     and that includes payments-engineer.
  public/privacy.html                the legal pages. The person's, not an
  public/terms.html                  agent's, and never published by an agent.
  public/disclaimer.html
  public/consumer-health-data.html
  public/assets/wordmark*            the mark files are never edited. The
  public/assets/mark-*               trademark is a separate element and the
                                     logo file is never touched to produce it.
  database/migrations/<existing>     append-only. A file that is already on
                                     disk has run. A NEW number is allowed,
                                     for data-engineer, because that is how a
                                     migration is written.
  .dev.vars                          secrets. Nothing reads or writes it here.

===== THE READ-ONLY AGENTS ==================================================

A reviewer reports and never changes anything. Same for the agents whose whole
job is to look: the Watcher, the Gatekeeper, the Compliance Officer, the
Steward and the security engineer. For those, every write tool is refused
whatever the path, with ONE exception: `agents/reports/`. Every agent writes its
run report there and commits it, including the ones that may change nothing
else. A reviewer that could not write its own report could not report.

===== HOW IT DECIDES ========================================================

Edit, Write, MultiEdit and NotebookEdit name their target in `tool_input`. Bash
does not, so the command string is scanned for a protected path appearing
anywhere alongside anything that could write. That scan is deliberately broad:
a false refusal costs a sentence in a report, and a miss costs the canon.

It FAILS CLOSED. A payload this hook cannot parse is a write whose target it
cannot see, and an unreadable write to an unknown path is refused rather than
waved through. Unexpected exceptions are refusals too, for the same reason.
"""
import json
import os
import re
import sys

HOOK = ".claude/hooks/protected-paths.py"

# ---------------------------------------------------------------------------
# The table. A path prefix, and the set of agents allowed to write under it.
# An empty set means no agent at all; only the person's own session.
# ---------------------------------------------------------------------------
PROTECTED = [
    ("docs/", frozenset(), "the canon. Only the person directing this work changes it"),
    ("corpus/", frozenset({"canon-engineer"}),
     "corpus sources become the agents' voice when the loader runs"),
    ("functions/api/checkout.js", frozenset(),
     "payments are parked, CLAUDE.md rule 8c"),
    ("functions/api/stripe-webhook.js", frozenset(),
     "payments are parked, CLAUDE.md rule 8c"),
    ("public/privacy.html", frozenset(), "a legal page"),
    ("public/terms.html", frozenset(), "a legal page"),
    ("public/disclaimer.html", frozenset(), "a legal page"),
    ("public/consumer-health-data.html", frozenset(), "a legal page"),
    (".dev.vars", frozenset(), "secrets"),
]

# Matched on the basename, because the mark ships under several names.
MARK_FILE = re.compile(r"^(wordmark|mark-|og-card|lockup)", re.I)
MARK_DIR = "public/assets/"

MIGRATIONS_DIR = "database/migrations/"

# Agents that may change nothing. They may still write their own run report.
READ_ONLY_AGENTS = frozenset({
    "code-reviewer",
    "security-reviewer",
    "canon-claims-reviewer",
    "security-engineer",
    "watcher",
    "gatekeeper",
    "compliance-officer",
    "steward",
})
REPORTS_DIR = "agents/reports/"

WRITE_TOOLS = frozenset({"Edit", "Write", "MultiEdit", "NotebookEdit"})

# Anything in a shell command that could put bytes into a file. Broad on
# purpose: see the module docstring.
BASH_WRITE = re.compile(
    r"(>>?|"
    r"\bsed\b[^|;&]*-[a-zA-Z]*i|"
    r"\b(tee|cp|mv|rm|rmdir|truncate|install|dd|ln|chmod|chown|touch|shred)\b|"
    r"\b(git)\s+(checkout|restore|reset|clean|apply|rm|mv)\b|"
    r"\bpatch\b|"
    r"\b(python3?|perl|ruby|node)\b[^|;&]*-[ce]\b)",
    re.I,
)


def refuse(reason):
    """Exit 2 is the blocking code for PreToolUse. stderr carries the reason."""
    sys.stderr.write("BLOCKED by %s\n\n%s\n" % (HOOK, reason))
    return 2


def repo_root():
    here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return here


def relative(path, cwd):
    """
    The path as the repository sees it, or None when it is outside the repo.

    A '..' COMPONENT is refused by the caller before this runs. Resolving it
    here instead would let `docs/../docs/HBP-Canonical-Positions.md` land on a
    protected file by a route the table does not spell.
    """
    if not path:
        return None
    root = repo_root()
    p = path if os.path.isabs(path) else os.path.join(cwd or root, path)
    p = os.path.normpath(p)
    try:
        rel = os.path.relpath(p, root)
    except ValueError:
        return None
    if rel.startswith(".." + os.sep) or rel == "..":
        return None
    return rel.replace(os.sep, "/")


def has_dotdot(path):
    return any(part == ".." for part in re.split(r"[\\/]+", path or ""))


def migration_has_run(rel):
    """
    A migration file already on disk has run. A new number has not.

    The question is asked of the filesystem and not of a list in this file,
    because a list would be a snapshot and migrations are added every week.
    """
    if not rel.startswith(MIGRATIONS_DIR):
        return False
    return os.path.exists(os.path.join(repo_root(), rel))


def is_mark_file(rel):
    if not rel.startswith(MARK_DIR):
        return False
    return bool(MARK_FILE.match(os.path.basename(rel)))


def check_path(rel, agent):
    """The reason this path is refused for this agent, or None to allow."""
    if rel is None:
        return None

    if is_mark_file(rel):
        return ("%s is a mark file. The logo files are never edited, recoloured, "
                "outlined or stretched, and the trademark is a separate element "
                "placed with mark() from program-docs/design.py." % rel)

    if migration_has_run(rel):
        return ("%s is a migration that has already run. Migrations are "
                "append-only: write a NEW file at the next free number instead "
                "of editing this one. CLAUDE.md rule 2." % rel)

    for prefix, owners, why in PROTECTED:
        hit = rel == prefix or (prefix.endswith("/") and rel.startswith(prefix))
        if not hit:
            continue
        if agent in owners:
            return None
        if owners:
            return ("%s is protected: %s. Only %s may write it, and this is %s."
                    % (rel, why, " or ".join(sorted(owners)), agent))
        return ("%s is protected: %s. No agent may write it. Send it up as an "
                "approval request instead of editing it." % (rel, why))
    return None


def targets_from_tool(tool, ti):
    """Every path this tool call would write."""
    out = []
    if tool in ("Edit", "Write", "MultiEdit"):
        for key in ("file_path", "notebook_path", "path"):
            if ti.get(key):
                out.append(ti[key])
        for edit in ti.get("edits") or []:
            if isinstance(edit, dict) and edit.get("file_path"):
                out.append(edit["file_path"])
    elif tool == "NotebookEdit":
        for key in ("notebook_path", "file_path"):
            if ti.get(key):
                out.append(ti[key])
    return out


def bash_refusal(command, agent):
    """
    A shell command that could write to a protected path.

    Both halves have to be true: the command mentions a protected path AND it
    contains something that could write. `grep -r TODO docs/` is a read and is
    allowed; `sed -i s/x/y/ docs/HBP-Canonical-Positions.md` is not.
    """
    if not command:
        return None
    if not BASH_WRITE.search(command):
        return None

    names = [p for p, _o, _w in PROTECTED]
    names += [MARK_DIR + "wordmark", MARK_DIR + "mark-", MIGRATIONS_DIR]
    for name in names:
        if name not in command:
            continue
        if name == MIGRATIONS_DIR:
            # Only refuse when the command names a migration that exists.
            for token in re.findall(r"[\w./-]*database/migrations/[\w.-]+", command):
                rel = token[token.index(MIGRATIONS_DIR):]
                if migration_has_run(rel):
                    return check_path(rel, agent)
            continue
        probe = name if not name.endswith("/") else name + "x"
        reason = check_path(probe if name.endswith("/") else name, agent)
        if reason:
            return ("a shell command that could write to %s was refused.\n\n%s\n\n"
                    "The command was:\n  %s" % (name, reason, command.strip()[:400]))
    return None


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception:
        return refuse("the hook payload was not readable JSON, so the write's "
                      "target could not be seen. Failing closed.")
    if not isinstance(payload, dict):
        return refuse("the hook payload was not an object. Failing closed.")

    tool = payload.get("tool_name") or ""
    ti = payload.get("tool_input")
    ti = ti if isinstance(ti, dict) else {}
    agent = payload.get("agent_type")

    # The person's own session carries no agent_type. See the docstring.
    if not agent:
        return 0

    is_write = tool in WRITE_TOOLS
    if not is_write and tool != "Bash":
        return 0

    # ---- read-only agents -------------------------------------------------
    if agent in READ_ONLY_AGENTS:
        if is_write:
            paths = [relative(p, payload.get("cwd")) for p in targets_from_tool(tool, ti)]
            if paths and all(p and p.startswith(REPORTS_DIR) for p in paths):
                return 0
            return refuse(
                "%s is a read-only agent and may not write.\n\n"
                "It reports; it never changes anything. The only path it may "
                "write is %s<date>/%s.md, its own run report.\n\n"
                "Tool: %s  Target: %s"
                % (agent, REPORTS_DIR, agent, tool,
                   ", ".join(p or "?" for p in paths) or "(none named)"))
        cmd = ti.get("command") or ""
        if BASH_WRITE.search(cmd) and REPORTS_DIR not in cmd:
            return refuse(
                "%s is a read-only agent and may not write.\n\n"
                "This shell command could put bytes into a file. A read-only "
                "agent runs checks and reads; it does not change the tree.\n\n"
                "The command was:\n  %s" % (agent, cmd.strip()[:400]))
        return 0

    # ---- everyone else, against the table ---------------------------------
    if is_write:
        for raw_path in targets_from_tool(tool, ti):
            if has_dotdot(raw_path):
                return refuse(
                    "a target path with a '..' component is refused outright, "
                    "whatever it names, because the table spells paths and '..' "
                    "is how a protected file is reached by a name the table "
                    "does not carry.\n\n  %s" % raw_path)
            reason = check_path(relative(raw_path, payload.get("cwd")), agent)
            if reason:
                return refuse(reason)
        return 0

    reason = bash_refusal(ti.get("command") or "", agent)
    if reason:
        return refuse(reason)
    return 0


# ---------------------------------------------------------------------------
# --seed. The same idea as scripts/check_logo.py --seed: a check that has never
# refused anything is not evidence that nothing needed refusing.
# ---------------------------------------------------------------------------
SEED_CASES = [
    ("canon-engineer", "Edit", {"file_path": "docs/HBP-Canonical-Positions.md"},
     "an engineer edits the canon"),
    ("portal-engineer", "Edit", {"file_path": "public/assets/wordmark.png"},
     "an engineer edits a mark file"),
    ("code-reviewer", "Write", {"file_path": "functions/api/coach.js"},
     "a reviewer writes a file"),
    ("payments-engineer", "Edit", {"file_path": "functions/api/checkout.js"},
     "an engineer edits parked payments code"),
    ("data-engineer", "Edit", {"file_path": "database/migrations/001_foundations.sql"},
     "an engineer edits a migration that has run"),
    ("portal-engineer", "Edit", {"file_path": "public/terms.html"},
     "an engineer edits a legal page"),
    ("canon-engineer", "Bash",
     {"command": "sed -i '' s/x/y/ docs/HBP-Canonical-Positions.md"},
     "the same edit attempted through the shell"),
    ("lead-engineer", "Write", {"file_path": "docs/../docs/HBP-Platform-v2-Spec.md"},
     "a protected path reached through '..'"),
    ("watcher", "Bash", {"command": "echo broken > functions/api/coach.js"},
     "a read-only agent writes through the shell"),
]
SEED_ALLOWED = [
    ("canon-engineer", "Edit", {"file_path": "corpus/light.md"},
     "the canon engineer edits the corpus it owns"),
    ("data-engineer", "Write", {"file_path": "database/migrations/087_research.sql"},
     "a NEW migration number"),
    ("code-reviewer", "Write", {"file_path": "agents/reports/2026-10-11/code-reviewer.md"},
     "a read-only agent writes its own report"),
    (None, "Edit", {"file_path": "docs/HBP-Canonical-Positions.md"},
     "the person's own session, which carries no agent_type"),
    ("canon-engineer", "Bash", {"command": "grep -rn TODO docs/"},
     "reading the canon, which is not writing it"),
]


def seed():
    import subprocess
    print("  protected-paths --seed: every refusal, demonstrated\n")
    bad = 0
    for agent, tool, ti, label in SEED_CASES:
        payload = {"tool_name": tool, "tool_input": ti, "agent_type": agent,
                   "cwd": repo_root()}
        p = subprocess.run([sys.executable, os.path.abspath(__file__)],
                           input=json.dumps(payload), capture_output=True, text=True)
        ok = p.returncode == 2
        bad += 0 if ok else 1
        first = (p.stderr.strip().splitlines() or [""])[-1][:96]
        print("    %-7s %-28s %s" % ("REFUSED" if ok else "LET BY", label, first))
    print()
    for agent, tool, ti, label in SEED_ALLOWED:
        payload = {"tool_name": tool, "tool_input": ti, "cwd": repo_root()}
        if agent:
            payload["agent_type"] = agent
        p = subprocess.run([sys.executable, os.path.abspath(__file__)],
                           input=json.dumps(payload), capture_output=True, text=True)
        ok = p.returncode == 0
        bad += 0 if ok else 1
        print("    %-7s %-28s %s" % ("ALLOWED" if ok else "REFUSED", label,
                                     "" if ok else p.stderr.strip()[:96]))
    print()
    if bad:
        print("  %d case(s) did not behave as the table says. This is a failure." % bad)
        return 1
    print("  %d refusals and %d allowances, all as the table says."
          % (len(SEED_CASES), len(SEED_ALLOWED)))
    return 0


def guarded_main():
    """Any unhandled exception is a refusal, never an accidental allowance."""
    try:
        return main()
    except Exception as exc:
        return refuse("this hook raised %s: %s.\n\nAn unexpected error is "
                      "reported as a refusal and not as an allowance, because "
                      "the write's target could not be checked."
                      % (type(exc).__name__, exc))


if __name__ == "__main__":
    if "--seed" in sys.argv:
        sys.exit(seed())
    sys.exit(guarded_main())
