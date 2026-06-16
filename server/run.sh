#!/usr/bin/env bash
# Start the whisper transcription server (after ./install.sh).
#   ./run.sh                          # base model, port 8000, all interfaces
#   WHISPER_MODEL=small PORT=8000 ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x ./.venv/bin/python ]; then
  echo "✗ No venv found — run ./install.sh first."
  exit 1
fi

export WHISPER_MODEL="${WHISPER_MODEL:-base}"
echo "▶ whisper-server: model=$WHISPER_MODEL  port=${PORT:-8000}"
exec ./.venv/bin/python -m uvicorn whisper_server:app --host 0.0.0.0 --port "${PORT:-8000}"
