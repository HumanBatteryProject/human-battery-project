-- 059: the participation consent, the uploads consent, and enforcement.
--
-- NOT LEGALLY REVIEWED. Master prompt Part G and prerequisite 8 make legal
-- review of the consent text a launch dependency, and this is plain English
-- written to say the true thing, not reviewed language. It is recorded as an
-- owner item. The version string is v1-unreviewed so that the moment reviewed
-- text arrives it becomes v2 and every participant is re-consented, rather than
-- the text changing silently underneath a signature.

insert into consent_documents (kind, version, title, body, body_sha256, is_required, effective_from)
select 'participation', 'v1-unreviewed', 'What this program is, and what it is not',
$body$
Before you start, read this. It is short and it is the honest version.

WHAT THIS IS
The Human Battery Project is a 90 day measured lifestyle program with software
that helps you run it. The software takes the data you give it, compares it to
the program's own written protocol, and each morning suggests one to three small
actions with the reason it picked them. You log what you did. It adjusts inside
limits a human has approved.

WHAT THIS IS NOT
This is wellness support. It is not medical care.

It is not a doctor, it does not diagnose anything, and it does not treat
anything. It cannot tell you what is wrong with you.

Nobody is watching your data in real time. The software runs on a schedule. If
you enter something alarming at two in the morning, no clinician sees it, no
alarm sounds, and nobody calls you. There is no monitoring and there is no
emergency response of any kind.

If something is wrong with you right now, stop reading this and call your
physician or emergency services. Do not wait for a morning brief.

Nothing here replaces your own doctors. If a recommendation here disagrees with
what your physician told you, your physician is right and you should say so to
us.

WHAT WE COLLECT, AND WHY
Your name and email, so we can reach you.
Your ZIP or postal code and country, so the software knows your time zone and
roughly how long your daylight is. We do not ask for a street address and we do
not store one. We never need your precise location.
What you log each day: sleep and wake times, energy, movement, daylight, meal
times, water, and whether you did yesterday's actions. This is what the
suggestions are built from.
Laboratory and fitness results you enter or upload, so the software can show you
what changed over ninety days.
Documents you choose to upload, if you choose to.

We collect these because the program does not work without them. We do not sell
them. We do not put health details in email subject lines.

YOUR DATA IS YOURS
You can export everything we hold about you, at any time, from your account
page. You can ask us to delete it. Deleting your data ends the program, because
the program is the data. Cancelling a payment is not the same as deleting your
data, and we will never treat it as if it were.

RESEARCH IS SEPARATE
Letting us use your data for research is a separate, optional consent that you
can decline or withdraw at any time. It changes nothing about your program.

By continuing you are saying you have read this and you understand that this is
lifestyle software, not medical care, and that nobody is watching.
$body$,
encode(sha256($body$placeholder$body$::bytea), 'hex'),
true, current_date
where not exists (select 1 from consent_documents where kind='participation' and version='v1-unreviewed');

insert into consent_documents (kind, version, title, body, body_sha256, is_required, effective_from)
select 'uploads', 'v1-unreviewed', 'Uploading medical records',
$body$
This consent is separate from the rest on purpose. Uploading a medical record is
a bigger decision than logging your bedtime, so it is asked for on its own and
you can say no to it and still do the whole program.

WHAT YOU CAN UPLOAD
Laboratory reports, imaging reports, visit and treatment notes, and other medical
information you have and want the software to take into account.

WHAT THE SOFTWARE DOES WITH IT
It reads the document and pulls out specific facts: laboratory values with their
units and dates, conditions the document names, medications and doses the
document names, the impression section of an imaging report, and what your
clinician wrote that they recommend.

Every fact it pulls out is shown to you beside the exact passage it came from,
and it is marked unconfirmed. Nothing enters your records and nothing changes
your plan until you confirm it, or until a member of staff confirms it with you.

It never infers anything the document does not say. It does not interpret an
imaging finding beyond repeating it. It does not change a medication, ever.

WHAT IT CHANGES
Confirmed facts change which of the program's approved actions you are eligible
for. If you confirm a medication that the program's screening table flags, the
actions it affects stop being generated and you are told to speak to your
prescriber first. If you confirm a condition, actions that are not safe with it
are excluded, and your plan says which and why.

It only ever removes or unlocks actions from a list a human already approved. It
cannot invent a new one.

WHO CAN SEE IT
You, and program staff. Access to your uploaded documents is logged.

The full document is never sent to the AI vendor. Only the smallest piece of
extracted text needed for a given step is sent.

You can delete an upload at any time, and its extracted facts go with it.

Every recommendation that draws on something you uploaded says the same thing at
the end: consult your physician before starting anything new.
$body$,
encode(sha256($body$placeholder2$body$::bytea), 'hex'),
false, current_date
where not exists (select 1 from consent_documents where kind='uploads' and version='v1-unreviewed');

-- The hash must be of the body that is actually stored, not of a placeholder.
-- Computed in a second statement because the dollar quoted body cannot be
-- referenced twice in one insert without repeating the whole text, and a
-- repeated body is a body that will drift from its own hash.
update consent_documents
   set body_sha256 = encode(sha256(body::bytea), 'hex')
 where version = 'v1-unreviewed';

-- ---------------------------------------------------------------------
-- Enforcement. D1: no member proceeds without it. has_active_consent already
-- answers for ONE kind; this answers the question the portal actually needs,
-- which is "is anything still outstanding".
-- ---------------------------------------------------------------------
create or replace function missing_required_consents(target_client uuid default auth.uid())
returns table (kind consent_kind, version text, title text)
language sql stable security definer set search_path = public as $$
  select cd.kind, cd.version, cd.title
    from consent_documents cd
   where cd.is_required
     and cd.retired_at is null
     and cd.effective_from <= current_date
     and not exists (
       select 1 from client_consents cc
        where cc.client_id = target_client
          and cc.document_id = cd.id
          and cc.granted
          and cc.withdrawn_at is null)
   order by cd.kind;
$$;

revoke execute on function missing_required_consents(uuid) from public;
revoke execute on function missing_required_consents(uuid) from anon;
grant execute on function missing_required_consents(uuid) to authenticated;
grant execute on function missing_required_consents(uuid) to service_role;

comment on function missing_required_consents is
  'What the participant has not agreed to yet. Defaults to the caller, and being '
  'SECURITY DEFINER it must never be called with another participant''s id from '
  'the browser: the grant is to authenticated and the default argument is '
  'auth.uid(), so the normal call is the safe one.';

-- Record a grant. Writing through a function rather than an insert from the
-- browser means the client cannot backdate granted_at or grant on behalf of
-- somebody else.
create or replace function grant_consent(p_document_id uuid, p_granted boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_kind consent_kind;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'message', 'Not signed in.');
  end if;
  select kind into v_kind from consent_documents
   where id = p_document_id and retired_at is null;
  if v_kind is null then
    return jsonb_build_object('ok', false, 'message', 'No such consent document.');
  end if;

  insert into client_consents (client_id, document_id, granted, granted_at)
  values (auth.uid(), p_document_id, p_granted, now())
  on conflict (client_id, document_id) do update
     set granted = excluded.granted,
         granted_at = case when excluded.granted then now() else client_consents.granted_at end,
         withdrawn_at = case when excluded.granted then null else now() end
  returning id into v_id;

  insert into audit_log (actor_id, action, table_name, record_id, subject_id, detail)
  values (auth.uid(), case when p_granted then 'consent.grant' else 'consent.withdraw' end,
          'client_consents', v_id, auth.uid(),
          jsonb_build_object('kind', v_kind, 'document_id', p_document_id));

  return jsonb_build_object('ok', true, 'kind', v_kind, 'granted', p_granted);
end;
$$;

revoke execute on function grant_consent(uuid, boolean) from public;
revoke execute on function grant_consent(uuid, boolean) from anon;
grant execute on function grant_consent(uuid, boolean) to authenticated;
