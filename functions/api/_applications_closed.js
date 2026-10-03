/**
 * Applying is on hold, ruled 2026-10-02.
 *
 * One switch, read by every endpoint that could create a member or take money
 * from the public site. A flag per endpoint is how one of them stays open.
 *
 * WHAT THIS DOES NOT CLOSE. Staff and service-secret callers still reach these
 * endpoints, because the owner has to be able to enrol the first real group by
 * hand when a group opens, and the smoke test has to keep proving the path works
 * before it is needed. The gate is on the PUBLIC route, not on the function.
 */

export const APPLICATIONS_OPEN = false;

export const CLOSED_BODY = {
  error: 'Applications are closed',
  detail: 'Applying is on hold. The next groups start November 1 and November 15. '
        + 'Join the waitlist and we will email you when the program opens.',
  waitlist: 'https://thehumanbatteryproject.com/#apply',
};

/**
 * @returns {Response|null} a 403 to return, or null to carry on
 */
export function closedToPublic(isPrivileged) {
  if (APPLICATIONS_OPEN || isPrivileged) return null;
  return new Response(JSON.stringify(CLOSED_BODY), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}
