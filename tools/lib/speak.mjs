/**
 * Synthesises one spoken line with Piper, and applies the announcer treatment.
 *
 * Shared by tools/build-winner-calls.mjs (writes all 30) and tools/vo-studio.mjs (previews one),
 * so what you hear while tuning is exactly what gets written.
 *
 * The pitch step deserves a note. It reinterprets the samples at a lower rate — same bytes, header
 * claiming fewer samples per second — which drops the pitch and slows the delivery together, the
 * way playing a record slow does. An earlier version used `afconvert -d LEI16@<rate>` for this,
 * which *resamples*: it recalculates the samples to preserve the sound at the new rate, so pitch
 * and duration both came out unchanged and the setting did nothing at all.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PIPER = join(ROOT, '.piper-venv/bin/piper');
const VOICE_DIR = join(ROOT, '.sfx-sources/piper');

/** Piper writes a plain 16-bit mono WAV, but the chunk layout isn't guaranteed, so this walks it. */
function readWav(buf) {
  let pos = 12; // past "RIFF<size>WAVE"
  let sampleRate = 22050;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') sampleRate = buf.readUInt32LE(pos + 12);
    else if (id === 'data') data = buf.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  if (!data) throw new Error('no data chunk in wav');
  return { sampleRate, samples: new Int16Array(data.buffer, data.byteOffset, Math.floor(data.length / 2)) };
}

function writeWav({ sampleRate, samples }) {
  const bytes = Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + bytes.length, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(bytes.length, 40);
  return Buffer.concat([head, bytes]);
}

/**
 * Trims the silence off both ends and shortens any pause in the middle to `maxGapMs`.
 *
 * The middle one matters: "GANTZ! Wins!" is two exclamations, and the engine leaves a third of a
 * second between them. The reveal these play under is 3.6s, so that pause is the difference
 * between the call finishing and being cut off.
 */
function trimSilence(sampleRate, samples, maxGapMs) {
  const step = Math.floor(sampleRate * 0.01);
  let peak = 1;
  for (const s of samples) if (Math.abs(s) > peak) peak = Math.abs(s);
  const floor = peak * 0.03;

  const loud = [];
  for (let i = 0; i < samples.length; i += step) {
    let m = 0;
    for (let j = i; j < Math.min(i + step, samples.length); j++) if (Math.abs(samples[j]) > m) m = Math.abs(samples[j]);
    loud.push(m > floor);
  }
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return samples;

  const maxGap = Math.max(1, Math.round((maxGapMs / 1000) * sampleRate / step));
  const keep = [];
  let run = 0;
  for (let b = first; b <= last; b++) {
    if (loud[b]) {
      run = 0;
      keep.push(b);
    } else if (++run <= maxGap) {
      keep.push(b);
    }
  }
  const out = new Int16Array(keep.length * step);
  keep.forEach((b, n) => {
    const from = b * step;
    for (let j = 0; j < step && from + j < samples.length; j++) out[n * step + j] = samples[from + j];
  });
  return out;
}

/**
 * Speaks `text` and returns the finished mp3 as a Buffer.
 *
 * `voice` is a Piper model name (see tools/setup-piper.sh); `pitch` below 1 deepens and slows;
 * `lengthScale` is Piper's own pacing, applied before the pitch shift.
 */
export function speak(text, { voice, pitch = 1, lengthScale = 1, maxGapMs = 180, trim = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'vo-'));
  try {
    const raw = join(dir, 'raw.wav');
    execFileSync(PIPER, ['-m', join(VOICE_DIR, `${voice}.onnx`), '--length-scale', String(lengthScale), '-f', raw], {
      input: text,
    });

    const wav = readWav(readFileSync(raw));
    const samples = trim ? trimSilence(wav.sampleRate, wav.samples, maxGapMs) : wav.samples;
    const shifted = join(dir, 'shifted.wav');
    writeFileSync(shifted, writeWav({ sampleRate: Math.round(wav.sampleRate * pitch), samples }));

    const mp3 = join(dir, 'out.mp3');
    execFileSync('lame', ['--quiet', '-m', 'm', '-b', '48', '--resample', '44.1', shifted, mp3]);
    return readFileSync(mp3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The display names, read straight from the client so the two can never drift apart. */
export function characterNames() {
  const src = readFileSync(join(ROOT, 'client/src/data/characterAssets.ts'), 'utf8');
  const block = src.slice(src.indexOf('const HEAD_DISPLAY_NAME'));
  return [...block.slice(0, block.indexOf('};')).matchAll(/(\w+):\s*'([^']+)'/g)].map(([, id, name]) => ({ id, name }));
}

export { ROOT };
