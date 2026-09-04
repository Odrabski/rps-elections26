/**
 * A tiny Chrome DevTools Protocol driver for looking at the running game.
 *
 * There is no Playwright in this repo and the game can't be deep-linked into — the board only
 * exists after splash → menu → team pick → setup — so verifying anything on the board means
 * actually clicking through to it. This does that over a raw CDP websocket, using the `ws` package
 * the server already depends on.
 *
 * Usage:  node tools/drive.mjs <out-dir> [--width=430] [--height=932]
 *
 * Writes numbered screenshots into <out-dir> and prints a JSON line of measurements at the end.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9222;
const URL = 'http://localhost:5199/';

const outDir = process.argv[2] ?? '.';
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
};
const width = arg('width', 430);
const height = arg('height', 932);

mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${width},${height}`,
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--user-data-dir=/tmp/rps-drive-profile',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

/** Runs an expression in the page and returns its value (awaiting promises). */
async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? 'eval failed');
  return res.result.value;
}

/**
 * Polls until `expression` is truthy. Fixed sleeps are not good enough here: in dev the splash
 * mounts a second or so after navigate (Vite is still pulling modules), so its READY_AFTER_MS gate
 * expires much later than it does against a built bundle, and a hardcoded wait clicks a button
 * that is still `disabled`.
 */
async function waitFor(expression, { timeout = 15000, label = expression } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(`!!(${expression})`)) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Clicks the first element matching `sel` whose text contains `text` (or any match if no text). */
async function click(sel, text = null) {
  const found = await evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
    const el = ${text === null} ? els[0] : els.find(e => (e.textContent || '').includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!found) throw new Error(`no element for ${sel}${text ? ` containing "${text}"` : ''}`);
  await sleep(400);
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const path = join(outDir, `${name}.png`);
  writeFileSync(path, Buffer.from(data, 'base64'));
  return path;
}

async function main() {
  // Wait for the debugging endpoint, then attach to the first page target.
  let wsUrl;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await sleep(200);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      wsUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch {
      // Not up yet.
    }
  }
  if (!wsUrl) throw new Error('chrome never exposed a page target');

  ws = new WebSocket(wsUrl);
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  await new Promise((r) => ws.on('open', r));

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });

  await send('Page.navigate', { url: URL });

  await waitFor(`document.querySelector('.splash-enter-ready')`, { label: 'splash button to arm' });
  await click('.splash-enter');
  await waitFor(`!document.querySelector('.splash-screen')`, { label: 'splash to leave' });
  await shot('1-menu');

  await click('button', 'משחק מול בוט');
  await sleep(500);
  await shot('2-team-pick');

  // Team pick: take the first side offered.
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(e => /קואליציה|אופוזיציה/.test(e.textContent || ''));
    if (b) b.click();
    return !!b;
  })()`);
  await waitFor(`document.querySelector('.setup-screen, .game-board-screen')`, { label: 'setup screen' });
  await sleep(800);
  await shot('3-setup');

  // Setup is only ever: pick a tile for the king, pick one for the trap, then start. Weapons are
  // dealt for you. Legal targets carry .board-tile-legal, so each step is "click the first one".
  const clickLegalTile = (nth) =>
    evaluate(`(() => {
      const t = document.querySelectorAll('.board-tile-legal')[${nth}];
      if (!t) return false;
      t.click();
      return true;
    })()`);

  if (!(await clickLegalTile(0))) throw new Error('no legal tile for the king');
  await sleep(500);
  if (!(await clickLegalTile(1))) throw new Error('no legal tile for the trap');
  await sleep(500);
  await shot('4-setup-ready');

  await waitFor(`[...document.querySelectorAll('button')].some(b => /להתחיל|יאללה|מתחילים/.test(b.textContent||''))`, {
    label: 'the start button',
  });
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button.setup-btn-onboard-start')][0]
      ?? [...document.querySelectorAll('button')].find(e => /להתחיל|יאללה|מתחילים/.test(e.textContent||''));
    b.click();
    return true;
  })()`);

  await waitFor(`document.querySelector('.turn-pill')`, { label: 'the game board' });
  await sleep(1200);
  await shot('5-board');

  // What the caller actually came for: where the pill ends up relative to its own layout box.
  const measured = await evaluate(`(() => {
    const pill = document.querySelector('.turn-pill');
    const r = pill.getBoundingClientRect();
    const shift = getComputedStyle(pill).transform;
    return { text: pill.textContent, top: r.top, bottom: r.bottom, height: r.height, transform: shift };
  })()`);
  process.stdout.write(JSON.stringify(measured, null, 2) + '\n');
}

main()
  .catch((err) => {
    console.error('drive failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      ws?.close();
    } catch {
      // Already gone.
    }
    chrome.kill();
  });
