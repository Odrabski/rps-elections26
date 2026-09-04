#!/usr/bin/env node
/**
 * A local studio for the winner calls: hear each one, fix how a name is pronounced, and save.
 *
 *   node tools/vo-studio.mjs      then open http://localhost:5180
 *
 * Editing pronunciation needs Piper on the other end of the page, so this is a real (local-only)
 * server rather than a static file. Nothing here ships — it writes to tools/winner-calls.json and
 * to client/public/sfx/, which is what the game actually loads.
 *
 * Spelling is the only lever available. Piper takes plain text, so a name it mangles is fixed by
 * respelling it the way it should sound ("ben gveer"), not with phonetic markup.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { speak, characterNames, ROOT } from './lib/speak.mjs';

const PORT = 5180;
const CONFIG = join(ROOT, 'tools/winner-calls.json');
const OUT = join(ROOT, 'client/public/sfx');

const config = () => JSON.parse(readFileSync(CONFIG, 'utf8'));
const saveConfig = (c) => writeFileSync(CONFIG, JSON.stringify(c, null, 2) + '\n');

/** What actually gets spoken for a character, given the current overrides. */
function spokenFor(cfg, name) {
  return cfg.template.replace('${name}', cfg.pronunciations[name] ?? name);
}

const body = (req) =>
  new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
  });

const page = () => {
  const cfg = config();
  const rows = characterNames()
    .map(({ id, name }) => {
      const pron = cfg.pronunciations[name] ?? '';
      return `<li data-id="${id}" data-name="${name}">
        <b>${name}</b>
        <input class="pron" value="${pron.replace(/"/g, '&quot;')}" placeholder="${name.toLowerCase()}" spellcheck="false">
        <button class="listen">▶ Listen</button>
        <button class="save">Save</button>
        <span class="status"></span>
      </li>`;
    })
    .join('\n');

  return `<!doctype html><meta charset="utf-8"><title>Winner call studio</title>
<style>
  :root { color-scheme: dark }
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; background:#101810; color:#dfe8df; margin:0; padding:24px }
  h1 { font-size:20px; margin:0 0 4px } p.sub { color:#8fa38f; margin:0 0 20px }
  fieldset { border:1px solid #2b3d2d; border-radius:10px; background:#18241a; margin:0 0 20px; padding:14px 16px; max-width:820px }
  legend { color:#d4af37; font-weight:700; padding:0 6px }
  .row { display:flex; align-items:center; gap:14px; flex-wrap:wrap }
  label { display:flex; align-items:center; gap:8px; color:#9fb39f }
  input[type=range] { width:170px } output { color:#d4af37; font-variant-numeric:tabular-nums; min-width:3.2em }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:7px; max-width:820px }
  li { display:grid; grid-template-columns:120px 1fr auto auto 90px; align-items:center; gap:10px;
       background:#18241a; border:1px solid #2b3d2d; border-radius:8px; padding:7px 12px }
  b { color:#d4af37 }
  input.pron { font:inherit; background:#0d130d; color:#dfe8df; border:1px solid #2b3d2d; border-radius:6px; padding:6px 9px }
  input.pron:focus { outline:2px solid #d4af37; outline-offset:-1px }
  button { font:inherit; background:#243024; color:#dfe8df; border:1px solid #35492f; border-radius:6px; padding:6px 12px; cursor:pointer }
  button:hover { background:#2e3d2e } button:disabled { opacity:.5; cursor:default }
  button.primary { background:#d4af37; color:#101810; border-color:#d4af37; font-weight:700 }
  .status { font-size:12px; color:#7f9a7f } .status.ok { color:#7bd88f } .status.err { color:#ff8f8f }
</style>
<h1>Winner call studio</h1>
<p class="sub">Respell a name the way it should sound — Piper reads plain text, so "ben gveer" is the fix, not phonetic markup. Listen before saving; Save writes the mp3 the game loads.</p>

<fieldset><legend>Voice</legend>
  <div class="row">
    <label>Pitch <input type="range" id="pitch" min="0.70" max="1.05" step="0.01" value="${cfg.pitch}"><output id="pitchOut">${cfg.pitch}</output></label>
    <label>Pace <input type="range" id="len" min="0.8" max="1.6" step="0.05" value="${cfg.lengthScale}"><output id="lenOut">${cfg.lengthScale}</output></label>
    <label>Max pause (ms) <input type="range" id="gap" min="60" max="500" step="10" value="${cfg.maxGapMs}"><output id="gapOut">${cfg.maxGapMs}</output></label>
    <button id="tryVoice">▶ Try on BIBI</button>
    <button id="saveAll" class="primary">Save settings + regenerate all 30</button>
    <span class="status" id="globalStatus"></span>
  </div>
  <div class="row" style="margin-top:10px">
    <label style="color:#8fa38f">Lower pitch deepens <em>and</em> slows. The reveal these play under is 3.6s — the studio warns if a call runs past it.</label>
  </div>
</fieldset>

<ul id="list">${rows}</ul>

<script>
const $ = (s, r = document) => r.querySelector(s);
const settings = () => ({ pitch: +$('#pitch').value, lengthScale: +$('#len').value, maxGapMs: +$('#gap').value });
for (const [id, out] of [['pitch','pitchOut'],['len','lenOut'],['gap','gapOut']])
  $('#'+id).addEventListener('input', () => ($('#'+out).textContent = $('#'+id).value));

let current = null;
async function preview(name, pron, status) {
  status.textContent = '…'; status.className = 'status';
  try {
    const res = await fetch('/preview', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ name, pron, ...settings() }) });
    if (!res.ok) throw new Error(await res.text());
    const secs = +res.headers.get('x-duration');
    const url = URL.createObjectURL(await res.blob());
    if (current) current.pause();
    current = new Audio(url); current.play();
    const over = secs > 3.6;
    status.textContent = secs.toFixed(2) + 's' + (over ? ' ⚠ over 3.6s' : '');
    status.className = 'status ' + (over ? 'err' : 'ok');
  } catch (e) { status.textContent = String(e.message || e).slice(0, 60); status.className = 'status err'; }
}

for (const li of document.querySelectorAll('#list li')) {
  const name = li.dataset.name, status = $('.status', li), input = $('.pron', li);
  $('.listen', li).onclick = () => preview(name, input.value.trim(), status);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('.listen', li).click(); });
  $('.save', li).onclick = async () => {
    status.textContent = 'saving…'; status.className = 'status';
    const res = await fetch('/save', { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ id: li.dataset.id, name, pron: input.value.trim(), ...settings() }) });
    const j = await res.json();
    status.textContent = res.ok ? 'saved ' + j.seconds.toFixed(2) + 's' : (j.error || 'failed');
    status.className = 'status ' + (res.ok ? 'ok' : 'err');
  };
}

$('#tryVoice').onclick = () => preview('BIBI', $('#list li[data-name=BIBI] .pron')?.value.trim() ?? '', $('#globalStatus'));
$('#saveAll').onclick = async () => {
  const s = $('#globalStatus'); s.textContent = 'regenerating all 30…'; s.className = 'status';
  $('#saveAll').disabled = true;
  const res = await fetch('/save-all', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(settings()) });
  const j = await res.json();
  s.textContent = res.ok ? \`saved \${j.count}, longest \${j.longest.toFixed(2)}s (\${j.longestName})\` : (j.error || 'failed');
  s.className = 'status ' + (res.ok ? 'ok' : 'err');
  $('#saveAll').disabled = false;
};
</script>`;
};

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page());
    }

    if (req.method === 'POST' && req.url === '/preview') {
      const { name, pron, pitch, lengthScale, maxGapMs } = await body(req);
      const cfg = config();
      const text = cfg.template.replace('${name}', pron || name);
      const mp3 = speak(text, { voice: cfg.voice, pitch, lengthScale, maxGapMs });
      // Rough duration from the constant-bitrate encode, which is all the warning needs.
      const seconds = mp3.length / (48000 / 8);
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'x-duration': seconds.toFixed(3) });
      return res.end(mp3);
    }

    if (req.method === 'POST' && req.url === '/save') {
      const { id, name, pron, pitch, lengthScale, maxGapMs } = await body(req);
      // Only ever write a file the game actually asks for — an id that isn't a real portrait would
      // otherwise leave a stray mp3 in public/sfx that nothing loads and nothing cleans up.
      if (!characterNames().some((c) => c.id === id && c.name === name)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: `unknown character ${id}` }));
      }
      const cfg = config();
      if (pron) cfg.pronunciations[name] = pron;
      else delete cfg.pronunciations[name];
      Object.assign(cfg, { pitch, lengthScale, maxGapMs });
      saveConfig(cfg);
      const mp3 = speak(spokenFor(cfg, name), { voice: cfg.voice, pitch, lengthScale, maxGapMs });
      writeFileSync(join(OUT, `win.${id}.mp3`), mp3);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, seconds: mp3.length / (48000 / 8) }));
    }

    if (req.method === 'POST' && req.url === '/save-all') {
      const { pitch, lengthScale, maxGapMs } = await body(req);
      const cfg = config();
      Object.assign(cfg, { pitch, lengthScale, maxGapMs });
      saveConfig(cfg);
      let longest = 0;
      let longestName = '';
      for (const { id, name } of characterNames()) {
        const mp3 = speak(spokenFor(cfg, name), { voice: cfg.voice, pitch, lengthScale, maxGapMs });
        writeFileSync(join(OUT, `win.${id}.mp3`), mp3);
        const s = mp3.length / (48000 / 8);
        if (s > longest) (longest = s), (longestName = name);
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, count: characterNames().length, longest, longestName }));
    }

    res.writeHead(404).end('not found');
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}).listen(PORT, () => console.log(`VO studio: http://localhost:${PORT}`));
