#!/usr/bin/env node
/**
 * Applies rewritten copy from content/ui-strings.csv back into the source.
 *
 *   node tools/apply-ui-strings.mjs --dry-run   # report what would change
 *   node tools/apply-ui-strings.mjs             # write it
 *
 * Only rows with a non-empty `new_text` are touched, so a half-finished sheet is safe to run.
 * Rows are matched by `id` against content/ui-strings.json (written by extract-ui-strings.mjs),
 * which is what knows the file and the exact original text — the `hebrew` column is only there to
 * be read by a human and is ignored here, so reformatting it in Sheets can't break anything.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

/** Minimal RFC-4180 reader: quoted fields, "" escapes, CR/LF inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f !== ''));
}

const map = JSON.parse(readFileSync(join(ROOT, 'content/ui-strings.json'), 'utf8'));
const byId = new Map(map.rows.map((r) => [r.id, r]));

const csv = parseCsv(readFileSync(join(ROOT, 'content/ui-strings.csv'), 'utf8').replace(/^﻿/, ''));
const header = csv[0].map((h) => h.trim().toLowerCase());
const [idCol, newCol] = [header.indexOf('id'), header.indexOf('new_text')];
if (idCol < 0 || newCol < 0) throw new Error('ui-strings.csv needs "id" and "new_text" columns');

const edits = [];
const problems = [];
for (const row of csv.slice(1)) {
  const id = (row[idCol] ?? '').trim();
  const next = (row[newCol] ?? '').trim();
  if (!id || !next) continue;
  const entry = byId.get(id);
  if (!entry) { problems.push(`unknown id "${id}" — re-run extract-ui-strings.mjs?`); continue; }
  if (next === entry.text) continue;
  edits.push({ entry, next });
}

// Group by file so each is read and written once.
const perFile = new Map();
for (const e of edits) {
  if (!perFile.has(e.entry.file)) perFile.set(e.entry.file, []);
  perFile.get(e.entry.file).push(e);
}

let applied = 0;
for (const [file, list] of perFile) {
  const path = join(ROOT, file);
  let src = readFileSync(path, 'utf8');
  for (const { entry, next } of list) {
    // Placeholders are stored numbered ({0}, {1}); put the original expressions back in.
    const restore = (s) => (entry.placeholders ?? []).reduce((acc, expr, i) => acc.split(`{${i}}`).join(expr), s);
    const from = restore(entry.text);
    const to = restore(next);
    const count = src.split(from).length - 1;
    if (count === 0) { problems.push(`${entry.id}: original text no longer present in ${file}`); continue; }
    if (count > 1) { problems.push(`${entry.id}: appears ${count}x in ${file} — skipped, needs a manual edit`); continue; }
    src = src.replace(from, to);
    applied++;
    console.log(`  ${entry.id}\n    - ${entry.text}\n    + ${next}`);
  }
  if (!dryRun) writeFileSync(path, src, 'utf8');
}

console.log(`\n${applied} string(s) ${dryRun ? 'would be' : ''} applied across ${perFile.size} file(s).`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log('  ! ' + p);
}
if (dryRun) console.log('\nDry run — nothing written. Re-run without --dry-run to apply.');
