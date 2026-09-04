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

  if (!process.argv.includes('--hunt-trap')) {
    // Default: just report where the turn pill ended up.
    const measured = await evaluate(`(() => {
      const pill = document.querySelector('.turn-pill');
      const r = pill.getBoundingClientRect();
      return { text: pill.textContent, top: r.top, height: r.height, transform: getComputedStyle(pill).transform };
    })()`);
    process.stdout.write(JSON.stringify(measured, null, 2) + '\n');
    return;
  }

  await huntTrap();
}

/**
 * Marches soldiers forward until something walks onto the bot's trap, then again onto the *same*
 * tile — the acceptance test for the trap surviving being sprung.
 *
 * Pieces are selected by clicking tiles rather than figures: the piece layer is pointer-events:none
 * and an invisible button grid sits on top, so the only reliable handle is "click a tile, see
 * whether legal targets lit up".
 */
/** A tied clash blocks everything until both sides pick a hand; the panel is modal. */
async function pickTieBreakHandIfAsked() {
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.tiebreak-card button')];
    if (b.length) { b[Math.floor(Math.random() * b.length)].click(); return true; }
    return false;
  })()`);
}

async function huntTrap() {
  // Match the pill's own wording positively. Testing for the opponent's "תור <side>" instead does
  // not work: "התור שלך" contains that very substring, so every turn reads as theirs.
  const canMove = `document.querySelector('.turn-pill')?.textContent.includes('התור שלך') && !document.querySelector('.board-hole') && !document.querySelector('.board-clash-cloud')`;
  const trapTiles = [];
  let shots = 0;

  for (let turn = 0; turn < 220 && trapTiles.length < 2; turn++) {
    try {
      await waitFor(canMove, { timeout: 25000, label: 'my turn' });
    } catch {
      console.error(`turn ${turn}: never became my move — stopping`);
      break; // game over, or stuck resolving
    }
    await sleep(250);

    // My own figures carry .piece-mine, and each sits in the same .board-cell as its (invisible)
    // .board-tile button, so the cells holding my pieces are the only ones worth clicking.
    const mine = await evaluate(`(() => {
      const cells = [...document.querySelectorAll('.board-cell')];
      return cells
        .map((c, i) => (c.querySelector('.piece-view.piece-mine') ? i : -1))
        .filter((i) => i >= 0);
    })()`);

    // Selecting is a React state change, so the legal tiles only exist on the *next* render —
    // clicking and reading back inside one evaluate() always sees the stale DOM.
    let picked = null;
    for (const index of mine.sort(() => Math.random() - 0.5)) {
      await evaluate(`document.querySelectorAll('.board-cell')[${index}].querySelector('.board-tile').click()`);
      await sleep(120);
      const legal = await evaluate(`document.querySelectorAll('.board-tile-legal').length`);
      if (legal > 0) {
        picked = { index, legal };
        break;
      }
    }
    if (!picked) {
      // Almost always the board still being locked (`resolving` outlives the cloud), or a
      // tie-break panel waiting on a hand. Neither is terminal — wait it out and try again.
      console.error(`turn ${turn}: no legal move offered yet (${mine.length} pieces) — retrying`);
      await pickTieBreakHandIfAsked();
      await sleep(1500);
      continue;
    }
    console.error(`turn ${turn}: moving from cell ${picked.index} (${picked.legal} targets)`);

    // Forward for this viewer is up the screen, so prefer the legal tile with the smallest top.
    await evaluate(`(() => {
      const legal = [...document.querySelectorAll('.board-tile-legal')];
      legal.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      legal[0].click();
      return true;
    })()`);

    // Watch briefly for a trap opening up.
    for (let i = 0; i < 24; i++) {
      await sleep(150);
      const hole = await evaluate(`(() => {
        const h = document.querySelector('.board-hole');
        if (!h) return null;
        const cell = h.closest('.board-cell') ?? h.parentElement;
        const all = [...document.querySelectorAll('.board-cell')];
        return { index: all.indexOf(cell) };
      })()`);
      if (!hole) continue;

      trapTiles.push(hole.index);
      const n = trapTiles.length;
      console.error(`trap sprung (#${n}) at cell index ${hole.index}`);
      // Grab the sequence: hole visible → banner → the return.
      for (const [label, delay] of [['hole', 0], ['fallen', 900], ['returning', 1300], ['settled', 800]]) {
        await sleep(delay);
        await shot(`trap${n}-${++shots}-${label}`);
        // The last-move marker must stay off this tile until the pit is gone and it is an
        // ordinary tile again, so record what the tile actually carries at each beat.
        const tile = await evaluate(`(() => {
          const cell = document.querySelectorAll('.board-cell')[${hole.index}];
          const t = cell.querySelector('.board-tile');
          return { cls: t.className, hole: !!cell.querySelector('.board-hole'), piece: !!cell.querySelector('.piece-view') };
        })()`);
        console.error(`  ${label}: hole=${tile.hole} piece=${tile.piece} lastMove=${/last-move/.test(tile.cls)}`);
      }
      break;
    }
  }

  const verdict = await evaluate(`(() => ({
    tileNowHasPiece: !!document.querySelector('.board-hole') === false,
    holeGone: !document.querySelector('.board-hole'),
  }))()`);
  process.stdout.write(JSON.stringify({ trapTiles, ...verdict }, null, 2) + '\n');
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
