'use strict';
/**
 * ScreenHelp AI - local server
 *
 * 1. Serves index.html on http://localhost:PORT (default 3000).
 * 2. Exposes a small JSON API under /api/browser/ that drives a real Chromium
 *    instance through Playwright. The browser agent in index.html asks Gemini
 *    which action to take next and then calls this API to perform it.
 *
 * The Gemini API key never reaches this server: Gemini is still called directly
 * from the browser with the key stored in localStorage.
 *
 * Environment variables (all optional):
 *   PORT=3000            port to listen on
 *   HOST=0.0.0.0         interface to bind
 *   HEADLESS=false       show the Chromium window on this machine
 *   CHROME_PATH=/path    use an installed Chrome/Chromium instead of Playwright's
 *   NO_SANDBOX=1         pass --no-sandbox (needed in some containers / as root)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const HEADLESS = process.env.HEADLESS !== 'false';
const VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_START_URL = 'https://www.wikipedia.org/';
const MAX_BODY_BYTES = 64 * 1024;
const NAV_TIMEOUT_MS = 30000;
const INDEX_FILE = path.join(__dirname, 'index.html');
const API_PREFIX = '/api/browser/';

const session = {
  browser: null,
  context: null,
  page: null,
  queue: Promise.resolve(), // serialises browser commands so actions never overlap
};

// ---------- small helpers ----------

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function firstLine(text) {
  return String(text || '').split('\n')[0];
}

function requireNumber(value, name) {
  const n = Number(value);
  if (value === undefined || value === null || value === '' || !Number.isFinite(n)) {
    throw httpError(400, `"${name}" must be a number`);
  }
  return n;
}

// Gemini uses a 0-1000 normalised grid; convert to real pixels of the viewport.
function toPixels(value, total) {
  return Math.round((clamp(value, 0, 1000) / 1000) * total);
}

function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) throw httpError(400, 'A URL is required');
  if (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s)) s = 'http://' + s;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let url;
  try {
    url = new URL(s);
  } catch (e) {
    throw httpError(400, `Invalid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw httpError(400, `Only http and https pages can be opened (got ${url.protocol})`);
  }
  return url.href;
}

const KEY_ALIASES = {
  ctrl: 'Control', control: 'Control', cmd: 'Meta', command: 'Meta', meta: 'Meta',
  alt: 'Alt', option: 'Alt', shift: 'Shift',
  enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab',
  space: ' ', backspace: 'Backspace', delete: 'Delete', del: 'Delete',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  pageup: 'PageUp', pagedown: 'PageDown', pgup: 'PageUp', pgdn: 'PageDown',
  home: 'Home', end: 'End',
};

function normalizeKeys(spec) {
  const parts = String(spec || '').split('+').map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw httpError(400, '"keys" is required, e.g. "Enter" or "Control+L"');
  return parts
    .map(p => {
      const alias = KEY_ALIASES[p.toLowerCase()];
      if (alias) return alias;
      return p.length === 1 ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join('+');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(httpError(413, 'Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(httpError(400, 'Request body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function enqueue(task) {
  const run = session.queue.then(task);
  session.queue = run.catch(() => {});
  return run;
}

// ---------- browser lifecycle ----------

function attachPage(page) {
  // Auto-dismiss alert/confirm/prompt dialogs so they cannot freeze the agent.
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
  page.on('close', () => {
    if (session.page !== page || !session.context) return;
    const open = session.context.pages().filter(p => !p.isClosed());
    session.page = open.length ? open[open.length - 1] : null;
  });
  // New tabs (target=_blank, window.open) become the active page.
  session.page = page;
}

async function ensureBrowser() {
  if (!session.browser) {
    let playwright;
    try {
      playwright = require('playwright');
    } catch (e) {
      throw httpError(500, 'Playwright is not installed. Run "npm install" in the project folder, then restart the server.');
    }
    const launchOptions = { headless: HEADLESS, args: [] };
    if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
    if (process.env.NO_SANDBOX === '1') launchOptions.args.push('--no-sandbox');
    try {
      session.browser = await playwright.chromium.launch(launchOptions);
    } catch (e) {
      throw httpError(500, `Could not start Chromium (${firstLine(e.message)}). Run "npm run install-browser" or set CHROME_PATH to an installed Chrome.`);
    }
    session.browser.on('disconnected', () => {
      session.browser = null;
      session.context = null;
      session.page = null;
    });
    session.context = await session.browser.newContext({ viewport: VIEWPORT });
    session.context.on('page', attachPage);
  }
  if (!session.page || session.page.isClosed()) {
    const page = await session.context.newPage();
    attachPage(page);
  }
  return session.page;
}

async function closeBrowser() {
  const browser = session.browser;
  session.browser = null;
  session.context = null;
  session.page = null;
  if (browser) await browser.close().catch(() => {});
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function captureState(page) {
  const vp = page.viewportSize() || VIEWPORT;
  let buffer;
  try {
    buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
  } catch (e) {
    // Page may still be navigating; retry once after a short pause.
    await page.waitForTimeout(500);
    buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
  }
  return {
    running: true,
    url: page.url(),
    title: await page.title().catch(() => ''),
    width: vp.width,
    height: vp.height,
    tabs: session.context ? session.context.pages().filter(p => !p.isClosed()).length : 1,
    mimeType: 'image/jpeg',
    screenshot: buffer.toString('base64'),
  };
}

// ---------- actions the agent can perform ----------

async function performAction(body) {
  const page = await ensureBrowser();
  const vp = page.viewportSize() || VIEWPORT;
  const toPoint = (x, y) => ({
    px: toPixels(requireNumber(x, 'x'), vp.width),
    py: toPixels(requireNumber(y, 'y'), vp.height),
  });

  switch (body.action) {
    case 'navigate': {
      const url = normalizeUrl(body.url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      await settle(page);
      return `Opened ${page.url()}`;
    }

    case 'click_at': {
      const { px, py } = toPoint(body.x, body.y);
      const button = ['left', 'right', 'middle'].includes(body.button) ? body.button : 'left';
      await page.mouse.move(px, py);
      await page.mouse.click(px, py, { button, clickCount: body.double ? 2 : 1 });
      await settle(page);
      return `Clicked at (${px}, ${py})`;
    }

    case 'type_text': {
      if (body.x !== undefined && body.x !== null && body.y !== undefined && body.y !== null) {
        const { px, py } = toPoint(body.x, body.y);
        await page.mouse.click(px, py);
        await page.waitForTimeout(150);
      }
      const text = String(body.text ?? '');
      if (!text && !body.clear) throw httpError(400, '"text" is required');
      if (body.clear) {
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.press('Backspace');
      }
      if (text) await page.keyboard.type(text, { delay: 20 });
      if (body.submit) {
        await page.keyboard.press('Enter');
        await settle(page);
      }
      const shown = text.length > 60 ? text.slice(0, 60) + '…' : text;
      return `Typed "${shown}"${body.submit ? ' and pressed Enter' : ''}`;
    }

    case 'key_press': {
      const keys = normalizeKeys(body.keys);
      await page.keyboard.press(keys);
      await settle(page);
      return `Pressed ${keys}`;
    }

    case 'scroll': {
      const direction = body.direction;
      if (!['up', 'down', 'left', 'right'].includes(direction)) {
        throw httpError(400, '"direction" must be up, down, left or right');
      }
      const amount = clamp(Number(body.amount) || 600, 50, 5000);
      const dx = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
      const dy = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
      await page.mouse.move(vp.width / 2, vp.height / 2);
      await page.mouse.wheel(dx, dy);
      await page.waitForTimeout(400);
      return `Scrolled ${direction} ${amount}px`;
    }

    case 'go_back': {
      const response = await page.goBack({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => null);
      if (!response && page.url() === 'about:blank') return 'No earlier page in history';
      await settle(page);
      return `Went back to ${page.url()}`;
    }

    case 'wait': {
      const seconds = clamp(Number(body.seconds) || 1, 0.5, 5);
      await page.waitForTimeout(seconds * 1000);
      return `Waited ${seconds}s`;
    }

    default:
      throw httpError(400, `Unknown action "${body.action}"`);
  }
}

// ---------- HTTP routing ----------

async function handleApi(req, res, route) {
  if (req.method === 'GET' && route === 'state') {
    return enqueue(async () => {
      if (!session.page || session.page.isClosed()) return sendJson(res, 200, { running: false });
      return sendJson(res, 200, await captureState(session.page));
    });
  }

  if (req.method !== 'POST') throw httpError(405, 'Method not allowed');

  // Requiring JSON means cross-site forms cannot drive the browser (they cannot
  // send application/json without a CORS preflight, which this server refuses).
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw httpError(415, 'Content-Type must be application/json');
  }
  const body = await readJson(req);

  if (route === 'open') {
    return enqueue(async () => {
      const page = await ensureBrowser();
      if (body.url) {
        await page.goto(normalizeUrl(body.url), { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await settle(page);
      } else if (page.url() === 'about:blank') {
        await page.goto(DEFAULT_START_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await settle(page);
      }
      return sendJson(res, 200, await captureState(page));
    });
  }

  if (route === 'action') {
    return enqueue(async () => {
      try {
        const result = await performAction(body);
        return sendJson(res, 200, { ok: true, result, state: await captureState(session.page) });
      } catch (err) {
        // Action failures are reported back to the agent (ok:false) so it can recover.
        return sendJson(res, 200, { ok: false, error: firstLine(err.message) });
      }
    });
  }

  if (route === 'close') {
    await closeBrowser();
    return sendJson(res, 200, { running: false });
  }

  throw httpError(404, 'Unknown browser endpoint');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(INDEX_FILE);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }

    if (url.pathname.startsWith(API_PREFIX)) {
      return await handleApi(req, res, url.pathname.slice(API_PREFIX.length));
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (res.headersSent) return res.end();
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    return sendJson(res, status, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ScreenHelp AI is running at http://localhost:${PORT}`);
  console.log(`Browser agent: ${HEADLESS ? 'headless Chromium' : 'visible Chromium window'}`);
});

async function shutdown() {
  await closeBrowser();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
