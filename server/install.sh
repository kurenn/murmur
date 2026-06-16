#!/usr/bin/env bash
# Install the openai/whisper transcription server + its dependencies.
# Run this on the machine that will host transcription (the "other computer").
#
#   ./install.sh            # default Python 3
#   PYTHON=python3.12 ./install.sh
#
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "✗ '$PY' not found. Install Python 3.9+ first (and re-run, or set PYTHON=...)."
  exit 1
fi
echo "▶ Python: $("$PY" --version)"

# whisper decodes audio with ffmpeg — it must be on PATH.
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "✗ ffmpeg is required (whisper uses it to decode audio). Install it:"
  echo "    macOS:   brew install ffmpeg"
  echo "    Ubuntu:  sudo apt-get install -y ffmpeg"
  echo "    Windows: winget install Gyan.FFmpeg"
  exit 1
fi
echo "▶ ffmpeg: $(ffmpeg -version | head -1)"

echo "▶ Creating venv (.venv) and installing dependencies (this pulls torch, ~minutes)…"
"$PY" -m venv .venv
./.venv/bin/python -m pip install --quiet --upgrade pip
# GPU note (NVIDIA): install a CUDA torch first for GPU acceleration, e.g.
#   ./.venv/bin/python -m pip install torch --index-url https://download.pytorch.org/whl/cu124
./.venv/bin/python -m pip install --quiet -r requirements.txt

echo
echo "✓ Installed. Start the server with:"
echo "    ./run.sh                       # default 'base' model on port 8000"
echo "    WHISPER_MODEL=small PORT=8000 ./run.sh"
echo "  Then point Murmur → Settings → Remote server at  http://<this-machine-ip>:8000"
