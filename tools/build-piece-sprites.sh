#!/usr/bin/env bash
# Builds the board-sized copies of the piece art, into client/public/assets/pieces/320/.
#
#   npm run sprites
#
# Why: the source art is 512x512, but the board paints a figure at ~100 CSS px. On a phone that is
# roughly 300 device pixels — so every sprite was being decoded at ~3x the size it is ever drawn
# at, and 58 of them adds up to tens of megabytes of resident bitmap on a device that has been
# known to drop the tab under memory pressure.
#
# 320 rather than something smaller: measured across real viewports, the largest a figure is ever
# painted is 295 device px on a phone (DPR 3) and 369 on a desktop (DPR 2). PieceView ships both
# sizes in a srcset with an accurate `sizes`, so phones take these and desktops keep the originals
# — the memory win lands where memory is actually scarce, at no cost to the big screens.
#
# The originals stay exactly as they are: the fight cinematic and the menu peekers draw the same
# characters at 216-238 CSS px and genuinely need them.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="client/public/assets/pieces"
OUT="$SRC/320"
WIDTH=320

command -v cwebp >/dev/null || { echo "need cwebp (brew install webp)" >&2; exit 1; }
command -v dwebp >/dev/null || { echo "need dwebp (brew install webp)" >&2; exit 1; }

mkdir -p "$OUT"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

count=0
for f in "$SRC"/*.webp; do
  name="$(basename "$f")"
  # -resize W 0 keeps the aspect ratio, which matters: four of these are not square.
  dwebp -quiet "$f" -o "$tmp/in.png"
  cwebp -quiet -q 82 -resize "$WIDTH" 0 -alpha_q 100 "$tmp/in.png" -o "$OUT/$name"
  count=$((count + 1))
done

echo "wrote $count sprites to $OUT"
echo "originals: $(du -sh "$SRC" --exclude=320 2>/dev/null | cut -f1 || du -sh "$SRC" | cut -f1)"
echo "resized:   $(du -sh "$OUT" | cut -f1)"
