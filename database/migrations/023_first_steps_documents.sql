-- 023: register the four First Steps documents.
--
-- These are the first thing a client opens after paying, before the protocol.
-- sort_order 0 puts them above the tier protocol on the Program tab.
-- Same path-is-the-permission rule as 017: a Beginner can only sign a URL
-- for tier/beginner/*, so no extra RLS is needed here.

insert into program_documents (slug, title, description, storage_path, tier, sort_order) values
  ('first-steps-pro',          'Your First Steps',
   'What to do today and this week, before day zero.',
   'tier/pro/HBP-First-Steps-PRO.pdf',                   'pro',          0),
  ('first-steps-advanced',     'Your First Steps',
   'What to do today and this week, before day zero.',
   'tier/advanced/HBP-First-Steps-ADVANCED.pdf',         'advanced',     0),
  ('first-steps-intermediate', 'Your First Steps',
   'What to do today and this week, before day zero.',
   'tier/intermediate/HBP-First-Steps-INTERMEDIATE.pdf', 'intermediate', 0),
  ('first-steps-beginner',     'Your First Steps',
   'What to do today and this week, before day zero.',
   'tier/beginner/HBP-First-Steps-BEGINNER.pdf',         'beginner',     0)
on conflict (slug) do nothing;
