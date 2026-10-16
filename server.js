'use strict';
/**
 * ScreenEdit AI — local server
 *
 * 1. Serves index.html on http://localhost:PORT (default 3000).
 * 2. Exposes a JSON API under /api/browser/ that drives a real Chromium
 *    instance via Playwright so the AI can edit websites live.
 *
 * The Gemini API key stays in the browser; this server never sees it.
 *
 * Env vars (all optional):
 *   PORT=3000            port to listen on
 *   HOST=0.0.0.0         interface to bind
 *   HEADLESS=false       show Chromium window by default; set to "true" for headless
 *   CHROME_PATH=/p       use an existing Chrome/Chromium instead of Playwright's
 *   NO_SANDBOX=1         pass --no-sandbox (containers / running as root)
 *   ALLOWED_ORIGINS=...  comma-separated allowed web origins (besides same-origin)
 *                        default: https://socks275.github.io  set "none" to disable
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const HEADLESS = process.env.HEADLESS === 'true' || process.env.HEADLESS === '1';
const VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_START_URL = 'https://www.google.com/';
const MAX_BODY_BYTES = 256 * 1024;
const NAV_TIMEOUT_MS = 45000;
const INDEX_FILE = path.join(__dirname, 'index.html');
const API_PREFIX = '/api/browser/';
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? 'https://socks275.github.io')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter(s => s && s !== 'none')
);

const session = {
  browser: null,
  context: null,
  page: null,
  queue: Promise.resolve(),
};

// ---------- helpers ----------

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function firstLine(text) { return String(text || '').split('\n')[0]; }

function toPixels(value, total) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw httpError(400, `coordinate must be a number (got ${JSON.stringify(value)})`);
  return Math.round((clamp(n, 0, 1000) / 1000) * total);
}

function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) throw httpError(400, 'A URL is required');
  if (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s)) s = 'http://' + s;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let url;
  try { url = new URL(s); }
  catch (e) { throw httpError(400, `Invalid URL: ${raw}`); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw httpError(400, `Only http and https pages (got ${url.protocol})`);
  return url.href;
}

const KEY_ALIASES = {
  ctrl:'Control', control:'Control', cmd:'Meta', command:'Meta', meta:'Meta',
  alt:'Alt', option:'Alt', shift:'Shift',
  enter:'Enter', return:'Enter', esc:'Escape', escape:'Escape', tab:'Tab',
  space:' ', backspace:'Backspace', delete:'Delete', del:'Delete',
  up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight',
  pageup:'PageUp', pagedown:'PageDown', pgup:'PageUp', pgdn:'PageDown',
  home:'Home', end:'End', insert:'Insert',
};

function normalizeKeys(spec) {
  const parts = String(spec || '').split('+').map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw httpError(400, '"keys" required, e.g. "Enter" or "Control+a"');
  return parts.map(p => {
    const alias = KEY_ALIASES[p.toLowerCase()];
    if (alias) return alias;
    return p.length === 1 ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }).join('+');
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
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(httpError(400, 'Request body must be valid JSON')); }
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
  page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
  page.on('close', () => {
    if (session.page !== page || !session.context) return;
    const open = session.context.pages().filter(p => !p.isClosed());
    session.page = open.length ? open[open.length - 1] : null;
  });
  session.page = page;
}

async function ensureBrowser() {
  if (!session.browser) {
    let playwright;
    try { playwright = require('playwright'); }
    catch (e) {
      throw httpError(500, 'Playwright is not installed. Run "npm install" in the project folder, then restart the server.');
    }
    const launchOptions = { headless: HEADLESS, args: [] };
    if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;
    if (process.env.NO_SANDBOX === '1') launchOptions.args.push('--no-sandbox', '--disable-dev-shm-usage');
    try {
      session.browser = await playwright.chromium.launch(launchOptions);
    } catch (e) {
      const msg = firstLine(e.message);
      const needsInstall = /Executable doesn|Failed to launch|browserType\.launch|ENOENT/.test(msg);
      const hint = needsInstall
        ? '\n\n  Fix: run "npm run install-browser" to download Chromium, or set CHROME_PATH=/path/to/your/chrome.'
        : '';
      const envTip = !HEADLESS
        ? '\n  If you are on a server with no display, set HEADLESS=true NO_SANDBOX=1.'
        : '\n  On Linux containers, set NO_SANDBOX=1.';
      throw httpError(500, `Could not start Chromium (${msg}).${hint}${envTip}`);
    }
    session.browser.on('disconnected', () => {
      session.browser = null;
      session.context = null;
      session.page = null;
    });
    session.context = await session.browser.newContext({
      viewport: VIEWPORT,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
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
  try { await page.waitForLoadState('domcontentloaded', { timeout: 8000 }); } catch (_) {}
  await page.waitForTimeout(500);
}

async function captureState(page) {
  const vp = page.viewportSize() || VIEWPORT;
  let buffer;
  try {
    buffer = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: false });
  } catch (e) {
    await page.waitForTimeout(800);
    buffer = await page.screenshot({ type: 'jpeg', quality: 72, fullPage: false });
  }
  return {
    running: true,
    url: page.url(),
    title: (await page.title().catch(() => '')) || '',
    width: vp.width,
    height: vp.height,
    tabs: session.context ? session.context.pages().filter(p => !p.isClosed()).length : 1,
    mimeType: 'image/jpeg',
    screenshot: buffer.toString('base64'),
  };
}

// ---------- actions ----------

async function performAction(body) {
  const page = await ensureBrowser();
  const vp = page.viewportSize() || VIEWPORT;
  const toPoint = (x, y) => ({ px: toPixels(x, vp.width), py: toPixels(y, vp.height) });

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
      await page.waitForTimeout(80);
      await page.mouse.click(px, py, { button, clickCount: body.double ? 2 : 1, delay: body.double ? 80 : 0 });
      await settle(page);
      return `Clicked (${px}, ${py})`;
    }

    case 'type_text': {
      if (body.x !== undefined && body.x !== null && body.y !== undefined && body.y !== null) {
        const { px, py } = toPoint(body.x, body.y);
        await page.mouse.click(px, py);
        await page.waitForTimeout(200);
      }
      const text = String(body.text ?? '');
      if (!text && !body.clear) throw httpError(400, '"text" is required');
      if (body.clear) {
        await page.keyboard.press('ControlOrMeta+A');
        await page.waitForTimeout(60);
        await page.keyboard.press('Backspace');
      }
      if (text) {
        // Type in small chunks to avoid dropping characters
        await page.keyboard.type(text, { delay: 15 });
      }
      if (body.submit) {
        await page.waitForTimeout(150);
        await page.keyboard.press('Enter');
        await settle(page);
      }
      const shown = text.length > 80 ? text.slice(0, 80) + '…' : text;
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
      if (!['up', 'down', 'left', 'right'].includes(direction))
        throw httpError(400, '"direction" must be up, down, left, or right');
      const amount = clamp(Number(body.amount) || 500, 50, 3000);
      const dx = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
      const dy = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
      await page.mouse.move(vp.width / 2, vp.height / 2);
      await page.mouse.wheel(dx, dy);
      await page.waitForTimeout(500);
      return `Scrolled ${direction} ${amount}px`;
    }

    case 'go_back': {
      const resp = await page.goBack({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => null);
      if (!resp && page.url() === 'about:blank') return 'No earlier page';
      await settle(page);
      return `Went back to ${page.url()}`;
    }

    case 'wait': {
      const seconds = clamp(Number(body.seconds) || 1, 0.3, 8);
      await page.waitForTimeout(seconds * 1000);
      return `Waited ${seconds}s`;
    }

    default:
      throw httpError(400, `Unknown action "${body.action}"`);
  }
}

// ---------- HTTP routing ----------

function requestOrigin(req) {
  const origin = req.headers.origin;
  return origin ? String(origin).replace(/\/+$/, '').toLowerCase() : '';
}
function isSameOrigin(req, origin) {
  const host = String(req.headers.host || '').toLowerCase();
  return origin === `http://${host}` || origin === `https://${host}`;
}
function applyCors(req, res) {
  const origin = requestOrigin(req);
  if (!origin || isSameOrigin(req, origin)) return true;
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Vary', 'Origin');
  return true;
}
function handlePreflight(req, res) {
  const allowed = applyCors(req, res);
  if (!allowed || !requestOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Origin not allowed.');
  }
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  };
  if (req.headers['access-control-request-private-network']) {
    headers['Access-Control-Allow-Private-Network'] = 'true';
  }
  res.writeHead(204, headers);
  return res.end();
}

async function handleApi(req, res, route) {
  if (req.method === 'GET' && route === 'state') {
    return enqueue(async () => {
      if (!session.page || session.page.isClosed()) return sendJson(res, 200, { running: false });
      return sendJson(res, 200, await captureState(session.page));
    });
  }

  if (req.method === 'GET' && route === 'health') {
    let playwright = false;
    try { require('playwright'); playwright = true; } catch (_) {}
    return sendJson(res, 200, {
      ok: true,
      server: 'screenedit-ai',
      headless: HEADLESS,
      playwrightInstalled: playwright,
      browserRunning: !!(session.page && !session.page.isClosed()),
    });
  }

  if (req.method !== 'POST') throw httpError(405, 'Method not allowed');

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json'))
    throw httpError(415, 'Content-Type must be application/json');
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
        return sendJson(res, 200, { ok: false, error: firstLine(err.message) });
      }
    });
  }

  if (route === 'close') {
    await closeBrowser();
    return sendJson(res, 200, { running: false });
  }

  throw httpError(404, 'Unknown endpoint');
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
      if (req.method === 'OPTIONS') return handlePreflight(req, res);
      if (!applyCors(req, res)) {
        throw httpError(403, `Origin ${req.headers.origin} not allowed. Start with ALLOWED_ORIGINS=${req.headers.origin} to permit it.`);
      }
      return await handleApi(req, res, url.pathname.slice(API_PREFIX.length));
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (res.headersSent) return res.end();
    const status = err.status || 500;
    if (status >= 500) console.error('[server error]', err);
    return sendJson(res, status, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ScreenEdit AI — AI website editor               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  🚀 Open in your browser:   http://localhost:${PORT}`);
  console.log(`  🤖 AI browser window:      ${HEADLESS ? 'headless (invisible)' : 'VISIBLE — sign in & edits happen here'}`);
  console.log('');
  if (!HEADLESS) {
    console.log('  💡 A Chromium window pops up when the AI starts editing.');
    console.log('     Sign in there when asked. Set HEADLESS=true to hide.');
    console.log('');
  }
  if (ALLOWED_ORIGINS.size) {
    console.log(`  🔗 Allowed hosted origins: ${[...ALLOWED_ORIGINS].join(', ')}`);
    console.log(`     (Enter http://localhost:${PORT} in the app settings.)`);
    console.log('');
  }
  console.log(`  Health check:              http://localhost:${PORT}/api/browser/health`);
  console.log('');
});

async function shutdown() {
  await closeBrowser();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
