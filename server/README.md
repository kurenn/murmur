# Remote Whisper server (the "other laptop")

This wraps [openai/whisper](https://github.com/openai/whisper) in a tiny
OpenAI-compatible HTTP endpoint so Murmur can transcribe on this machine over your
network. Murmur uploads recorded audio; this server returns the text.

```
POST /v1/audio/transcriptions   →  {"text": "..."}
GET  /health                    →  {"status": "ok", "model": "base"}
```

## 1. Prerequisites

- **Python 3.9+**
- **ffmpeg** on PATH (whisper decodes audio with it):
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg` (or `choco install ffmpeg`)
- A **GPU is strongly recommended** for the larger models. CPU works fine for
  `tiny`/`base`/`small`.

## 2. Install

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate    # optional but recommended
pip install -U -r requirements.txt
```

**GPU (NVIDIA):** install a CUDA build of PyTorch *before* the line above so
whisper uses the GPU automatically:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

Apple Silicon: openai/whisper runs on CPU there (no Metal backend). If it's too
slow, see "Faster alternative" below.

## 3. Run

```bash
WHISPER_MODEL=base uvicorn whisper_server:app --host 0.0.0.0 --port 8000
```

- `--host 0.0.0.0` is what makes it reachable from the other machine (Murmur). Do
  **not** use `127.0.0.1` here.
- `WHISPER_MODEL` picks the size (see table). It downloads once on first start.
- `WHISPER_DEVICE=cuda` (or `cpu`) forces a device; omit to auto-detect.

## 4. Pick a model

| Model      | VRAM/RAM | Speed     | Quality | Good for                         |
|------------|----------|-----------|---------|----------------------------------|
| `tiny`     | ~1 GB    | fastest   | ★★      | quick notes, weak hardware       |
| `base`     | ~1 GB    | very fast | ★★★     | **default — good balance**       |
| `small`    | ~2 GB    | fast      | ★★★★    | noticeably better, still snappy  |
| `medium`   | ~5 GB    | moderate  | ★★★★    | high accuracy, needs a GPU       |
| `large-v3` | ~10 GB   | slow      | ★★★★★   | best quality, GPU only           |

For real-time dictation feel: **`small` on GPU**, or `base` on CPU. The server
ignores the model name Murmur sends and always uses `WHISPER_MODEL`.

## 5. Point Murmur at it

1. Find this machine's LAN IP:
   - macOS: `ipconfig getifaddr en0`
   - Linux: `hostname -I`
   - Windows: `ipconfig` → IPv4 Address
2. In Murmur → **Settings → Remote server**: toggle on, set **Server address** to
   `http://<that-ip>:8000`, leave the API key blank. Both machines must be on the
   same network (and the server's firewall must allow inbound TCP 8000).

## 6. Verify

```bash
curl http://localhost:8000/health
# {"status":"ok","model":"base"}

# from the Murmur laptop, swap in the server IP:
curl -F file=@some.wav -F model=whisper-1 http://<server-ip>:8000/v1/audio/transcriptions
```

If `/health` works locally but not from the other laptop, it's almost always the
**firewall** or a wrong IP — not the server.

## Notes

- **Security:** this endpoint is unauthenticated and meant for a trusted LAN. Don't
  expose port 8000 to the internet. To require a token, put it behind a reverse
  proxy (or add a bearer check) and set the same key in Murmur's "API key" field —
  Murmur sends it as `Authorization: Bearer <key>`.
- **Fallback:** if the server is unreachable, Murmur automatically falls back to its
  local Whisper model, so dictation keeps working offline.
- **Faster alternative:** for much higher throughput with the *same* endpoint, you
  can run [`faster-whisper-server`](https://github.com/fedirz/faster-whisper-server)
  or [Speaches](https://github.com/speaches-ai/speaches) instead of this script —
  Murmur needs no changes, just point it at that server's address.
