-- 074: the trigger function from 070 was executable by anon.
--
-- check_rls caught it on the first deploy after 070, which is the second time a
-- new function has arrived with EXECUTE granted to PUBLIC. 054 set a schema
-- default privilege intended to prevent exactly this, and the default ACL does
-- now read {postgres, authenticated, service_role} with no PUBLIC, yet this
-- function still came out with "=X/postgres" while every function that carried an
-- explicit revoke did not.
--
-- THE RULE, since the default cannot be relied on: every function this repository
-- creates ends with an explicit revoke from public and anon, and an explicit grant
-- to the roles that need it. check_rls fails the deploy when one is missed, which
-- is how both of these were found rather than shipped.
--
-- A trigger function needs no grant at all. It runs as part of the statement that
-- fires it, never by being called.

revoke execute on function check_rule_contraindications() from public;
revoke execute on function check_rule_contraindications() from anon;
