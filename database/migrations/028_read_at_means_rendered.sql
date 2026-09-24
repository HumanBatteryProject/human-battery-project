-- 028: say plainly what morning_briefs.read_at measures.
--
-- Nothing changes here except a comment, and the comment is the point.
--
-- read_at is stamped by the portal home page the moment the brief card
-- renders. It means the page was loaded with a brief on it. It does not
-- mean anyone read the brief, or scrolled to it, or looked at the screen.
-- A client who opens the portal to log their day and never scrolls past the
-- day counter is stamped exactly the same as one who reads every word.
--
-- That behaviour is intentional and is not being changed. What matters is
-- that this column will become data. The trend agent reads across every
-- client and engagement is precisely the signal it will reach for, so a
-- column that measures page load and is named like readership is a
-- confident wrong finding waiting to happen: "clients who read their briefs
-- adhere better" when the column cannot distinguish reading from opening.
--
-- If real readership is ever needed, it needs its own signal, from
-- something the client actually does: expanding the card, reaching the end
-- of the text, or tapping through to the full brief. Until such a column
-- exists, no agent, report or proposal may describe read_at as attention,
-- readership or engagement.

comment on column morning_briefs.read_at is
  'When the brief card first RENDERED for this client, stamped by the portal '
  'home page, not by any deliberate act of reading. Proxy for "the portal was '
  'opened while this brief was the newest one". NOT readership, NOT attention, '
  'NOT engagement: a client who never scrolls to the card is stamped '
  'identically to one who reads it through. Do not use as an engagement '
  'signal in the trend agent or any report. Real readership would need its '
  'own column fed by a deliberate client action.';
