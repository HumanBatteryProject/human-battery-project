-- 051: lab_results_held.panel_id had no foreign key.
--
-- Found by rendering the admin screen rather than by reading the schema: the
-- query joined the panel to show which draw a held value came from, and
-- PostgREST refused because there was no relationship to follow. The missing
-- constraint was the real defect and the failed join was only the symptom.
-- Without it a held row could point at a panel that no longer exists, and the
-- screen would show a value with no way to find the report it came from.
--
-- client_id and resolved_to have had their constraints since 038. panel_id was
-- simply missed.

delete from lab_results_held h
 where h.panel_id is not null
   and not exists (select 1 from lab_panels p where p.id = h.panel_id);

alter table lab_results_held drop constraint if exists lab_results_held_panel_id_fkey;
alter table lab_results_held
  add constraint lab_results_held_panel_id_fkey
  foreign key (panel_id) references lab_panels(id) on delete cascade;

comment on column lab_results_held.panel_id is
  'The draw this value came from. Constrained since 051: a held value whose '
  'panel is gone cannot be checked against the report it came from, so it is '
  'removed with the panel rather than left pointing at nothing.';

notify pgrst, 'reload schema';
