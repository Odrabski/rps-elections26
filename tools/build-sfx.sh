#!/usr/bin/env bash
# Converts the Kenney source clips named in sfx-manifest.json into the mp3s the client ships.
#
#   tools/build-sfx.sh <path-to-extracted-kenney-packs>
#
# Sources are Ogg Vorbis; mp3 is what actually plays everywhere — Safari's Ogg support arrived late
# and inconsistently, and this game is mostly played on phones. macOS has no ogg->mp3 in one step,
# so it goes through CoreAudio (afconvert, which does read Vorbis) to 16-bit mono WAV, then lame.
#
# Mono at 48 kbps throughout: these are phone-speaker effects, stereo would be wasted bytes.
set -euo pipefail

SRC="${1:?usage: build-sfx.sh <dir containing kenney_* folders>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/client/public/sfx"
mkdir -p "$OUT"
rm -f "$OUT"/*.mp3

python3 - "$ROOT/tools/sfx-manifest.json" <<'PY' | while IFS=$'\t' read -r id idx rel; do
import json, sys
cues = json.load(open(sys.argv[1]))["cues"]
for cue, files in cues.items():
    for i, f in enumerate(files, 1):
        print(f"{cue}\t{i if len(files) > 1 else 0}\t{f}")
PY
  name="$id"; [ "$idx" != "0" ] && name="$id.$idx"
  in="$SRC/$rel"
  [ -f "$in" ] || { echo "  MISSING: $rel"; continue; }
  afconvert -f WAVE -d LEI16@44100 -c 1 "$in" "/tmp/sfx-build.wav" 2>/dev/null
  lame --quiet -m m -b 48 --resample 44.1 "/tmp/sfx-build.wav" "$OUT/$name.mp3"
  printf "  %-26s %6s bytes\n" "$name.mp3" "$(stat -f%z "$OUT/$name.mp3")"
done
rm -f /tmp/sfx-build.wav
echo
echo "total: $(du -sh "$OUT" | cut -f1) across $(ls "$OUT"/*.mp3 | wc -l | tr -d ' ') files"
