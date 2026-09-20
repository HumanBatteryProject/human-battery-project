#!/usr/bin/env python3
"""Structural check on the stylesheets, run before any push that touches CSS.

Why this exists. A single stray closing brace in styles.css silently killed
every rule after it, which collapsed the video slot to zero height and let the
play control escape on top of the logo. Nothing in the build failed, nothing
looked wrong in the diff, and it reached production. The browser does not
report CSS syntax errors, so the check has to be here.

    python3 scripts/check_css.py
"""
import pathlib
import re
import sys

FILES = ['public/styles.css', 'public/portal/portal.css']
ROOT = pathlib.Path(__file__).resolve().parent.parent

# A CSS number: optional sign, digits with optional decimal, or a bare decimal.
NUMBER = r'[+-]?(?:\d+\.?\d*|\.\d+)'
UNIT = r'(?:px|em|rem|%|s|ms|deg|vw|vh|ch|fr)'


def strip_comments(text):
    return re.sub(r'/\*.*?\*/', '', text, flags=re.S)


def check(path):
    raw = (ROOT / path).read_text(encoding='utf-8')
    body = strip_comments(raw)
    problems = []

    depth = 0
    line = 1
    for ch in body:
        if ch == '\n':
            line += 1
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth < 0:
                problems.append(f'unmatched closing brace at line ~{line}')
                depth = 0
    if depth > 0:
        problems.append(f'{depth} unclosed block(s) at end of file')

    # A value that is just a sign, or a unit with no number in front of it.
    # This is what translateX(-px) looked like: valid-ish to the eye, dropped
    # by the parser, and five of them shipped.
    for m in re.finditer(r'[:(,\s](-|\+)' + UNIT + r'\b', body):
        problems.append(f'sign with no number: {m.group(0).strip()!r}')
    for m in re.finditer(r'\(\s*' + UNIT + r'\s*\)', body):
        problems.append(f'unit with no number: {m.group(0)!r}')

    # Empty declarations, another thing a sloppy generator emits.
    for m in re.finditer(r'[a-z-]+:\s*;', body):
        problems.append(f'empty declaration: {m.group(0)!r}')

    return problems


def main():
    bad = 0
    for f in FILES:
        problems = check(f)
        if problems:
            bad += 1
            print(f'{f}: {len(problems)} problem(s)')
            for p in problems[:12]:
                print(f'    {p}')
        else:
            print(f'{f}: ok')
    if bad:
        sys.exit(1)


if __name__ == '__main__':
    main()
