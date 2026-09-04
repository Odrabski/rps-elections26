#!/usr/bin/env bash
# Installs Piper and the voice that tools/build-winner-calls.mjs speaks the winner calls with, so
# they are reproducible from a clean checkout.
#
#   tools/setup-piper.sh
#
# Piper is MIT-licensed (github.com/rhasspy/piper) and runs entirely offline once the model is
# downloaded. Both the venv and the model land in gitignored directories — the model alone is 63MB,
# which has no business in the repository when the 30 mp3s it produces come to 252KB.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.piper-venv"
VOICE_DIR="$ROOT/.sfx-sources/piper"
VOICE="en_US-john-medium"

if [ ! -x "$VENV/bin/piper" ]; then
  echo "  creating venv"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q piper-tts
fi

mkdir -p "$VOICE_DIR"
if [ ! -f "$VOICE_DIR/$VOICE.onnx" ]; then
  echo "  fetching $VOICE"
  "$VENV/bin/python" -m piper.download_voices --download-dir "$VOICE_DIR" "$VOICE"
fi
echo "piper ready — now run: node tools/build-winner-calls.mjs"
