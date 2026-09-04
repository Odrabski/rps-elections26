#!/usr/bin/env node
/**
 * Generates the "<NAME>! Wins!" announcements, one per character portrait.
 *
 *   tools/setup-piper.sh              # once: installs Piper and fetches the voice
 *   node tools/build-winner-calls.mjs # writes all 30
 *   node tools/vo-studio.mjs          # ...or tune them by ear at http://localhost:5180
 *
 * There is no CC0 pack of Israeli politicians' names being shouted, so these are synthesised.
 *
 * Piper (MIT, rhasspy/piper) rather than macOS `say`: the only voices installed on a stock Mac are
 * the legacy formant synthesisers, and no amount of pitch-shifting makes one sound human because
 * there is no human in it to begin with. Piper's models are neural, trained on real recordings.
 *
 * Every setting — voice, pitch, pace, and how each name is spelled for the engine — lives in
 * tools/winner-calls.json, so the studio and this script always agree on what a call sounds like.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { speak, characterNames, ROOT } from './lib/speak.mjs';

const OUT = join(ROOT, 'client/public/sfx');
const cfg = JSON.parse(readFileSync(join(ROOT, 'tools/winner-calls.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });

const names = characterNames();
let longest = 0;
let longestName = '';

for (const { id, name } of names) {
  // A name Piper mangles is fixed by respelling it the way it should sound — it takes plain text,
  // so there is no phonetic markup to reach for.
  const spoken = cfg.template.replace('${name}', cfg.pronunciations[name] ?? name);
  const mp3 = speak(spoken, cfg);
  writeFileSync(join(OUT, `win.${id}.mp3`), mp3);

  const seconds = mp3.length / (48000 / 8);
  if (seconds > longest) [longest, longestName] = [seconds, name];
  process.stdout.write(`  win.${id}.mp3  "${spoken}"  ${seconds.toFixed(2)}s\n`);
}

writeFileSync(join(OUT, '.winner-calls.json'), JSON.stringify(names.map((n) => n.id), null, 2) + '\n');
console.log(`\n${names.length} announcements — ${cfg.voice}, pitch ${cfg.pitch}, pace ${cfg.lengthScale}`);
console.log(`longest: ${longestName} at ${longest.toFixed(2)}s (the fight reveal holds 3.60s)`);
