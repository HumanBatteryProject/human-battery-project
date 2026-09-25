-- 050: a held lab result can be resolved, and the resolution says who did it.
--
-- Holding was built in 038 and works. What was never built is the other half:
-- a way to say what the row actually was. Two rows have been sitting held and
-- invisible since, which is the failure this fixes. A hold that nobody can
-- clear is not a safety feature, it is a leak.

-- A value a staff member rescued from a held row is not a lab feed and not
-- something the client typed. Recording it as either would lose the one fact
-- that matters when someone later asks where the number came from.
alter type result_source add value if not exists 'staff_entered';

-- Who resolved it, and what they decided. resolved_to already records the
-- marker a row was mapped to; it is null both for a discard and for a row that
-- was never touched, so the action has to be stored rather than inferred.
alter table lab_results_held
  add column if not exists resolved_by     uuid references profiles(id),
  add column if not exists resolution      text check (resolution in ('mapped','discarded')),
  add column if not exists resolution_note text;

comment on column lab_results_held.resolution is
  'What a human decided. Null while the row is still held. "discarded" and a '
  'row that was never looked at both leave resolved_to null, so the decision '
  'is stored rather than guessed from what is missing.';

-- A resolved row must say who resolved it and how. Without this a partial
-- write leaves a row that looks resolved and cannot be explained.
alter table lab_results_held drop constraint if exists lab_results_held_resolution_complete;
alter table lab_results_held add constraint lab_results_held_resolution_complete
  check ((resolved_at is null and resolution is null)
      or (resolved_at is not null and resolution is not null));

create index if not exists lab_results_held_open_all_idx
  on lab_results_held (held_at) where resolved_at is null;
