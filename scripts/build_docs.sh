#!/bin/sh
# Rebuild the participant deliverables as PDFs.
#
#   sh scripts/build_docs.sh            every document
#   sh scripts/build_docs.sh tier_doc   one generator
#
# WHY THIS SCRIPT EXISTS. WeasyPrint needs the homebrew graphics libraries
# (glib, pango, cairo, gdk-pixbuf). macOS strips DYLD_* from SIP-protected
# binaries, so the system python3 cannot find them no matter what the
# environment says, and `python3 tier_doc.py` fails with a dlopen error that
# looks like a missing install. A homebrew-python virtualenv can load them.
#
# The tier PDFs went stale for four days because of this: the source had
# changed and the only symptom was a rendering error nobody was running.

set -e
cd "$(git rev-parse --show-toplevel)"

VENV=.venv-docs
PY="$VENV/bin/python"

if [ ! -x "$PY" ]; then
  echo "building $VENV (one time)"
  HOMEBREW_PY=$(command -v /opt/homebrew/bin/python3.12 || command -v /opt/homebrew/bin/python3 || true)
  if [ -z "$HOMEBREW_PY" ]; then
    echo "  No homebrew python found. Install one: brew install python@3.12"
    exit 1
  fi
  "$HOMEBREW_PY" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet weasyprint
fi

# Fail loudly and early rather than per document.
if ! "$PY" -c 'import weasyprint' 2>/dev/null; then
  echo "  weasyprint cannot load its libraries even under $VENV."
  echo "  Install the graphics libraries: brew install glib pango cairo gdk-pixbuf"
  exit 1
fi

DOCS="${1:-tier_doc diet_doc tests_doc first_steps_doc kitchen_doc approvals_doc documents_doc}"

cd program-docs
FAILED=0
for d in $DOCS; do
  printf '  %-18s ' "$d"
  if out=$(../"$PY" "$d.py" 2>&1); then
    # Strip each path, not up to the last slash in the whole line: the greedy
    # form reported one filename when four documents had been written.
    echo "$out" | tr '\n' ' ' | sed 's|[^ ]*/||g'
  else
    echo "FAILED"
    echo "$out" | tail -4 | sed 's/^/      /'
    FAILED=1
  fi
done

exit $FAILED
