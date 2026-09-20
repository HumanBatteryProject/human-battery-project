-- 027: publish the counsel-approved consent documents.
--
-- consent_documents was empty. Nothing had ever been published, so this is
-- a first publication rather than a new version over an existing row, and
-- the never-edit-in-place rule from 003 is satisfied by there being
-- nothing to edit. The insert below is still written as a publish: if a
-- row for a kind already exists it is retired and a new version is added,
-- never updated, so re-running this file cannot rewrite a document a
-- client has already consented to.
--
-- body is the approved wording from the four pages in public/, taken
-- verbatim. Link text is kept, link targets are not, because this column
-- records what a person read rather than what they could click.
--
-- Three of the four approved documents map to a consent kind. The medical
-- disclaimer has no kind in the consent_kind enum and is therefore not
-- published here. It is a disclaimer shown to everyone, not something a
-- client grants, and adding an enum value for it is a decision about what
-- consent means in this program, not a mechanical step.
--
-- health_data_sharing, research and participation stay unpublished. No
-- approved wording for them exists anywhere in the repository, and an
-- invented consent text is worse than an absent one.

do $migration$
declare
  v_kind    text;
  v_version text;
  v_title   text;
  v_body    text;
  v_req     boolean;
  v_eff     constant timestamptz := timestamptz '2026-09-20 00:00:00+00';
  v_existing uuid;
begin
  for v_kind, v_version, v_title, v_body, v_req in
    select * from (values
      ('terms', 'v1', 'Terms of service', $doc$Terms of service

What this is

The Human Battery Project is a ninety-day health coaching and research program. Enrolling gives you access to the protocol, the group and one-to-one coaching sessions, your client portal, and two blood draws ordered through a partner laboratory.

What it is not

It is not medical care, and we are not your healthcare provider. See the medical disclaimer.

Eligibility

You must be 18 or older and able to participate in dietary change and physical training. If you are pregnant, or managing a condition that requires a physician to direct your nutrition or exercise, you need your physician's clearance before enrolling.

The program and payment

Cohorts run for ninety days with thirty participants, all starting on the same date and following the same protocol. The fee is $1,000 for the ninety days, payable in full at enrollment, in two payments of $500 at enrollment and at day thirty, or in three payments of approximately $333 at enrollment, day thirty and day sixty. Payment plans are an agreement to pay the full amount; withdrawing from the program does not cancel the remaining instalments unless we agree otherwise in writing.

Refunds

Before your first blood draw, a full refund less any laboratory costs already incurred. After your first draw and within the first fourteen days, a fifty percent refund. After day fourteen, no refund, because the cohort seat, the panel, and the coaching schedule are committed. We will always talk to you first.

Your responsibilities

Give us accurate information, keep your login secure, log honestly, and tell us if something changes in your health during the program. Do not share program materials outside your cohort.

Our materials

The protocol, the Battery Score methodology, the written guides, and everything else we provide remain ours. You may use them for yourself. You may not resell, republish, or teach them as your own.

Your data

Handled as described in the privacy policy and the consumer health data privacy policy.

Limitation of liability

To the extent the law allows, our total liability to you is limited to the amount you paid us. We are not liable for indirect or consequential losses. Nothing here limits liability that cannot legally be limited.

Governing law

These terms are governed by the laws of the State of Texas. Disputes are resolved in the state or federal courts located in Travis County, Texas.

Changes

We may update these terms. If you are enrolled, the terms in effect when you enrolled continue to apply to your cohort.$doc$, true),
      ('privacy', 'v1', 'Privacy policy', $doc$Privacy policy

This policy explains what The Human Battery Project collects, why, and what you can do about it. A separate consumer health data privacy policy covers health-related information specifically.

What we collect

- When you apply: your name, email address, state of residence, and how you heard about the program. We also record the date, your IP address, and country, so we know which privacy laws apply to you.

- If you enroll: the information described in the consumer health data policy, collected inside your client portal under separate consent.

- Automatically: standard server logs. We do not run advertising trackers.

Why we collect it

- To send you cohort dates, the protocol, and the blood panel

- To run the program you signed up for

- To meet our legal and record-keeping obligations

Who we share it with

Service providers who help us operate: our hosting provider, our database provider, our email provider, our payment processor, and our partner laboratory. Each is bound by contract to use your information only to provide that service. We do not sell your personal information, and we do not share it with advertisers.

How long we keep it

Application records are kept for two years if you do not enroll. Program records are kept for the period described in the consumer health data policy. You can ask us to delete your information at any time.

Your rights

Depending on where you live, you may have the right to access, correct, delete, or export your information, and to withdraw consent. Exercise any of these by emailing admin@thehumanbatteryproject.com. We will not treat you differently for exercising a right.

Children

This program is for adults. We do not knowingly collect information from anyone under 18.

Security

Information is encrypted in transit and at rest. Access is limited to people who need it to run the program. No system is perfectly secure, and we will notify you as required by law if a breach affects your information.

Changes

If we change this policy we will post the new version here with a new date, and where the change is material we will email you.

Contact

admin@thehumanbatteryproject.com$doc$, true),
      ('health_data', 'v1', 'Consumer health data privacy policy', $doc$Consumer health data privacy policy

This policy applies to consumer health data as defined by Washington's My Health My Data Act, Nevada SB 370, and comparable laws. It is separate from our general privacy policy on purpose, so it is easy to find and read on its own.

What counts as consumer health data here

- Blood test results from your day 0 and day 90 draws

- What you record in your daily log: food, training, sleep, light exposure, and adherence

- Bodily measurements you enter, such as height, weight, and resting heart rate

- Your intake questionnaire responses

- The Battery Score we calculate from the above

Why we collect it

To deliver the ninety-day program you enrolled in: to build your protocol, to coach you through it, and to compare your day 0 and day 90 readings. Separately, and only if you opt in, to support longevity research.

How we collect it

Directly from you, through your client portal, and from our partner laboratory when you authorise release of your results to us.

Who we share it with

- Our partner laboratory, to order and receive your draws

- Our hosting and database providers, who store it on our behalf

- Your coach, who reads your log and your results

We do not sell consumer health data. We will not share it with anyone else without asking you first, in a separate request that names who would receive it and why.

Research use is optional and separate

At enrollment we ask, in a separate checkbox, whether you consent to your de-identified data being used in longevity research. De-identified means your name, email, address, and date of birth are removed and replaced with a code. You can join the program and decline this. You can withdraw the consent later, which stops future research use of your data.

Your rights

- Access: get a copy of the consumer health data we hold about you, including a list of who we have shared it with

- Delete: have it deleted from our systems and from our service providers' systems

- Withdraw consent: to collection, to sharing, or to research use, at any time

Email admin@thehumanbatteryproject.com. We respond within forty-five days. If we deny a request you can appeal by replying to our response.

How long we keep it

For as long as you have an account with us, and for the period afterwards required for our records. If you ask us to delete it, we delete it, except where the law requires us to keep something.

This is not medical care

The Human Battery Project is not a healthcare provider and is not a HIPAA covered entity. Your information here is not a medical record and is not covered by HIPAA. It is protected by this policy and by the consumer privacy laws named above.$doc$, true)
    ) as t(kind, version, title, body, is_required)
  loop
    -- If something has already been published for this kind, retire it
    -- rather than touching it. A client consent points at a document id,
    -- and editing the row it points at would change what they agreed to
    -- after the fact.
    select id into v_existing
      from consent_documents
     where kind = v_kind::consent_kind and retired_at is null
       and version <> v_version;

    if v_existing is not null then
      update consent_documents set retired_at = v_eff where id = v_existing;
      raise notice 'retired the previous % document', v_kind;
    end if;

    insert into consent_documents (kind, version, title, body, body_sha256, is_required, effective_from)
    values (v_kind::consent_kind, v_version, v_title, v_body,
            encode(digest(v_body, 'sha256'), 'hex'), v_req, v_eff)
    on conflict (kind, version) do nothing;
  end loop;
end
$migration$;
