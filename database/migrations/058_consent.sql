-- 058: consent and product limitations. Part I Day 2, master prompt D1.
--
-- consent_documents and client_consents already exist and are the right shape:
-- versioned text with a sha256 of the body, and a grant row per participant with
-- granted_at and withdrawn_at. What did not exist is the participation consent
-- itself, the two narrower consents D9 and D13 require, and any enforcement. The
-- account screen displayed consents; nothing ever required one.

do $$ begin
  alter type consent_kind add value if not exists 'uploads';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type consent_kind add value if not exists 'subscription';
exception when duplicate_object then null; end $$;
