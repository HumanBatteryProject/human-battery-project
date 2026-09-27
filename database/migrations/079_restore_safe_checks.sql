-- 079: two tables could not be restored from a backup.
-- Part G: "backup and restore verification."
--
-- FOUND BY ACTUALLY RESTORING ONE, which is the only way this was ever going to
-- surface. A dump of the live database restored into a scratch database and 71 of
-- 73 tables came back with matching row counts. Two did not:
--
--   COPY failed for table "dimension_scores": relation "state_dimensions" does not exist
--   COPY failed for table "lab_markers":      relation "state_dimensions" does not exist
--
-- Both tables carry a CHECK constraint that calls a function, and both functions
-- reference state_dimensions WITHOUT SCHEMA-QUALIFYING IT and without setting a
-- search_path:
--
--   select is_scored from state_dimensions where dimension = d
--
-- In normal use that resolves, because public is on the search_path. pg_restore
-- deliberately runs with an empty search_path, so the reference resolves to
-- nothing, the CHECK raises, and the COPY of the whole table fails. The data was
-- in the dump the entire time and could not be loaded back.
--
-- This is not a rehearsal artefact. Any session with a restrictive search_path hits
-- it, which includes every SECURITY DEFINER function written with
-- "SET search_path = ''" as the hardening guides advise. So the same defect would
-- appear the first time one of those touched either table.
--
-- 33 lab markers and every dimension score. On a real restore, the markers are what
-- every score is computed from, so the two tables that would not come back are the
-- ones the program cannot run without.

create or replace function dimension_is_scored(d state_dimension)
returns boolean language sql stable
set search_path = public, pg_catalog as $fn$
  select is_scored from public.state_dimensions where dimension = d
$fn$;

create or replace function lab_marker_dimension_is_scored(d state_dimension)
returns boolean language sql stable
set search_path = public, pg_catalog as $fn$
  select d is null or (select is_scored from public.state_dimensions where dimension = d)
$fn$;

-- Both, belt and braces: the schema qualification alone would be enough, and the
-- search_path alone would be enough. A CHECK constraint that calls a function is
-- already an unusual thing to depend on, so it gets both.
