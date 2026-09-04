#!/usr/bin/env node
/**
 * Generates the "<NAME> wins!" announcements, one per character portrait.
 *
 *   tools/setup-piper.sh          # once: installs Piper and fetches the voice
 *   node tools/build-winner-calls.mjs
 *
 * There is no CC0 pack of Israeli politicians' names being shouted, so these are synthesised.
 *
 * Piper (MIT, rhasspy/piper) rather than macOS `say`: the only voices installed on a stock Mac are
 * the legacy formant synthesisers, and no amount of pitch-shifting makes one of those sound human
 * because there is no human in it to begin with. Piper's models are neural and trained on real
 * recordings. en_US-norman was picked by measuring the fundamental of a test line across the
 * candidates — 88Hz, against en_GB-alan's 98 and en_US-ryan's 210, which is a narrator, not an
 * announcer.
 *
 * It is then pitched down a further 8%, which also slows the delivery — both of which an announcer
 * wants. Combined with length-scale that lands the call around a second and a half.
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
const PIPER = join(ROOT, '.piper-venv/bin/piper');
const MODEL = join(ROOT, '.sfx-sources/piper/en_US-norman-medium.onnx');
const PITCH = 0.92;
/** Piper's own pacing, before the pitch shift slows it further. */
const LENGTH_SCALE = '1.1';

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
  const spoken = `${PHONETIC[display] ?? display} wins!`;
  const raw = join(TMP, `${headId}.wav`);
  execFileSync(PIPER, ['-m', MODEL, '--length-scale', LENGTH_SCALE, '-f', raw], { input: spoken });

  // Pitch down by resampling: telling afconvert the file has a lower sample rate than it does
  // stretches it, which drops the pitch and slows the delivery in one step. Piper writes 22050Hz
  // for the medium models, the same rate `say` produced, so the arithmetic below is unchanged.
  const rate = Math.round(22050 * PITCH);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${rate}`, '-c', '1', raw, '/tmp/tts-a.wav']);
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
console.log(`\n${names.length} announcements, en_US-norman-medium at ${Math.round(PITCH * 100)}% pitch`);
