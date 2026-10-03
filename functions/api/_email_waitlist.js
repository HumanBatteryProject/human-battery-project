/**
 * The waitlist email. Copy supplied by the owner on 2026-10-02 and used as given,
 * with ONE ruled change.
 *
 * THE CHANGE, AND WHY. The copy as supplied said the Battery Score is "built from
 * four parts: Charge, Drain, Output and Reserve". That is the retired model. The
 * live canon is five dimensions, Flow, Capacity, Timing, Structure and
 * Environment; charge, redox and leak survive as the FRONTIER dimensions, named
 * to members and explicitly not scored, and Drain, Output and Reserve do not
 * exist anywhere any more. Reported before writing, and the owner ruled the line
 * changed to the five.
 */
import { shell, h2, p, ul, small, button, SITE, REPLY_TO } from './_email_brand.js';

export const SUBJECT = "You're on the list for The Human Battery Project";

const WHAT_IT_IS =
  'Every cell in your body holds a charge, like a battery. Modern life drains it. '
  + 'The Human Battery Project is a 90 day program that helps you charge it back up, '
  + 'with the signals your body was made for: morning light, water, movement, food '
  + 'timing, heat and cold, sleep, and darkness at night.';

const HOW = [
  'Blood work on day 0 and day 90. Your labs become your Battery Score, built from five parts: Flow, Capacity, Timing, Structure and Environment.',
  'A plan built for your level, from Beginner to Pro.',
  'A quick daily check-in in your portal. Your routine changes to fit what your body needs that day.',
  'A morning brief from our health coach agent at 8 every morning.',
  'The Battery Kitchen: 90 recipes, 30 breakfasts, 30 lunches and 30 dinners, plus clear food guidelines.',
  'A one hour live group Zoom with me every week.',
  'The book, The Human Battery.',
];

const NEXT =
  'The next groups start November 1 and November 15. We will email you when the '
  + 'program opens for a new group, with everything you need to join. You don’t '
  + 'need to do anything right now.';

const SIGNOFF_LINES = [
  'Dr. Micah Pittman',
  'Cell biology, UCSD. 25 years in health care.',
  'The Human Battery Project',
  'thehumanbatteryproject.com',
];

export function waitlistText(firstName) {
  return [
    `Hi ${firstName},`,
    '',
    'Thank you. You’re on the waitlist for The Human Battery Project™.',
    '',
    'What it is',
    WHAT_IT_IS,
    '',
    'How it works',
    ...HOW.map((h) => `- ${h}`),
    '',
    'What happens next',
    NEXT,
    '',
    'If you have a question, reply to this email. I read them.',
    '',
    ...SIGNOFF_LINES,
  ].join('\n');
}

export function waitlistHtml(firstName) {
  const body =
    p(`Hi ${firstName},`)
    + p('Thank you. You&rsquo;re on the waitlist for The Human Battery Project'
        + '<sup style="font-size:9px;line-height:0">&#8482;</sup>.')
    + h2('What it is')
    + p(WHAT_IT_IS)
    + h2('How it works')
    + ul(HOW)
    + h2('What happens next')
    + p(NEXT)
    + button(SITE, 'Read how it works')
    + p('If you have a question, reply to this email. I read them.')
    + small(SIGNOFF_LINES.join('<br>'));
  return shell(SUBJECT, body);
}

export const WAITLIST_REPLY_TO = REPLY_TO;
