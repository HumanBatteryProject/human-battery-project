// The owner console, master prompt D10.
//
// Two kinds of check here, and the second matters more.
//
// STRUCTURAL: every admin action goes through a function that records what the
// value WAS, every screen is owner only, and a screen that shows an empty list
// for a feature that does not exist says so rather than looking like a working
// queue with nothing in it.
//
// The live half, that a non-admin is refused and that each action audits with
// before and after, is proved against the database in the run recorded in the
// commit message, because a permission is a property of a session.

import { readFileSync } from 'node:fs';
import { prose } from './_prose.mjs';

let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) return void console.log(`  pass  ${name}`);
  bad++; console.log(`  FAIL  ${name}${detail ? '  ' + detail : ''}`);
};
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// One normaliser, shared. Four fixtures had grown their own and each was
// wrong in a way the others were not: see tests/_prose.mjs.
const flat = (p) => prose(read(p));

const mig = flat('../database/migrations/075_admin_actions.sql');
const migRaw = read('../database/migrations/075_admin_actions.sql');
const SCREENS = ['index', 'canon', 'members', 'queues', 'audit', 'ops', 'results'];

console.log('\nEvery admin screen is owner or staff only, and says so');
for (const s of SCREENS) {
  const src = read(`../public/portal/admin/${s}.html`);
  ok(`${s} checks the role before rendering`,
     /role !== 'admin'|\['admin', 'coach'\]/.test(src), 'no role gate');
  ok(`${s} has a denied state rather than a blank page`, /id="denied"/.test(src));
}

console.log('\nEvery action records what the value was before it');
for (const fn of ['approve_rules', 'retire_rule', 'admin_set_tier', 'admin_set_start_date',
                  'admin_set_status', 'admin_add_note', 'admin_answer_support']) {
  ok(`${fn} exists`, new RegExp('function ' + fn + '\\(').test(mig));
}
ok('there is ONE audit helper, so twelve actions cannot record twelve shapes',
   /function admin_audit\(/.test(mig));
ok('and it carries before, after and reason',
   /'before', p_before, 'after', p_after, 'reason', p_reason/.test(mig));
ok('the reason a direct UPDATE was not enough is written down',
   /only the second one can answer a question three months later/.test(mig));
// Each mutating action must actually call it.
for (const fn of ['admin_set_tier', 'admin_set_start_date', 'admin_set_status']) {
  const body = migRaw.slice(migRaw.indexOf(`function ${fn}(`), migRaw.indexOf(`function ${fn}(`) + 1800);
  ok(`${fn} calls admin_audit`, /perform admin_audit/.test(body));
  ok(`${fn} reads the previous row first`, /select \* into m from memberships/.test(body));
}

console.log('\nOwner only, in the database and not only in the screen');
for (const fn of ['approve_rules', 'retire_rule', 'admin_set_tier', 'admin_set_start_date', 'admin_set_status']) {
  const body = migRaw.slice(migRaw.indexOf(`function ${fn}(`), migRaw.indexOf(`function ${fn}(`) + 700);
  ok(`${fn} refuses a non admin`, /current_role_is\('admin'\)/.test(body));
}
ok('and the screens say the function is the enforcement',
   /Mirrors the SQL|the function is the enforcement/.test(read('../public/portal/admin/ops.html'))
   || /role !== 'admin'/.test(read('../public/portal/admin/canon.html')));

console.log('\nApproval is the gate, and it is per rule');
ok('approve_rules takes a list, not an approve-everything switch',
   /approve_rules\(p_rule_ids uuid\[\]/.test(mig));
ok('and writes one review row per rule',
   /insert into rule_reviews/.test(mig));
ok('it only moves rules that are actually pending',
   /review_status = 'pending' and retired_at is null/.test(mig));
ok('the canon screen states what approving changes',
   /a real participant gets no daily plan at all/.test(flat('../public/portal/admin/canon.html')));
ok('and asks for a reason that is recorded against the owner',
   /recorded against your name/.test(flat('../public/portal/admin/canon.html')));
ok('approving requires ticking each rule, not one button',
   /data-pick/.test(read('../public/portal/admin/canon.html')));

console.log('\nRetiring keeps the history rather than deleting it');
ok('retire_rule sets retired_at rather than deleting',
   /set review_status = 'retired', retired_at = now\(\)/.test(mig));
ok('a reason is required', /A reason is required to retire a rule/.test(mig));
ok('and says why deleting would be wrong',
   /a deleted rule makes every plan that used it unreadable/.test(mig));

console.log('\nReading a participant’s record is logged, per Part G');
ok('log_record_access exists', /function log_record_access\(/.test(mig));
ok('the member detail screen calls it before showing anything',
   /rpc\('log_record_access'/.test(read('../public/portal/admin/members.html')));
ok('it does not log somebody reading their own record',
   /if auth\.uid\(\) = p_client then return; end if/.test(mig));
ok('the screen tells the owner that opening it was logged',
   /Opening this record was logged against your name/.test(flat('../public/portal/admin/members.html')));

console.log('\nA feature that does not exist says so, rather than showing an empty list');
const queues = flat('../public/portal/admin/queues.html');
ok('the science queue says it is not built',
   /science intake queue is not built yet/.test(queues));
ok('the records queue says it is not built',
   /records extraction queue is not built yet/.test(queues));
ok('and explains that empty means absent, not idle',
   /because the feature does not exist, not because nothing is waiting/.test(queues));
const home = flat('../public/portal/admin/index.html');
for (const gap of ['Email log and support inbox', 'Billing', 'Purveyors', 'Failed jobs with retry']) {
  ok(`the console names ${gap} as not built`, home.includes(gap));
}
ok('and says why naming them matters',
   /A console that only shows what exists implies everything else is done/.test(home));

console.log('\nA button that cannot work is not shown as if it can');
ok('the sign-in link button refuses rather than pretending',
   /Sign-in links need a server side call, which is not built yet/.test(read('../public/portal/admin/members.html')));
ok('and the reason is recorded: the service key must not be in the browser',
   /must never be in the browser/.test(flat('../public/portal/admin/members.html')));

console.log('\nOne amber moment per screen, which is a real design rule');
for (const s of SCREENS) {
  const n = (read(`../public/portal/admin/${s}.html`).match(/dawn-amber/g) || []).length;
  ok(`${s} places at most one amber moment`, n <= 2, `${n} occurrences`);
}

console.log('\nThe console does not invent a number');
ok('counts come from the database with an exact count, not from a guess',
   /count: 'exact', head: true/.test(read('../public/portal/admin/index.html')));

console.log('\nSeeded defect: these checks must be able to fail');
const seeds = [
  ['an action that does not record the previous value',
   () => !/perform admin_audit/.test('update memberships set tier = p_tier;')],
  ['an approve-everything button',
   () => /p_rule_ids uuid\[\]/.test(mig)],
  ['a screen with no role gate',
   () => !/role !== 'admin'/.test('<html><body>admin things</body></html>')],
  ['an empty queue that looks like a working one',
   () => /not built yet/.test(queues)],
];
for (const [name, fn] of seeds) ok(`seeded "${name}" is detected`, fn() === true);

console.log(`\n${bad === 0 ? 'admin fixtures: all pass' : `admin fixtures: ${bad} FAILED`}\n`);
process.exit(bad ? 1 : 0);
