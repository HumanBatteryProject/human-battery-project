#!/usr/bin/env python3
"""No identity and no health detail in a log line. Part G: "redacted logs."

WHY THIS EXISTS. Cloudflare's logs are readable by anybody with dashboard access
and can be shipped onward, so they are not a private notebook. A log line is the
easiest place in a codebase to leak an identity, because writing one feels like
debugging rather than like handling data. Six log calls in waitlist.js wrote a
participant's email address, one of them alongside their chosen state, the first
three digits of their postal code and their derived region, and one labelled the
address `id=`, which reads as safe and survives review.

WHAT IS CHECKED. Every console.log, console.warn and console.error in server code.
Only the parts that can carry a VALUE are examined: template interpolations and
arguments that are not string literals. A word inside a literal is prose, so
"EMAIL FAILED" is fine and `${email}` is not.

A flagged expression passes if it is wrapped in one of the sanitisers from
_redact.js, because that is the whole point of having them.

--seed proves the check can fail.
"""
import os, re, sys

SEED = '--seed' in sys.argv
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Identifiers that name a person or something they told us or something measured
# about them. Matched as whole words against the expression, so `emailTag` and
# `client_id` do not trip the `email` and `id` entries.
DENIED = [
    'email', 'name', 'full_name', 'phone', 'postal', 'postal_code', 'zip',
    'address', 'body', 'value', 'value_raw', 'symptom', 'symptoms', 'narrative',
    'answer', 'answers', 'question', 'reply', 'note', 'notes', 'content',
    'password', 'token', 'secret', 'jwt', 'apikey', 'api_key', 'detail',
]
# Wrapping any of these makes it safe.
ALLOWED = ['emailTag', 'placeTag', 'scrub', 'tag(', 'redact']

CALL = re.compile(r'console\.(log|warn|error)\s*\(', re.S)

def arguments(text, start):
    """The raw text of one call's arguments, tracking nesting and strings."""
    depth, i, out = 1, start, []
    while i < len(text) and depth:
        c = text[i]
        if c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
            if not depth:
                break
        elif c in '\'"`':
            quote, i = c, i + 1
            out.append(quote)
            while i < len(text) and text[i] != quote:
                if text[i] == '\\':
                    out.append(text[i]); i += 1
                # A template can contain an interpolation, which we DO want.
                out.append(text[i]); i += 1
            out.append(quote)
        out.append(text[i]); i += 1
    return ''.join(out)

def expressions(args):
    """Interpolations, plus arguments that are not plain string literals."""
    found = list(re.findall(r'\$\{([^}]*)\}', args))
    # Strip template and quoted literals, then anything left that is not a bare
    # literal is an expression being logged.
    stripped = re.sub(r'`(?:[^`\\]|\\.)*`', '``', args)
    stripped = re.sub(r"'(?:[^'\\]|\\.)*'", "''", stripped)
    stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
    for part in stripped.split(','):
        part = part.strip()
        if part and part not in ('``', "''", '""') and not re.fullmatch(r'[\d\s]+', part):
            found.append(part)
    return found

problems = []
scanned = 0

for base in ('functions', 'workers'):
    for dirpath, _dirs, files in os.walk(os.path.join(ROOT, base)):
        for fn in files:
            if not fn.endswith('.js'):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT)
            src = open(path, encoding='utf-8').read()
            for m in CALL.finditer(src):
                scanned += 1
                args = arguments(src, m.end())
                line = src[:m.start()].count('\n') + 1
                for expr in expressions(args):
                    if any(a in expr for a in ALLOWED):
                        continue
                    for word in DENIED:
                        if re.search(r'(?<![A-Za-z0-9_])' + re.escape(word) + r'(?![A-Za-z0-9_])', expr):
                            problems.append(f'{rel}:{line} logs `{expr.strip()[:60]}`, which names `{word}`')
                            break

# ---------------------------------------------------------------------
# NOTIFICATION PREVIEWS. Part G: "no health information in notification previews."
#
# The SUBJECT is the preview. It appears on a lock screen, in a notification
# banner, and in an inbox list, all of which are readable by somebody who is near
# the phone rather than holding it. So a subject line is the most public string
# this product produces, and it was carrying a participant's name in two places:
# "New application: {name}" to the owner, and "Onboarding needs a human: {name or
# email}". Both are internal mail to the owner, and both told anybody glancing at
# the screen that a named person had applied to a health program.
#
# A name is not a lab value, and this is not a catastrophe. It is the cheapest
# possible fix: the name belongs in the body, which requires opening the mail.
# ---------------------------------------------------------------------
SUBJECT = re.compile(r"subject:\s*(`[^`]*`|'[^']*'|\"[^\"]*\")", re.S)
# The send() helper in waitlist.js takes the subject positionally, as the third
# argument, so it is matched separately rather than being missed.
POSITIONAL = re.compile(r"send\(\s*\n\s*'[^']*',\s*\n\s*[^,]+,\s*\n\s*(`[^`]*`|'[^']*')", re.S)

subjects = 0
for base in ('functions', 'workers'):
    for dirpath, _dirs, files in os.walk(os.path.join(ROOT, base)):
        for fn in files:
            if not fn.endswith('.js'):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT)
            src = open(path, encoding='utf-8').read()
            for pattern in (SUBJECT, POSITIONAL):
                for m in pattern.finditer(src):
                    literal = m.group(1)
                    subjects += 1
                    line = src[:m.start()].count('\n') + 1
                    for expr in re.findall(r'\$\{([^}]*)\}', literal):
                        if any(a in expr for a in ALLOWED):
                            continue
                        for word in DENIED:
                            if re.search(r'(?<![A-Za-z0-9_])' + re.escape(word) + r'(?![A-Za-z0-9_])', expr):
                                problems.append(
                                    f'{rel}:{line} notification subject interpolates `{expr.strip()[:50]}`, '
                                    f'which names `{word}`. The subject is the lock-screen preview.')
                                break

print(f'  {subjects} notification subject(s) scanned')

if SEED:
    problems.append('seeded: functions/api/example.js:1 logs `${email}`, which names `email`')

print(f'  {scanned} log call(s) scanned in server code')
if problems:
    print('  LOG REDACTION CHECK FAILED:', file=sys.stderr)
    for p in problems:
        print('   ', p, file=sys.stderr)
    print('\n    A log may carry an id, a count, a status, a reason or a duration.',
          file=sys.stderr)
    print('    Wrap an address in emailTag, a region in placeTag, or any untrusted',
          file=sys.stderr)
    print('    string in scrub, all from functions/api/_redact.js.', file=sys.stderr)
    sys.exit(1)
print('  logs ok: no log line and no notification subject names an address, a measured value, or anything a participant typed')
