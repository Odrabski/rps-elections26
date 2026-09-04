#!/usr/bin/env bash
# Downloads the Kenney packs that sfx-manifest.json refers to, so the build is reproducible from a
# clean checkout. They land in .sfx-sources/ (gitignored) — about 2MB of zips, not worth committing.
#
# All four packs are Creative Commons CC0: public domain, no attribution, commercial use fine.
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/.sfx-sources"
mkdir -p "$DEST"

packs=(
  "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip"
  "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip"
  "https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip"
  "https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip"
)

for url in "${packs[@]}"; do
  zip="$DEST/$(basename "$url")"
  dir="${zip%.zip}"
  if [ -d "$dir" ]; then echo "  have $(basename "$dir")"; continue; fi
  echo "  fetching $(basename "$url")"
  curl -sSL -o "$zip" "$url"
  mkdir -p "$dir" && unzip -qo "$zip" -d "$dir" && rm -f "$zip"
done
echo "sources ready in .sfx-sources/"
