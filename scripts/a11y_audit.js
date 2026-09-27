// The in-page audit, evaluated inside a real signed-in page at a real phone width.
// Read by scripts/a11y.mjs and passed to scripts/cdp.mjs as an expression.
//
// Everything here is MEASURED from the rendered page: computed styles, layout
// rectangles, the accessibility-relevant DOM. Nothing is inferred from the source,
// because the source is what I already believed.
(async () => {
  // WAIT FOR THE PAGE TO SETTLE BEFORE MEASURING ANYTHING.
  //
  // Every portal screen renders a spinner, fetches, then swaps #loading for #body.
  // Measuring before that swap audits the spinner: the first run reported the
  // dashboard as "still loading", and it was not broken at all, it reveals in about
  // half a second and my harness looked sooner. Contrast, tap targets and headings
  // measured against a spinner are all meaningless too.
  //
  // A page that never settles IS the finding, so the wait is bounded and says so.
  const settled = await (async () => {
    const loading = document.querySelector('#loading');
    if (!loading) return { waited: 0, settled: true };
    const start = Date.now();
    while (Date.now() - start < 12000) {
      if (getComputedStyle(loading).display === 'none') return { waited: Date.now() - start, settled: true };
      await new Promise((r) => setTimeout(r, 200));
    }
    return { waited: Date.now() - start, settled: false };
  })();

  const out = { url: location.pathname, problems: [], counts: {} };
  out.counts.settledAfterMs = settled.waited;
  const add = (kind, detail) => out.problems.push({ kind, detail });

  // ---- 1. Horizontal overflow. The failure that made the nav unusable at 390px.
  const de = document.documentElement;
  out.counts.scrollWidth = de.scrollWidth;
  out.counts.clientWidth = de.clientWidth;
  if (de.scrollWidth > de.clientWidth + 1) {
    // Name the widest offender, because "something overflows" is not actionable.
    let worst = null, worstRight = 0;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > worstRight) { worstRight = r.right; worst = el; }
    }
    add('horizontal overflow',
        `page scrolls sideways: ${de.scrollWidth}px of content in ${de.clientWidth}px. ` +
        `Widest element: ${worst ? worst.tagName.toLowerCase() + (worst.className ? '.' + String(worst.className).split(' ')[0] : '') : 'unknown'} reaching ${Math.round(worstRight)}px`);
  }

  // ---- 2. Tap targets.
  //
  // 24px is the WCAG 2.2 AA minimum (2.5.8). 44px is the AAA figure (2.5.5) and the
  // one Apple publishes, and it is a better target, but reporting a 40px button as
  // an accessibility FAILURE would be wrong: it passes AA. So under 24 fails, and
  // 24 to 44 is reported as a note that somebody can weigh.
  const MIN_FAIL = 24;
  const MIN_GOOD = 44;
  const interactive = [...document.querySelectorAll(
    'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [tabindex]:not([tabindex="-1"])')];
  out.counts.interactive = interactive.length;
  const tooSmall = [], smallish = [];
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;

    // FOR A CHECKBOX OR RADIO, THE LABEL IS THE TAP TARGET, always, not only when
    // the input is styled out of sight. The first version only skipped inputs under
    // 4px, so eight 17x17 radios wrapped in <label class="placement-opt"> were
    // reported as failures when the thing a thumb actually hits is the label around
    // them, which is comfortably over the minimum.
    if (el.type === 'checkbox' || el.type === 'radio') {
      const label = (el.id && document.querySelector(`label[for="${el.id}"]`))
                 || el.closest('label')
                 || (el.nextElementSibling && el.nextElementSibling.tagName === 'LABEL' ? el.nextElementSibling : null)
                 || (el.id && document.querySelector(`[data-for="${el.id}"]`));
      if (label) {
        const lr = label.getBoundingClientRect();
        if (lr.height >= MIN_FAIL - 0.5 && lr.width >= MIN_FAIL - 0.5) continue;
      } else if (r.width < 4 && r.height < 4) {
        // Hidden, and nothing found that acts as its control. That is worth knowing
        // on its own: it may be operable only by keyboard, or not at all.
        add('hidden control with no label acting as its target',
            (el.id ? '#' + el.id : el.name || 'unnamed') + ` (${el.type})`);
        continue;
      }
    }
    // A link inside running prose is text, not a control. Holding it to 24px would
    // mean a 24px line-height in a paragraph.
    // span, label and small carry sentences too. The "privacy policy" link on the
    // home page sits in a <span> and was reported at 161x21, which is the line
    // height of the sentence it is part of, not an undersized button.
    if (el.tagName === 'A' && el.closest('p, li, span, label, small, .quiet, .tiny')) continue;

    const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : (el.className ? '.' + String(el.className).split(' ')[0] : ''));
    if (r.height < MIN_FAIL - 0.5 || r.width < MIN_FAIL - 0.5) {
      tooSmall.push(`${name} ${Math.round(r.width)}x${Math.round(r.height)}`);
    } else if (r.height < MIN_GOOD - 0.5) {
      smallish.push(`${name} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  if (tooSmall.length) add('tap target below the 24px AA minimum', tooSmall.slice(0, 8).join(', '));
  out.counts.under44 = smallish.length;

  // ---- 3. Visible focus, checked as a MECHANISM rather than by focusing things.
  //
  // The first version called el.focus() and compared computed styles before and
  // after. It reported "no visible focus state" on eleven pages, and every one was
  // wrong: :focus-visible deliberately does NOT match programmatic focus, which the
  // probe confirmed (matches(':focus-visible') === false on a freshly focused
  // button). The outline is there and appears for a keyboard user. The test was
  // measuring something that cannot be measured that way.
  //
  // So: find a :focus-visible rule that actually paints something, and check its
  // colour resolves. An outline of "2px solid var(--gone)" computes to none, which
  // is the failure mode worth catching.
  let focusRule = null;
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin
    for (const rule of rules || []) {
      if (rule.selectorText && rule.selectorText.includes(':focus-visible')) {
        const st = rule.style;
        if ((st.outlineStyle && st.outlineStyle !== 'none') || st.outline || st.boxShadow) {
          focusRule = rule.selectorText + ' { ' + (rule.style.outline || rule.style.boxShadow) + ' }';
        }
      }
    }
  }
  if (!focusRule) {
    add('no focus-visible style anywhere', 'a keyboard user cannot see where they are');
  } else {
    // Prove the declared colour resolves to something paintable.
    const probe = document.createElement('button');
    probe.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(probe);
    const declared = /var\((--[a-z0-9-]+)\)/i.exec(focusRule);
    if (declared) {
      const value = getComputedStyle(document.documentElement).getPropertyValue(declared[1]).trim();
      if (!value) add('focus outline colour does not resolve',
                      `${focusRule} uses ${declared[1]}, which is not defined, so the outline computes to none`);
    }
    probe.remove();
  }
  out.counts.focusRule = focusRule ? 1 : 0;

  // ---- 4. Every form control has a label a screen reader will read.
  const unlabelled = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const byFor = el.id && document.querySelector(`label[for="${el.id}"]`);
    const wrapped = el.closest('label');
    const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    const titled = el.getAttribute('title');
    if (!byFor && !wrapped && !aria && !titled) {
      unlabelled.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : `[${el.type || ''}]`));
    }
  }
  if (unlabelled.length) add('form control with no label', unlabelled.slice(0, 8).join(', '));

  // ---- 5. Images need alt text, and decorative ones need it empty ON PURPOSE.
  const noAlt = [];
  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) noAlt.push(img.getAttribute('src') || '(no src)');
  }
  if (noAlt.length) add('image with no alt attribute', noAlt.slice(0, 6).join(', '));

  // ---- 6. Heading order. Skipping a level breaks navigation by heading, which is
  // how a screen reader user scans a page.
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter((h) => h.getBoundingClientRect().height > 0);
  out.counts.headings = headings.length;
  let prev = 0, jumps = [];
  for (const h of headings) {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) jumps.push(`${h.tagName} after H${prev}: "${h.textContent.trim().slice(0, 32)}"`);
    prev = level;
  }
  if (jumps.length) add('heading level skipped', jumps.slice(0, 5).join('; '));
  if (headings.length && Number(headings[0].tagName[1]) !== 1) {
    add('first heading is not an H1', `page starts at ${headings[0].tagName}`);
  }

  // ---- 7. A main landmark, so "skip to content" has somewhere to go.
  if (!document.querySelector('main, [role=main]')) add('no main landmark', 'nothing for a screen reader to jump to');

  // ---- 8. The document language, which decides how a screen reader pronounces it.
  if (!document.documentElement.getAttribute('lang')) add('no lang attribute', 'a screen reader cannot choose a voice');

  // ---- 9. Text contrast, measured against the actual painted background.
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  // Walk up for the first opaque background, which is what the text actually sits on.
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a >= 0.95) return c.rgb;
      node = node.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor);
    return body ? body.rgb : [255, 255, 255];
  };
  const ratio = (fg, bg) => {
    const a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const low = [];
  let checked = 0;
  for (const el of document.querySelectorAll('body *')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const fg = parse(cs.color);
    if (!fg) continue;
    checked++;
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    // WCAG "large text" is 18.66px bold or 24px, and needs 3:1 instead of 4.5:1.
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const got = ratio(fg.rgb, bgOf(el));
    if (got < need - 0.05) {
      low.push(`"${text.slice(0, 28)}" ${got.toFixed(2)}:1 needs ${need}:1 (${Math.round(size)}px)`);
    }
  }
  out.counts.textNodesChecked = checked;
  if (low.length) add('text contrast below WCAG AA', low.slice(0, 6).join(' | ') + (low.length > 6 ? ` and ${low.length - 6} more` : ''));

  // ---- 10. The test-data banner, on an internal account. Master prompt F2.
  out.counts.testBanner = document.querySelectorAll('.test-banner[data-internal]').length;

  // ---- 11. A screen that never finishes loading.
  if (!settled.settled) {
    add('never finished loading', `still showing its spinner after ${settled.waited}ms`);
  }

  // ---- 12. Unhandled errors, collected by cdp.mjs, are reported separately.
  return out;
})()
