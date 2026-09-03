#!/usr/bin/env node
/**
 * Collects every Hebrew string the player can see into a spreadsheet for manual rewriting.
 *
 *   node tools/extract-ui-strings.mjs
 *
 * Writes content/ui-strings.csv (id, hebrew, new_text) for import into Sheets/Excel, and
 * content/ui-strings.json, which records where each id actually lives so the edits can be applied
 * back afterwards (see apply-ui-strings.mjs).
 *
 * Ids are `<file>.<hash of the original text>` — derived from the text itself rather than its
 * position, so they survive the file being reordered, and re-running this never renumbers a row
 * you have already translated.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, basename, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = [join(ROOT, 'client/src'), join(ROOT, 'shared/src')];
const OUT_DIR = join(ROOT, 'content');
const HEBREW = /[֐-׿]/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

/** Strips // and /* *\/ comments so commented-out UI (e.g. the parked difficulty picker) is not
 *  offered up for translation as though it were live. Crude, but these files have no regex
 *  literals or "//" inside strings for it to trip over. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

const rows = [];
const seen = new Map(); // text -> id, so one string used twice gets one row

for (const dir of SCAN_DIRS) {
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const rel = relative(ROOT, file);
    const src = stripComments(readFileSync(file, 'utf8'));
    const found = new Set();

    // Quoted string and template literals.
    for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (HEBREW.test(m[2])) found.add(m[2]);
    }
    // JSX text between tags, e.g. <button>שיתוף בוואטסאפ</button>. Any {expression} inside becomes
    // a numbered placeholder, so a line like `אתם משחקים בתור {TEAM_THEME[team].label}` is offered
    // for rewriting as `אתם משחקים בתור {0}` with the code it interpolates recorded separately.
    const slots = new Map(); // normalized text -> the expressions it stands in for
    // .tsx only: in a plain .ts file the same pattern happily matches across type generics
    // (`Record<Team, ...>`) and drags whole declarations in as though they were UI copy.
    for (const m of (extname(file) === '.tsx' ? src : '').matchAll(/>((?:[^<>{}]|\{[^{}]*\})*[֐-׿](?:[^<>{}]|\{[^{}]*\})*)</g)) {
      const raw = m[1].trim().replace(/\s+/g, ' ');
      if (!raw) continue;
      const exprs = [];
      const text = raw.replace(/\{[^{}]*\}/g, (expr) => `{${exprs.push(expr) - 1}}`);
      if (!HEBREW.test(text)) continue;
      found.add(text);
      if (exprs.length) slots.set(text, exprs);
    }

    for (const text of found) {
      if (seen.has(text)) continue;
      const id = `${basename(file, extname(file))}.${createHash('sha1').update(text).digest('hex').slice(0, 6)}`;
      seen.set(text, id);
      const row = { id, text, file: rel };
      if (slots.has(text)) row.placeholders = slots.get(text);
      rows.push(row);
    }
  }
}

rows.sort((a, b) => a.file.localeCompare(b.file) || a.text.localeCompare(b.text, 'he'));

const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
// BOM so Excel opens Hebrew as UTF-8 instead of mojibake; Sheets ignores it.
// Hand-traced reachability notes (see ui-string-notes.json) ride along as a fourth column, so a
// string that nothing can ever display isn't handed to a translator as though it were live copy.
const notes = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ui-string-notes.json'), 'utf8'));
const csv =
  '﻿' +
  [
    'id,hebrew,new_text,note',
    ...rows.map((r) => [esc(r.id), esc(r.text), '""', esc(notes[r.id] ?? '')].join(',')),
  ].join('\r\n') +
  '\r\n';

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'ui-strings.csv'), csv, 'utf8');
writeFileSync(
  join(OUT_DIR, 'ui-strings.json'),
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), rows }, null, 2) + '\n',
  'utf8',
);

console.log(`${rows.length} strings -> content/ui-strings.csv`);
for (const [file, n] of Object.entries(
  rows.reduce((acc, r) => ({ ...acc, [r.file]: (acc[r.file] ?? 0) + 1 }), {}),
).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(3)}  ${file}`);
