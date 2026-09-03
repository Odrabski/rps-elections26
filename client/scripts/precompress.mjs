import { createReadStream, createWriteStream } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Writes .br and .gz siblings for the built text assets. sirv (see server/src/index.ts) only
 * serves a precompressed variant when the file is actually sitting there — without this the
 * bundle goes out raw, which was ~229 KB where ~72 KB would do.
 *
 * Only text-ish output is worth it: .webp/.png are already compressed, and gzipping them just
 * burns build time to produce a slightly larger file.
 */
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.map']);
const MIN_BYTES = 1024;

const dist = path.resolve(import.meta.dirname, '../dist');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let count = 0;
let savedBytes = 0;
for await (const file of walk(dist)) {
  if (!COMPRESSIBLE.has(path.extname(file))) continue;
  const { size } = await stat(file);
  if (size < MIN_BYTES) continue;

  await pipeline(createReadStream(file), zlib.createBrotliCompress(), createWriteStream(`${file}.br`));
  await pipeline(createReadStream(file), zlib.createGzip({ level: 9 }), createWriteStream(`${file}.gz`));

  const { size: brSize } = await stat(`${file}.br`);
  savedBytes += size - brSize;
  count += 1;
}

console.log(`precompressed ${count} files (${(savedBytes / 1024).toFixed(0)} KB smaller over brotli)`);
