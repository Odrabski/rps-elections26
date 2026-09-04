#!/usr/bin/env bash
# Builds the sound effects the game ships, into client/public/sfx/.
#
#   npm run sfx
#
# Two sources, in this order:
#
#   1. sfx-src/  — your own clips. Any audio format. Name the file after the cue and it wins:
#                    sfx-src/king.captured.wav      replaces that one cue
#                    sfx-src/piece.select.1.mp3     replaces variant 1 of four
#                  See sfx-src/README.md for the full list of cue names.
#
#   2. tools/sfx-manifest.json — the CC0 Kenney defaults, for every cue you haven't overridden.
#                  Run tools/fetch-sfx-sources.sh once to download those.
#
# Output is mono mp3 at 48 kbps. mp3 rather than ogg because Safari's Ogg support arrived late and
# inconsistently and this game is played on phones; mono because so are phone speakers. macOS has
# no ogg->mp3 in one step, so it goes through CoreAudio (afconvert reads Vorbis) then lame.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/.sfx-sources}"
OWN="$ROOT/sfx-src"
OUT="$ROOT/client/public/sfx"
mkdir -p "$OUT" "$OWN"
rm -f "$OUT"/*.mp3

encode() { # <input> <cue-name>
  afconvert -f WAVE -d LEI16@44100 -c 1 "$1" /tmp/sfx-build.wav 2>/dev/null || { echo "  ! cannot read $1"; return; }
  lame --quiet -m m -b 48 --resample 44.1 /tmp/sfx-build.wav "$OUT/$2.mp3"
  printf "  %-26s %6s bytes  %s\n" "$2.mp3" "$(stat -f%z "$OUT/$2.mp3")" "$3"
}

python3 - "$ROOT/tools/sfx-manifest.json" <<'PY' | while IFS=$'\t' read -r name rel; do
import json, sys
for cue, files in json.load(open(sys.argv[1]))["cues"].items():
    for i, f in enumerate(files, 1):
        print(f"{cue if len(files) == 1 else f'{cue}.{i}'}\t{f}")
PY
  own=$(find "$OWN" -maxdepth 1 -type f -name "$name.*" ! -name "*.md" 2>/dev/null | head -1)
  if [ -n "$own" ]; then
    encode "$own" "$name" "(yours: $(basename "$own"))"
  elif [ "$rel" = "__own__" ]; then
    echo "  ! missing $name — this cue has no default; put a file in sfx-src/$name.<ext>"
  elif [ -f "$SRC/$rel" ]; then
    encode "$SRC/$rel" "$name" ""
  else
    echo "  ! missing $name — no sfx-src override and $rel not found (run tools/fetch-sfx-sources.sh)"
  fi
done
rm -f /tmp/sfx-build.wav

# Looping tracks are built separately from the cue list: they're sustained rather than percussive,
# so they get a higher bitrate, and the client streams them rather than decoding them into memory
# (30s as an AudioBuffer is 5.2MB of RAM, which this game cannot spend).
for src in "$OWN"/music.loop.* "$OWN"/loop.*.*; do
  [ -e "$src" ] || continue
  case "$src" in *.md) continue;; esac
  base=$(basename "$src"); name="${base%.*}"
  afconvert -f WAVE -d LEI16@44100 -c 1 "$src" /tmp/loop-build.wav 2>/dev/null || { echo "  ! cannot read $base"; continue; }
  lame --quiet -m m -b 64 --resample 44.1 /tmp/loop-build.wav "$OUT/$name.mp3"
  rm -f /tmp/loop-build.wav
  printf "  %-26s %6s bytes  (loop, 64kbps)\n" "$name.mp3" "$(stat -f%z "$OUT/$name.mp3")"
done

echo
echo "total: $(du -sh "$OUT" | cut -f1) across $(ls "$OUT"/*.mp3 2>/dev/null | wc -l | tr -d ' ') files"
