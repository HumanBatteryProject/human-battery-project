-- 042: three panel definitions, DERIVED from lab_markers rather than listed.
--
-- The panels are built by query, so they cannot drift from the marker table.
-- A list typed into a migration is a second source of truth that looks
-- authoritative and goes stale the first time a marker's role changes.
--
-- The Omega-3 Index counts as a blood specimen. It is blood, collected on a
-- card rather than in a tube, and excluding it would leave Panel 1 with five
-- markers and STRUCTURE unmeasurable, which is the one dimension it is the
-- whole of.

create table if not exists lab_panel_defs (
  id          smallint primary key,
  slug        text not null unique,
  name        text not null,
  blurb       text not null
);

create table if not exists lab_panel_markers (
  panel_id  smallint not null references lab_panel_defs(id) on delete cascade,
  marker_id uuid not null references lab_markers(id) on delete cascade,
  primary key (panel_id, marker_id)
);

insert into lab_panel_defs (id, slug, name, blurb) values
 (1,'score','Score','The smallest panel that computes your Battery Score.'),
 (2,'core','Core','The Score panel plus the markers the model names as worth returning.'),
 (3,'complete','Complete','Everything the program can read from one draw.')
on conflict (id) do update set name=excluded.name, blurb=excluded.blurb;

delete from lab_panel_markers;

-- Panel 1: every scored marker drawn from blood, plus the two referable
-- markers the model names as worth returning at every panel.
insert into lab_panel_markers (panel_id, marker_id)
select 1, id from lab_markers
 where (role = 'scored' and specimen in ('blood','dried_blood_spot'))
    or slug in ('hs-crp','vitamin-d');

-- Panel 2: Panel 1, plus every referable marker Chapter 21 named explicitly,
-- plus the three that come free with any metabolic panel.
insert into lab_panel_markers (panel_id, marker_id)
select 2, id from lab_markers
 where id in (select marker_id from lab_panel_markers where panel_id = 1)
    or (role = 'referable' and needs_review = false)
    or slug in ('glucose-fasting','triglycerides','homa-ir');

-- Panel 3: Panel 2, plus everything that fell to the default rule.
insert into lab_panel_markers (panel_id, marker_id)
select 3, id from lab_markers
 where id in (select marker_id from lab_panel_markers where panel_id = 2)
    or needs_review = true;

-- A member declares a panel. The analysis agent reads it so a marker missing
-- from a member's panel is reported as "not in your panel" rather than as
-- missing or out of range, which is the difference between a choice they made
-- and a failure.
alter table memberships add column if not exists panel_id smallint references lab_panel_defs(id);
alter table applications add column if not exists panel_id smallint references lab_panel_defs(id);

comment on column memberships.panel_id is
  'Which panel the member declared. A marker outside it is "not in your '
  'panel", never "missing" and never "out of range". The Battery Score is '
  'identical at every panel: higher panels add context, not points.';
