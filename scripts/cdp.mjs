// Drive Chrome through the DevTools Protocol.
//
// WHY THIS EXISTS. Two things could not be verified without it:
//
//   1. A TRUE phone-width layout. Headless Chrome clamps the layout viewport to
//      500px, so --window-size=390 gives a CROP of a 500px layout, not a 390px
//      render. Emulation.setDeviceMetricsOverride sets the real thing.
//   2. Evaluating JavaScript in a real signed-in page. The same-origin iframe
//      harness this project used before is blocked by X-Frame-Options: DENY,
//      which is correct for the site and fatal for the harness, and --dump-dom
//      hangs on pages that hold a connection open.
//
// No dependencies: Node 24 has a global WebSocket.
//
// Usage:
//   node scripts/cdp.mjs --url <url> [--width 390] [--height 844]
//        [--eval '<expression>'] [--shot out.png] [--localstorage '<json>']
//
// --eval prints the JSON result of the expression, awaited if it is a promise.
// --localstorage seeds localStorage BEFORE the page scripts run, which is how a
// signed-in page is probed without a real sign-in.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const URL_ = arg('url');
if (!URL_) { console.error('--url is required'); process.exit(2); }
const WIDTH = Number(arg('width', 390));
const HEIGHT = Number(arg('height', 844));
const EVAL = arg('eval');
const SHOT = arg('shot');
const SEED = arg('localstorage');
const PORT = Number(arg('port', 9333));

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-gpu', '--hide-scrollbars',
  '--user-data-dir=/tmp/cdp-profile-' + PORT,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeErr = '';
chrome.stderr.on('data', (d) => { chromeErr += String(d); });

function bail(msg, code = 1) {
  try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
  console.error(msg);
  if (chromeErr && code !== 0) console.error(chromeErr.slice(0, 400));
  process.exit(code);
}

// Chrome needs a moment before the debugging endpoint answers. Polled rather
// than slept, so a fast machine is not made to wait and a slow one still works.
async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  bail('Chrome did not expose a debugging target');
}

const ws = new WebSocket(await targetUrl());
let nextId = 1;
const pending = new Map();
const events = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) {
    events.push(msg.method);
  }
});
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', () => reject(new Error('websocket failed')), { once: true });
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(method + ' timed out')); }
    }, 30000);
  });
}

try {
  await send('Page.enable');
  await send('Runtime.enable');

  // The real thing, not a crop.
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 3, mobile: true,
  });

  // Capture errors BEFORE any page script runs. Without this a module that
  // rejects at top level leaves a spinner and no explanation, which is exactly
  // what happened on the consent screen: the page looked hung and the reason was
  // an exception nobody could see.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__cdpErrors = [];
      addEventListener('error', e => window.__cdpErrors.push('error: ' + (e.message || '') + ' @ ' + (e.filename||'') + ':' + (e.lineno||'')));
      addEventListener('unhandledrejection', e => window.__cdpErrors.push('unhandled rejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || String(e.reason))));
      (function(){ const ce = console.error; console.error = function(...a){ try{ window.__cdpErrors.push('console.error: ' + a.map(String).join(' ')); }catch(_){} return ce.apply(this, a); }; })();`,
  });

  if (SEED) {
    // Runs before any page script, which is what makes a signed-in probe work.
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{const s=${JSON.stringify(SEED)};const o=JSON.parse(s);` +
              `for(const k of Object.keys(o)) localStorage.setItem(k, typeof o[k]==='string'?o[k]:JSON.stringify(o[k]));}catch(e){}`,
    });
  }

  await send('Page.navigate', { url: URL_ });

  // Wait for the load event, then a beat for module scripts and their fetches.
  for (let i = 0; i < 100; i++) {
    if (events.includes('Page.loadEventFired')) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, Number(arg('settle', 2500))));

  if (EVAL) {
    const r = await send('Runtime.evaluate', {
      expression: EVAL, returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) {
      bail('evaluate threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    const v = r.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  }

  const errs = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__cdpErrors || [])', returnByValue: true,
  });
  const list = JSON.parse(errs.result?.value || '[]');
  if (list.length) {
    console.error('--- page errors (' + list.length + ') ---');
    for (const e of list) console.error('  ' + String(e).slice(0, 400));
  }

  if (SHOT) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(SHOT, Buffer.from(r.data, 'base64'));
    console.error(`screenshot written to ${SHOT}`);
  }

  chrome.kill('SIGKILL');
  process.exit(0);
} catch (e) {
  bail('cdp failed: ' + e.message);
}
