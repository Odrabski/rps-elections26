#!/usr/bin/env node
/**
 * Generates the "<NAME> wins!" announcements, one per character portrait.
 *
 *   node tools/build-winner-calls.mjs
 *
 * There is no CC0 pack of Israeli politicians' names being shouted, so these are spoken by macOS's
 * own `say`. Ralph is the deepest voice on the system — measured at 83Hz against Daniel's 128 and
 * Albert's 218 — and the result is pitched down a further 8% for weight, which also slows the
 * delivery slightly, which an announcer wants anyway.
 *
 * A few names are spelled phonetically below: the speech engine reads the display spelling of some
 * of them wrongly, and it is the sound that matters here, not the spelling.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'client/public/sfx');
const TMP = join(ROOT, '.sfx-sources/.tts');
const VOICE = 'Ralph';
const PITCH = 0.92;

/** Where `say` mispronounces the display name badly enough to matter. */
const PHONETIC = {
  'BEN-GVIR': 'ben gveer',
  SMOTRICH: 'smoat rich',
  GOLDKNOPF: 'gold knopf',
  KARHI: 'kar hee',
  ROTHMAN: 'rote man',
  SAAR: 'sah ar',
  STROOK: 'strook',
  GOTTLIEB: 'got leeb',
  EISENKOT: 'eye zen kot',
  KARIV: 'kah reev',
  LAZIMI: 'lah zee mee',
  'BEN-ARI': 'ben ah ree',
  TIBON: 'tee bone',
  TIBI: 'tee bee',
  RAYTEN: 'ray ten',
  GAFNI: 'gaf nee',
  DERI: 'deh ree',
  BIBI: 'bee bee',
};

const src = readFileSync(join(ROOT, 'client/src/data/characterAssets.ts'), 'utf8');
const block = src.slice(src.indexOf('const HEAD_DISPLAY_NAME'));
const names = [...block.slice(0, block.indexOf('};')).matchAll(/(\w+):\s*'([^']+)'/g)];

mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const [, headId, display] of names) {
  const spoken = `${PHONETIC[display] ?? display} wins`;
  const aiff = join(TMP, `${headId}.aiff`);
  execFileSync('say', ['-v', VOICE, '-o', aiff, spoken]);

  // Pitch down by resampling: telling afconvert the file has a lower sample rate than it does
  // stretches it, which drops the pitch and slows the delivery in one step.
  const rate = Math.round(22050 * PITCH);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${rate}`, '-c', '1', aiff, '/tmp/tts-a.wav']);
  execFileSync('sh', ['-c',
    `python3 - "$0" "$1" <<'PY'
import sys, wave
src, dst = sys.argv[1], sys.argv[2]
with wave.open(src) as r:
    frames, params = r.readframes(r.getnframes()), r.getparams()
with wave.open(dst, 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(${rate})
    w.writeframes(frames)
PY`, '/tmp/tts-a.wav', '/tmp/tts-b.wav']);

  execFileSync('lame', ['--quiet', '-m', 'm', '-b', '48', '--resample', '44.1', '/tmp/tts-b.wav',
                        join(OUT, `win.${headId}.mp3`)]);
  process.stdout.write(`  win.${headId}.mp3  "${spoken}"\n`);
}

rmSync('/tmp/tts-a.wav', { force: true });
rmSync('/tmp/tts-b.wav', { force: true });
writeFileSync(join(OUT, '.winner-calls.json'), JSON.stringify(names.map(([, h]) => h), null, 2) + '\n');
console.log(`\n${names.length} announcements, voice ${VOICE} at ${Math.round(PITCH * 100)}% pitch`);
