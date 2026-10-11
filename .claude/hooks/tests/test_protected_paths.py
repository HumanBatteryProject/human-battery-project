#!/usr/bin/env python3
"""
Cases for .claude/hooks/protected-paths.py.

    python3 .claude/hooks/tests/test_protected_paths.py

Each case runs the hook as a SUBPROCESS with a real payload on stdin, because
that is how the harness runs it. Importing the module and calling main() would
test a function that is not the thing in the loop.

A case states the agent, the tool, the input, and whether the hook should
refuse. `--seed` on the hook is the demonstration a person reads; this is the
assertion a commit has to pass.
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
HOOK = os.path.join(ROOT, ".claude", "hooks", "protected-paths.py")

# Python exits 2 when it cannot open the script, which is the SAME code the
# hook uses to block. One wrong dirname here once made every case read as a
# refusal from a hook that had never run, and the suite looked strict while
# proving nothing. A refusal is now only a refusal when the hook says so.
if not os.path.isfile(HOOK):
    sys.stderr.write("cannot find the hook at %s\n" % HOOK)
    sys.exit(1)

REFUSE, ALLOW = True, False

# (label, agent_type, tool_name, tool_input, expected)
CASES = [
    # ---- the canon ------------------------------------------------------
    ("canon edited by the canon engineer", "canon-engineer", "Edit",
     {"file_path": "docs/HBP-Canonical-Positions.md"}, REFUSE),
    ("canon edited by the lead", "lead-engineer", "Write",
     {"file_path": "docs/HBP-Platform-v2-Spec.md"}, REFUSE),
    ("canon read, not written", "canon-engineer", "Read",
     {"file_path": "docs/HBP-Canonical-Positions.md"}, ALLOW),
    ("canon grepped", "canon-engineer", "Bash",
     {"command": "grep -rn 'omega' docs/"}, ALLOW),
    ("canon written through sed", "canon-engineer", "Bash",
     {"command": "sed -i '' 's/five/six/' docs/HBP-Canonical-Positions.md"}, REFUSE),
    ("canon written through a heredoc", "canon-engineer", "Bash",
     {"command": "cat > docs/HBP-Canonical-Positions.md <<'EOF'\nx\nEOF"}, REFUSE),
    ("canon reached through '..'", "canon-engineer", "Edit",
     {"file_path": "corpus/../docs/HBP-Canonical-Positions.md"}, REFUSE),
    ("canon reached by absolute path", "canon-engineer", "Edit",
     {"file_path": os.path.join(ROOT, "docs", "HBP-Canonical-Positions.md")}, REFUSE),

    # ---- the corpus, which has exactly one owner ------------------------
    ("corpus edited by its owner", "canon-engineer", "Edit",
     {"file_path": "corpus/light.md"}, ALLOW),
    ("corpus edited by the portal engineer", "portal-engineer", "Edit",
     {"file_path": "corpus/light.md"}, REFUSE),
    ("corpus manifest edited by its owner", "canon-engineer", "Write",
     {"file_path": "corpus/manifest.yaml"}, ALLOW),

    # ---- payments, parked ------------------------------------------------
    ("checkout edited by the payments engineer", "payments-engineer", "Edit",
     {"file_path": "functions/api/checkout.js"}, REFUSE),
    ("the webhook edited by the payments engineer", "payments-engineer", "Edit",
     {"file_path": "functions/api/stripe-webhook.js"}, REFUSE),
    ("another function is not parked", "payments-engineer", "Edit",
     {"file_path": "functions/api/_billing.js"}, ALLOW),

    # ---- the legal pages -------------------------------------------------
    ("terms edited by the portal engineer", "portal-engineer", "Edit",
     {"file_path": "public/terms.html"}, REFUSE),
    ("privacy edited by the portal engineer", "portal-engineer", "Edit",
     {"file_path": "public/privacy.html"}, REFUSE),
    ("the disclaimer", "portal-engineer", "Edit",
     {"file_path": "public/disclaimer.html"}, REFUSE),
    ("consumer health data", "portal-engineer", "Edit",
     {"file_path": "public/consumer-health-data.html"}, REFUSE),
    ("an ordinary page is not a legal page", "portal-engineer", "Edit",
     {"file_path": "public/science.html"}, ALLOW),

    # ---- the mark --------------------------------------------------------
    ("the wordmark edited", "portal-engineer", "Edit",
     {"file_path": "public/assets/wordmark.png"}, REFUSE),
    ("the flat ink wordmark", "portal-engineer", "Write",
     {"file_path": "public/assets/wordmark-flat-ink.png"}, REFUSE),
    ("a mark icon", "portal-engineer", "Write",
     {"file_path": "public/assets/mark-512.png"}, REFUSE),
    # The rule the Downloads drop exists to break. See step 0.3 of the brief.
    ("a wordmark copied back in from Downloads", "portal-engineer", "Bash",
     {"command": "cp ~/Downloads/hbp-wordmark.png public/assets/wordmark.png"}, REFUSE),
    ("a non-mark asset", "portal-engineer", "Write",
     {"file_path": "public/assets/hero-bg.png"}, ALLOW),

    # ---- migrations ------------------------------------------------------
    ("a migration that has run", "data-engineer", "Edit",
     {"file_path": "database/migrations/001_foundations.sql"}, REFUSE),
    ("a later migration that has run", "data-engineer", "Edit",
     {"file_path": "database/migrations/085_waitlist.sql"}, REFUSE),
    ("a NEW migration number", "data-engineer", "Write",
     {"file_path": "database/migrations/087_research.sql"}, ALLOW),
    ("a run migration rewritten through the shell", "data-engineer", "Bash",
     {"command": "sed -i '' 's/x/y/' database/migrations/001_foundations.sql"}, REFUSE),

    # ---- secrets ---------------------------------------------------------
    (".dev.vars written", "data-engineer", "Write", {"file_path": ".dev.vars"}, REFUSE),
    (".dev.vars appended through the shell", "data-engineer", "Bash",
     {"command": "echo 'KEY=x' >> .dev.vars"}, REFUSE),

    # ---- read-only agents ------------------------------------------------
    ("a reviewer writes source", "code-reviewer", "Write",
     {"file_path": "functions/api/coach.js"}, REFUSE),
    ("a reviewer edits anything at all", "security-reviewer", "Edit",
     {"file_path": "README.md"}, REFUSE),
    ("the canon reviewer writes", "canon-claims-reviewer", "Write",
     {"file_path": "public/index.html"}, REFUSE),
    ("a reviewer writes its own report", "code-reviewer", "Write",
     {"file_path": "agents/reports/2026-10-11/code-reviewer.md"}, ALLOW),
    ("a reviewer reads", "code-reviewer", "Read",
     {"file_path": "functions/api/coach.js"}, ALLOW),
    ("a reviewer runs a test", "code-reviewer", "Bash",
     {"command": "node --check functions/api/coach.js"}, ALLOW),
    ("a reviewer writes through the shell", "watcher", "Bash",
     {"command": "echo x > functions/api/coach.js"}, REFUSE),
    ("the steward changes a setting file", "steward", "Edit",
     {"file_path": "wrangler.toml"}, REFUSE),
    ("the gatekeeper edits the check it just ran", "gatekeeper", "Edit",
     {"file_path": "scripts/check_claims.py"}, REFUSE),
    ("the compliance officer edits a deliverable", "compliance-officer", "Edit",
     {"file_path": "program-docs/tier_doc.py"}, REFUSE),
    ("the watcher writes its own brief", "watcher", "Write",
     {"file_path": "agents/reports/2026-10-11/watcher.md"}, ALLOW),
    ("the gatekeeper runs the gate", "gatekeeper", "Bash",
     {"command": "sh .githooks/pre-commit"}, ALLOW),
    # The Sentinel is NOT read-only: holding a message is a write. What it may
    # never do is release one, and that is not a path this hook can see.
    ("the sentinel writes a hold", "sentinel", "Write",
     {"file_path": "agents/reports/2026-10-11/sentinel.md"}, ALLOW),
    ("the sentinel still cannot touch the canon", "sentinel", "Edit",
     {"file_path": "docs/HBP-Canonical-Positions.md"}, REFUSE),
    # The off agents. Their switch is a roster line, which this hook cannot
    # see, so what is proved here is only the path half of their limits.
    ("the fixer reaches for payments", "fixer", "Edit",
     {"file_path": "functions/api/checkout.js"}, REFUSE),
    ("the finance agent reaches for the webhook", "finance-agent", "Edit",
     {"file_path": "functions/api/stripe-webhook.js"}, REFUSE),
    ("the support agent reaches for a legal page", "support-agent", "Edit",
     {"file_path": "public/privacy.html"}, REFUSE),

    # ---- the person's own session ---------------------------------------
    ("no agent_type edits the canon", None, "Edit",
     {"file_path": "docs/HBP-Canonical-Positions.md"}, ALLOW),
    ("no agent_type edits a legal page", None, "Edit",
     {"file_path": "public/terms.html"}, ALLOW),
    ("no agent_type edits the mark", None, "Write",
     {"file_path": "public/assets/wordmark.png"}, ALLOW),

    # ---- an engineer doing its actual job -------------------------------
    ("the portal engineer edits a portal screen", "portal-engineer", "Edit",
     {"file_path": "public/portal/log.html"}, ALLOW),
    ("the canon engineer edits the coach", "canon-engineer", "Edit",
     {"file_path": "functions/api/coach.js"}, ALLOW),
    ("the quality engineer edits a fixture", "quality-engineer", "Write",
     {"file_path": "tests/research_fixtures.mjs"}, ALLOW),

    # ---- several targets at once ----------------------------------------
    ("MultiEdit where one target is protected", "canon-engineer", "MultiEdit",
     {"edits": [{"file_path": "functions/api/coach.js"},
                {"file_path": "docs/HBP-Canonical-Positions.md"}]}, REFUSE),
    ("MultiEdit where none is protected", "canon-engineer", "MultiEdit",
     {"edits": [{"file_path": "functions/api/coach.js"},
                {"file_path": "functions/api/_evidence.js"}]}, ALLOW),
]


def run(payload_text):
    p = subprocess.run([sys.executable, HOOK], input=payload_text,
                       capture_output=True, text=True)
    return p.returncode, p.stderr


def refused(code, err):
    """Exit 2 AND the hook's own banner. See the note beside HOOK above."""
    return code == 2 and "BLOCKED by" in err


def main():
    failures = []
    for label, agent, tool, ti, expected in CASES:
        payload = {"tool_name": tool, "tool_input": ti, "cwd": ROOT}
        if agent is not None:
            payload["agent_type"] = agent
        code, err = run(json.dumps(payload))
        did = refused(code, err)
        if did != expected:
            failures.append((label, "expected %s, got %s%s"
                             % ("refuse" if expected else "allow",
                                "refuse" if did else "allow",
                                "" if err.strip() == "" else
                                " [" + err.strip().splitlines()[-1][:70] + "]")))

    # Fail closed. These are not path cases; they are the hook being unable to
    # see a path at all, which must never read as an allowance.
    for label, text in [
        ("unparseable payload", "{not json"),
        ("payload that is not an object", '"a string"'),
        ("empty payload", ""),
    ]:
        code, err = run(text)
        if not refused(code, err):
            failures.append((label, "expected refuse, got exit %d" % code))

    total = len(CASES) + 3
    if failures:
        print("  protected-paths FAILED: %d of %d" % (len(failures), total))
        for label, why in failures:
            print("    %-46s %s" % (label, why))
        return 1
    print("  protected-paths ok: %d cases, %d refusals and %d allowances, "
          "and 3 fail-closed cases"
          % (total, sum(1 for c in CASES if c[4]) + 3,
             sum(1 for c in CASES if not c[4])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
