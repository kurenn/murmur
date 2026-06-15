#!/usr/bin/env python3
"""
Minimal OpenAI-compatible transcription server wrapping openai/whisper.

This runs on the OTHER laptop (the one doing the heavy lifting). Murmur sends it
recorded audio and gets text back. The endpoint mirrors OpenAI's audio API, so the
same Murmur client also works against OpenAI's cloud or any compatible server.

    POST /v1/audio/transcriptions   multipart: file=<audio>, model=<str>, language?=<str>
    ->  {"text": "..."}
    GET  /health                    ->  {"status": "ok", "model": "..."}

Setup (see server/README.md for the full guide):

    pip install -U openai-whisper fastapi "uvicorn[standard]" python-multipart
    # ffmpeg must be installed and on PATH (brew install ffmpeg / apt install ffmpeg)
    WHISPER_MODEL=base uvicorn whisper_server:app --host 0.0.0.0 --port 8000

Then in Murmur → Settings → Remote server, set the address to
http://<this-laptop-ip>:8000 and flip it on.
"""
import os
import tempfile

import whisper
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import PlainTextResponse

MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
# Force CPU/GPU explicitly if you want; otherwise whisper auto-detects CUDA.
DEVICE = os.environ.get("WHISPER_DEVICE")  # e.g. "cuda" or "cpu", or None to auto

print(f"[whisper-server] loading model '{MODEL_NAME}'"
      f"{f' on {DEVICE}' if DEVICE else ''} — this can take a minute the first time…")
WHISPER = whisper.load_model(MODEL_NAME, device=DEVICE) if DEVICE else whisper.load_model(MODEL_NAME)
print("[whisper-server] ready → POST /v1/audio/transcriptions")

app = FastAPI(title="whisper-server")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/v1/audio/transcriptions")
async def transcriptions(
    file: UploadFile = File(...),
    # `model` is accepted for OpenAI compatibility but ignored — this server uses
    # whatever model it loaded at startup (WHISPER_MODEL).
    model: str = Form(default="whisper-1"),
    language: str | None = Form(default=None),
    response_format: str = Form(default="json"),
):
    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        result = WHISPER.transcribe(
            path,
            language=None if not language or language == "auto" else language,
            # fp16 only helps on GPU; force off so CPU runs don't warn.
            fp16=bool(DEVICE and DEVICE.startswith("cuda")),
        )
    finally:
        os.unlink(path)

    text = (result.get("text") or "").strip()
    if response_format == "text":
        return PlainTextResponse(text)
    return {"text": text}
