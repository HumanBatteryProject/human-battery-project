/**
 * The Dawn shell every email is built in.
 *
 * Styled from docs/brand/HBP-Brand-Style-v3-Dawn.md: ivory surface, copper-deep
 * headings, Archivo for headings, Spectral for reading, the wordmark on the
 * indigo field with the trademark beside it as a separate element, 4px radius.
 *
 * WHY IT IS WRITTEN LIKE 2004. Gmail strips <style> blocks, Outlook renders with
 * Word, and neither supports flexbox, grid or web fonts. So this is tables and
 * inline styles, the fonts are named with real fallbacks rather than loaded, and
 * nothing depends on a feature a phone client might not have. The brand faces
 * are not available in mail, which is why Georgia stands in for Spectral and
 * Helvetica for Archivo: both are the fallbacks the brand style already names.
 */

const T = {
  page: '#FBF9F5', raised: '#F4EFE4', field: '#0E1424',
  ink: '#1A1714', inkMuted: '#6E655C', rule: '#E4DED2',
  copperDeep: '#7A4A2E', copperInk: '#5E3823', copperLight: '#D9A87A',
};

// Archivo and Spectral are not installable in mail. These are the fallbacks the
// brand style names for exactly this case.
const HEAD = "Helvetica Neue, Helvetica, Arial, sans-serif";
const READ = "Georgia, 'Times New Roman', Times, serif";

export const SITE = 'https://thehumanbatteryproject.com';
export const REPLY_TO = 'drmicah@thehumanbatteryproject.com';

// The mark, on the indigo field, with the trademark beside it as a SEPARATE
// element. Mail clients cannot position an overlay reliably, so the symbol sits
// in its own table cell against the end of the wordmark rather than on top of
// it. The logo file is still never edited.
function markBlock() {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         style="background:${T.field};border-radius:4px">
    <tr><td align="center" style="padding:26px 20px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:top">
            <img src="${SITE}/assets/wordmark.png" width="240" alt="The Human Battery Project"
                 style="display:block;width:240px;max-width:62vw;height:auto;border:0">
          </td>
          <td style="vertical-align:top;padding-left:3px">
            <span style="font-family:${HEAD};font-size:10px;line-height:1;color:${T.copperLight}">&#8482;</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

export function h2(text) {
  return `<h2 style="margin:26px 0 8px;font-family:${HEAD};font-size:17px;line-height:1.3;
    font-weight:700;color:${T.copperDeep}">${text}</h2>`;
}

export function p(text) {
  return `<p style="margin:0 0 12px;font-family:${READ};font-size:16px;line-height:1.55;
    color:${T.ink}">${text}</p>`;
}

export function small(text) {
  return `<p style="margin:0 0 10px;font-family:${READ};font-size:13px;line-height:1.5;
    color:${T.inkMuted}">${text}</p>`;
}

export function ul(items) {
  return `<ul style="margin:0 0 14px;padding-left:20px">` + items.map((i) =>
    `<li style="margin:0 0 7px;font-family:${READ};font-size:16px;line-height:1.55;
      color:${T.ink}">${i}</li>`).join('') + `</ul>`;
}

/** A square-cornered button. 4px is the largest radius the brand allows here. */
export function button(href, label) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px">
    <tr><td style="background:${T.copperDeep};border-radius:4px">
      <a href="${href}" style="display:inline-block;padding:13px 22px;font-family:${HEAD};
        font-size:15px;font-weight:700;color:${T.page};text-decoration:none">${label}</a>
    </td></tr>
  </table>`;
}

export function panel(inner) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="background:${T.raised};border-left:3px solid ${T.copperDeep};border-radius:4px;margin:0 0 16px">
    <tr><td style="padding:14px 16px">${inner}</td></tr></table>`;
}

/**
 * Wrap body HTML in the full document.
 * @param {string} title shown nowhere, read by screen readers and some clients
 * @param {string} body  the message, built from the helpers above
 */
export function shell(title, body) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${T.page};-webkit-text-size-adjust:100%">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:${T.page}">
  <tr><td align="center" style="padding:20px 14px 36px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
           style="width:560px;max-width:100%">
      <tr><td>${markBlock()}</td></tr>
      <tr><td style="padding:22px 2px 0">${body}</td></tr>
      <tr><td style="padding:22px 2px 0;border-top:1px solid ${T.rule}">
        <p style="margin:14px 0 0;font-family:${READ};font-size:12px;line-height:1.5;color:${T.inkMuted}">
          The Human Battery Project. An educational wellness program, not medical treatment.
          It does not diagnose or treat any condition and does not replace your physician.
          <br><a href="${SITE}" style="color:${T.copperDeep}">thehumanbatteryproject.com</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
