#!/usr/bin/env python3
"""Every way the anon hole could come back, checked against the live database.

This exists because the hole was not one mistake. Six tables had row level
security off, five views bypassed it, three SECURITY DEFINER functions wrote to
participant records with no authorization check, and the schema's default
privileges were configured to grant the anonymous role full DML on every table
created in future. Fixing the six tables would have left four ways back in.

So this enumerates the population rather than the suspects:

  1. EVERY table in public has row level security on with at least one policy.
  2. EVERY view sets security_invoker, or it reads its base tables with the
     owner's rights and row level security means nothing.
  3. anon holds no table grant and no function EXECUTE.
  4. EVERY SECURITY DEFINER function that writes names an authorization helper.
  5. Default privileges do not hand anon anything on future objects.

Needs SUPABASE_DB_URL. Runs in deploy, not in the commit hook.

--seed <n> deliberately fails check n, to prove the check can fail.
"""
import os, re, subprocess, sys

SEED = None
if '--seed' in sys.argv:
    SEED = int(sys.argv[sys.argv.index('--seed') + 1])

DB = os.environ.get('SUPABASE_DB_URL')
if not DB:
    print('  SUPABASE_DB_URL is not set', file=sys.stderr)
    sys.exit(1)

PSQL = None
for cand in ('psql', '/opt/homebrew/opt/libpq/bin/psql'):
    if subprocess.run(['which', cand], capture_output=True).returncode == 0 or os.path.exists(cand):
        PSQL = cand
        break
if not PSQL:
    print('  psql not found', file=sys.stderr)
    sys.exit(1)

def q(sql):
    r = subprocess.run([PSQL, DB, '-At', '-F', '\x1f', '-c', sql],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        print('  query failed:', r.stderr.strip()[:300], file=sys.stderr)
        sys.exit(1)
    return [l.split('\x1f') for l in r.stdout.strip().split('\n') if l]

problems = []

# 1. Row level security on every table, with at least one policy.
rows = q("""
select c.relname, c.relrowsecurity::text, count(p.polname)::text
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  left join pg_policy p on p.polrelid=c.oid
 where c.relkind='r' group by 1,2 order by 1;""")
for name, rls, npol in rows:
    if SEED == 1 and name == rows[0][0]:
        rls = 'false'
    if rls != 'true':
        problems.append(f'table {name}: row level security is OFF')
    elif npol == '0':
        problems.append(f'table {name}: row level security on but ZERO policies, so nothing can read it and nobody will notice until a screen is empty')

# 2. security_invoker on every view.
views = q("""
select c.relname, coalesce(array_to_string(c.reloptions,','),'')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
 where c.relkind='v' order by 1;""")
for name, opts in views:
    if SEED == 2 and name == views[0][0]:
        opts = ''
    if 'security_invoker=on' not in opts.replace(' ', ''):
        problems.append(f'view {name}: security_invoker is not set, so it bypasses row level security on its base tables')

# 3. anon holds nothing.
n_tbl = q("""select count(*)::text from information_schema.role_table_grants
             where table_schema='public' and grantee='anon';""")[0][0]
if SEED == 3:
    n_tbl = '7'
if n_tbl != '0':
    problems.append(f'anon holds {n_tbl} table grants in public and should hold none')

fns = q("""
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and has_function_privilege('anon', p.oid, 'EXECUTE')
   and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
 order by 1;""")
anon_fns = [f[0] for f in fns if f[0]]
if SEED == 3 and not anon_fns:
    anon_fns = ['is_staff']
if anon_fns:
    problems.append(f'anon can execute {len(anon_fns)} function(s): {", ".join(anon_fns[:6])}')

# 4. Every SECURITY DEFINER function that writes names an authorization helper.
#
#    The pattern matching happens in SQL, not here. The first version selected
#    prosrc and split the output by newline, so eleven functions with multi-line
#    bodies arrived as 361 fragments, the guard scan read fragments instead of
#    functions, and the check reported "361 definer functions all guarded" while
#    being incapable of failing. One row per function is the whole fix.
defs = q(r"""
select p.proname,
       (p.prosrc ~* '(insert[[:space:]]+into|update[[:space:]]+[a-z_]|delete[[:space:]]+from)')::text,
       (p.prosrc ~* '(is_staff[[:space:]]*\(|auth\.uid[[:space:]]*\(|current_role_is[[:space:]]*\(|is_enrolled[[:space:]]*\()')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
 where p.prosecdef
   and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
 order by 1;""")
for name, writes, guarded in defs:
    if SEED == 4 and name == defs[0][0]:
        writes, guarded = 'true', 'false'
    if writes == 'true' and guarded != 'true':
        problems.append(f'function {name}: SECURITY DEFINER, writes, and names no authorization helper')

# 5. Default privileges must not hand anon anything on objects we create.
#    The supabase_admin entry cannot be changed from the postgres role on a
#    managed instance, and migrations run as postgres, so only postgres is
#    enforced here. supabase_admin is reported rather than failed.
acl = q("""select defaclrole::regrole::text, defaclacl::text
             from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace
            where n.nspname='public';""")
for role, a in acl:
    has_anon = 'anon=' in a
    if SEED == 5 and role == 'postgres':
        has_anon = True
    if has_anon:
        if role == 'postgres':
            problems.append('default privileges for postgres grant anon on future objects, so the next migration reopens the hole')
        else:
            print(f'  NOTE: default privileges for {role} still grant anon. '
                  f'Cannot be changed from the postgres role on a managed instance. '
                  f'Migrations run as postgres, so nothing this repository creates is affected.')

if problems:
    print('  RLS CHECK FAILED:', file=sys.stderr)
    for p in problems:
        print('   ', p, file=sys.stderr)
    sys.exit(1)

print(f'  rls ok: {len(rows)} tables all protected, {len(views)} views all security_invoker, '
      f'anon holds nothing, {len(defs)} definer functions all guarded')
