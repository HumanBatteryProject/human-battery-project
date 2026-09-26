-- 060: one consent row per participant per document.
--
-- grant_consent in 059 upserts on (client_id, document_id) and there was no
-- constraint for it to conflict against, so the first real call would have
-- raised "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". Found by checking the constraint list rather than by a member
-- pressing the button.
--
-- The grant and withdraw HISTORY is not lost by collapsing to one row: every
-- change writes an audit_log entry with the kind and the document, which is
-- where "when did they agree, and did they ever take it back" is answered.

-- No rows exist yet, so this cannot fail on existing duplicates. If it ever
-- could, the right move would be to keep the most recent per pair first.
delete from client_consents a using client_consents b
 where a.client_id = b.client_id and a.document_id = b.document_id and a.ctid < b.ctid;

alter table client_consents drop constraint if exists client_consents_client_document_key;
alter table client_consents
  add constraint client_consents_client_document_key unique (client_id, document_id);
