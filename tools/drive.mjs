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
  if (process.argv.includes('--no-cache')) {
    // Reproduces a first visit: the clash cloud is fetched during the fight it appears in, which
    // is the only moment its missing intrinsic height can misplace it.
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });

  if (process.argv.includes('--hunt-fight')) {
    // Tag every decoded AudioBuffer with the file it came from, so a clip that starts can be named
    // rather than guessed at from its duration — several cues happen to share one (fight.fanfare
    // and the winner calls are both 0.97s).
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try { sessionStorage.removeItem('rps-politika-session'); } catch {}
        if (!window.__audioProbe) {
          window.__audioProbe = true;
          // The game now opens muted (see SoundToggle), and play() returns before touching the
          // audio graph when it is — without this every audio assertion silently passes on zero
          // events. Set before any app code runs, since sfx.ts reads it once at import.
          try { localStorage.setItem('rps-politika:muted', '0'); } catch {}

          window.__played = [];
          // Tag each decoded buffer with the file it came from, by remembering the *identity* of
          // the ArrayBuffer each response produced. An earlier version keyed this on byteLength
          // and quietly lied: fight.win-fanfare.mp3 and result.lose.mp3 are both exactly 5485
          // bytes, so one was reported as the other.
          const bufferStem = new WeakMap();
          const decodedStem = new WeakMap();
          const origFetch = window.fetch;
          window.fetch = function (u, ...rest) {
            const url = String(typeof u === 'string' ? u : u.url || '');
            const p = origFetch.call(this, u, ...rest);
            if (!url.includes('/sfx/')) return p;
            const stem = url.split('/').pop().replace('.mp3', '');
            return p.then((res) => {
              const origAb = res.arrayBuffer.bind(res);
              res.arrayBuffer = () => origAb().then((ab) => { bufferStem.set(ab, stem); return ab; });
              return res;
            });
          };
          const dad = AudioContext.prototype.decodeAudioData;
          AudioContext.prototype.decodeAudioData = function (bytes, ok, err) {
            const stem = bufferStem.get(bytes);
            return dad.call(this, bytes, (buf) => { if (stem) decodedStem.set(buf, stem); if (ok) ok(buf); }, err);
          };
          const start = AudioBufferSourceNode.prototype.start;
          AudioBufferSourceNode.prototype.start = function (...a) {
            try {
              window.__played.push({
                clip: decodedStem.get(this.buffer) || ('?' + this.buffer.duration.toFixed(2)),
                secs: +this.buffer.duration.toFixed(2),
                at: Math.round(performance.now()),
              });
            } catch {}
            return start.apply(this, a);
          };
        }
      `,
    });
  }

  await send('Page.navigate', { url: URL });

  // The splash dismisses itself now — there is no button to press. Wait for it to *appear* before
  // waiting for it to go: straight after navigate it does not exist yet, so "gone" is trivially
  // true and the driver would race ahead of a splash that is about to cover everything.
  await waitFor(`document.querySelector('.splash-screen')`, { label: 'splash to appear', timeout: 20000 });
  await waitFor(`!document.querySelector('.splash-screen')`, { label: 'splash to leave', timeout: 20000 });
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

  if (process.argv.includes('--hunt-fight')) return huntFight();

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
/**
 * Plays until a soldier-vs-soldier fight reaches its reveal, and reports which audio clip was
 * played there — the check that the "<NAME> WINS" announcement fires instead of the old sting.
 */
async function huntFight() {
  // Record every clip that actually starts, by patching the one call all of sfx.ts funnels through.
  await evaluate(`(() => {
    window.__played = [];
    const proto = AudioBufferSourceNode.prototype;
    const start = proto.start;
    proto.start = function (...a) { try { window.__played.push(this.buffer && this.buffer.duration.toFixed(2)); } catch {} return start.apply(this, a); };
    const of = window.fetch;
    window.__fetched = [];
    window.fetch = function (u, ...r) { if (String(u).includes('/sfx/')) window.__fetched.push(String(u).split('/').pop()); return of.call(this, u, ...r); };
    return true;
  })()`);

  const canMove = `document.querySelector('.turn-pill')?.textContent.includes('התור שלך') && !document.querySelector('.board-hole') && !document.querySelector('.board-clash-cloud')`;

  for (let turn = 0; turn < 220; turn++) {
    try {
      await waitFor(canMove, { timeout: 25000, label: 'my turn' });
    } catch {
      break;
    }
    await sleep(250);
    const mine = await evaluate(`[...document.querySelectorAll('.board-cell')].map((c,i)=>c.querySelector('.piece-view.piece-mine')?i:-1).filter(i=>i>=0)`);
    let picked = null;
    for (const index of mine.sort(() => Math.random() - 0.5)) {
      await evaluate(`document.querySelectorAll('.board-cell')[${index}].querySelector('.board-tile').click()`);
      await sleep(120);
      if ((await evaluate(`document.querySelectorAll('.board-tile-legal').length`)) > 0) { picked = index; break; }
    }
    if (picked === null) { await pickTieBreakHandIfAsked(); await sleep(1500); continue; }
    await evaluate(`(() => {
      const l = [...document.querySelectorAll('.board-tile-legal')];
      l.sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      l[0].click(); return true;
    })()`);

    // A full-screen fight? Wait for its reveal and read back what played.
    let sawFight = false;
    for (let i = 0; i < 30; i++) {
      await sleep(200);
      if (await evaluate(`!!document.querySelector('.fight-overlay, [class*=fight-]')`)) { sawFight = true; break; }
    }
    if (!sawFight) continue;
    await evaluate(`window.__played = [];`);

    // The overlay's own geometry across the two phases: where the cloud sits while the fighters
    // are inside it, and where the winner lands once it dissolves. These should agree — the reveal
    // is meant to read as the cloud clearing to show who is standing there.
    const geom = await evaluate(`(async () => {
      const wait = async (sel, ms) => { const end = Date.now() + ms;
        while (Date.now() < end) { const el = document.querySelector(sel); if (el) return el; await new Promise(r => setTimeout(r, 40)); }
        return null; };
      const overlayMid = () => { const o = document.querySelector('.fight-sequence');
        const r = o.getBoundingClientRect(); return r; };
      const cloud = await wait('.fight-cloud', 12000);
      if (!cloud) return null;
      const cr = cloud.getBoundingClientRect(); const co = overlayMid();
      const winner = await wait('.fight-figure-winner', 12000);
      if (!winner) return { cloudCentreY: +(cr.top + cr.height/2).toFixed(1), cloudLoaded: cloud.complete && cloud.naturalHeight>0, winner: null };
      await new Promise(r => setTimeout(r, 250));
      const wr = winner.getBoundingClientRect();
      return {
        cloudCentreY: +(cr.top + cr.height/2).toFixed(1),
        cloudHeight: +cr.height.toFixed(1),
        cloudLoaded: cloud.complete && cloud.naturalHeight > 0,
        winnerCentreY: +(wr.top + wr.height/2).toFixed(1),
        driftPx: +((wr.top + wr.height/2) - (cr.top + cr.height/2)).toFixed(1),
      };
    })()`);
    if (geom) console.error('fight overlay geometry: ' + JSON.stringify(geom));

    // Where the clash cloud actually sits, relative to the cell it belongs to. The bug this
    // guards against only shows before cloud2.webp has loaded, so the caller disables the cache.
    const cloud = await evaluate(`(() => {
      const img = document.querySelector('.board-clash-cloud');
      if (!img) return null;
      const cell = img.closest('.board-cell');
      const c = cell.getBoundingClientRect(), i = img.getBoundingClientRect();
      const tile = c.height;
      return {
        loaded: img.complete && img.naturalHeight > 0,
        offsetInTiles: +(((i.top + i.height / 2) - (c.top + c.height / 2)) / tile).toFixed(2),
        heightInTiles: +(i.height / tile).toFixed(2),
      };
    })()`);
    if (cloud) console.error(`clash cloud: ${JSON.stringify(cloud)}`);

    // Sample the vs-screen head's float amplitude.
    //
    // Reads the computed transform, not getBoundingClientRect: the intro only holds ~2s and then
    // the arena re-lays-out for the standoff, so a rect sample straddling that boundary measures
    // the element being *moved*, not animated — it reported 366px for a 12px float. The transform's
    // m42 is the translateY the keyframes are driving, and nothing else touches it once the 0.3s
    // pop has finished, which is why sampling starts after it.
    const travel = await evaluate(`(async () => {
      const el = document.querySelector('.fight-intro-head');
      if (!el) return null;
      await new Promise((r) => setTimeout(r, 400));
      const ys = [];
      for (let i = 0; i < 26; i++) {
        if (!document.body.contains(el)) break;
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        ys.push(m.m42);
        await new Promise((r) => setTimeout(r, 55));
      }
      if (ys.length < 6) return null;
      return { samples: ys.length, travel: +(Math.max(...ys) - Math.min(...ys)).toFixed(2) };
    })()`);
    if (travel) console.error(`vs-screen float: ${travel.travel}px over ${travel.samples} samples`);
    await waitFor(`!document.querySelector('.fight-overlay, [class*=fight-]')`, { timeout: 25000, label: 'fight to end' }).catch(() => {});
    const played = await evaluate(`window.__played`);
    console.error(`fight ${turn}: played ${JSON.stringify(played)}`);
    // A tie never reaches the win/lose beat, so it proves nothing — play on until one is decisive.
    if (!played.some((n) => n.clip?.startsWith('win.') || n.clip === 'fight.win' || n.clip === 'fight.lose')) continue;
    await shot('fight');
    process.stdout.write(JSON.stringify({ played }, null, 2) + '\n');
    return;
  }
  process.stdout.write('{"error":"no fight found"}\n');
}

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
