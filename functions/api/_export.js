// What "everything" means in "download everything". Part J: "Data export and
// deletion behave as documented."
//
// THE BUG THIS REPLACES. The export was done in the browser, in account.html,
// behind a button labelled "Download everything". It read 12 tables. The database
// holds 39 base tables carrying a participant's data, so 27 were missing,
// including their dimension scores, their morning briefs, their daily plans, their
// weekly reviews, their measurements, their intake answers, their memberships,
// their entitlements, their payments and their support requests. The consent
// document they agree to says "You can export everything".
//
// WHY THE LISTS ARE DECLARED HERE AND CHECKED AGAINST THE DATABASE. A query that
// discovers tables at request time cannot be reviewed, and an export is exactly
// the thing that should be predictable. So the tables are named, and
// scripts/check_export.py fails the build if the database contains a
// participant-scoped table that is neither exported nor explicitly excluded with a
// reason. Silent drift is what produced a 12-of-39 export in the first place.

// Tables with a client_id of their own.
export const DIRECT = [
  'agent_runs', 'ai_calls', 'battery_scores', 'call_questions', 'client_consents',
  'coach_notes', 'coach_turns', 'completion_invitations', 'completion_summaries',
  'daily_logs', 'daily_plans', 'data_requests', 'demographics', 'dimension_scores',
  'discount_redemptions', 'discounts', 'document_downloads', 'entitlements',
  'functional_tests', 'intake_responses', 'lab_panels', 'lab_results_held',
  'measurements', 'memberships', 'morning_briefs', 'notifications', 'payments',
  'proposals', 'support_requests', 'weekly_plans', 'weekly_reviews',
  // Wearables. Their connections and their daily readings are theirs.
  'wearable_connections', 'wearable_daily',
];

// Tables that hold a participant's records through a parent row rather than a
// client_id. Every one of these was found by asking the database for foreign keys
// into participant-scoped tables, not by remembering them: three of the eight
// (plan_actions, plan_exclusions, tier_history) were missing from the old export.
export const INDIRECT = {
  lab_results:     { via: 'lab_panels',  parentKey: 'panel_id' },
  log_behaviors:   { via: 'daily_logs',  parentKey: 'daily_log_id' },
  log_exercises:   { via: 'daily_logs',  parentKey: 'daily_log_id' },
  log_foods:       { via: 'daily_logs',  parentKey: 'daily_log_id' },
  log_practices:   { via: 'daily_logs',  parentKey: 'daily_log_id' },
  plan_actions:    { via: 'daily_plans', parentKey: 'plan_id' },
  plan_exclusions: { via: 'daily_plans', parentKey: 'plan_id' },
  tier_history:    { via: 'memberships', parentKey: 'membership_id' },
};

// Named, with the reason, so nothing is dropped quietly. An exclusion has to be a
// decision somebody can disagree with.
export const EXCLUDED = {
  participant_memberships: 'a view over memberships, which is exported',
  participant_proposals:   'a view over proposals, which is exported',
  functional_progress:     'a view over functional_tests, which is exported',
  marker_deltas:           'a view over lab_results, which is exported',
  score_progress:          'a view over battery_scores, which is exported',
  rate_limits:             'not participant data: an endpoint name and a hashed address',

  // A TOKEN IS NOT A RECORD ABOUT SOMEBODY, IT IS A KEY TO THEIR ACCOUNT SOMEWHERE
  // ELSE. Putting it in an export would hand a live credential to whoever ends up
  // holding the file, which for an export is exactly the wrong place: the file gets
  // emailed, saved to a downloads folder, and kept. The member's connection row IS
  // exported, so they can see which devices are attached, when each last synced and
  // what scopes they granted, which is the part that is genuinely about them.
  //
  // It is also encrypted with a key the database does not hold, so an export would
  // have contained unreadable ciphertext and taught the member nothing while still
  // being a credential.
  wearable_tokens:         'a third-party credential rather than a record about the member. The connection it belongs to is exported, including its scopes and last sync',
};

export const EXPORT_NOTE =
  'This is every record we hold that is about you, taken from the tables listed in ' +
  'the manifest. Rows are exactly as stored. Where a table is empty, it is included ' +
  'as an empty list rather than left out, so you can see that we looked.';

// The PUBLISHABLE key, the same one public/portal/config.js ships to every browser.
// Not a secret, and deliberately not read from env: it is not configured there, and
// falling back to the service key would defeat the reason the export reads with the
// member's own session at all. Row level security is the backstop, and the service
// key has none.
//
// scripts/check_export.py fails if this and config.js ever disagree, because an
// export that quietly starts using the service key is exactly the drift worth
// catching.
export const PUBLISHABLE_KEY = 'sb_publishable_54Nd8k_CAi-1_WviAOEi3A_9WIpfYmi';
