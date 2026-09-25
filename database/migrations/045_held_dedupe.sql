-- 045: a held result is one fact, not one per attempt.
--
-- Re-analysing a panel re-inserted every held row, so five runs produced five
-- copies of "Sparkle Factor, unknown_marker". The admin screen would show the
-- same unresolved item five times and a count of held items would be five
-- times wrong.
--
-- An unresolved hold is unique on the panel and the reported name. Resolved
-- ones are excluded from the index so the same name can legitimately be held
-- again later after a previous one was dealt with.

delete from lab_results_held a
 using lab_results_held b
 where a.ctid > b.ctid
   and a.panel_id is not distinct from b.panel_id
   and a.reported_name = b.reported_name
   and a.resolved_at is null and b.resolved_at is null;

create unique index if not exists lab_results_held_open_uq
  on lab_results_held (panel_id, reported_name) where resolved_at is null;
