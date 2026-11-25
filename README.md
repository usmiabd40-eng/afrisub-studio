# AfriSub Studio — Amharic Edition

A mobile-friendly browser workspace to transcribe Amharic speech, edit timed captions, preview them over a video, and export a captioned WebM for YouTube.

## Features

- MP4/MOV upload (250 MB browser UI limit).
- Audio extraction in the browser; the original video is not uploaded to the transcription API.
- Cloudflare Workers AI Whisper large-v3-turbo for Amharic transcription, with word timestamps grouped into subtitle lines.
- Hohe ASR is not active until a separate model server is deployed. Google Speech is disabled in the app.
- Editable Amharic captions and start/end times.
- Live subtitle preview with text size, color and background controls.
- Export SRT and WebVTT files.
- Record a subtitled WebM in the browser.

## Hohe ASR service

The `hohe-service/` directory contains a small adapted deployment of the open Hohe ASR server. It runs the CC BY 4.0 model `snapwre/hohe-asr-amharic` and retains upstream attribution in `hohe-service/ATTRIBUTION.md`.

The service:
- downloads the model weights at startup (about 2.42 GB);
- runs on CPU with dynamic int8 quantisation enabled by default;
- accepts audio at `POST /transcribe` and exposes `GET /health`;
- returns NDJSON partial updates and final timestamped chunk segments;
- supports an optional `ASR_SECRET` checked through `x-asr-secret`.

The upstream project recommends four CPU cores for good throughput. A 4 GB RAM service is the practical minimum starting point; choose a larger plan if the model fails to load or runs out of memory.

### Deploy the Hohe service

Deploy the `hohe-service/` directory as a Docker web service on a host that can provide sufficient RAM and CPU. On Render, configure:
- Root / Docker context: `hohe-service`
- Dockerfile: `Dockerfile`
- Environment: `MODEL_ID=snapwre/hohe-asr-amharic`, `MODEL_DIR=/model`, `INT8=1`
- Set `ASR_SECRET` to a long random secret.
- Health check path: `/health`

The model weights are downloaded on first boot. Keep a persistent disk mounted at `/model` if the host supports it and you want to avoid downloading the model after restarts.

### Connect it to Cloudflare Pages

In Pages → afrisub-studio → Settings → Variables and Secrets, add:
- `HOHE_ASR_URL`: the deployed service base URL (without a trailing slash)
- `HOHE_ASR_SECRET`: the same random secret configured on the Hohe service

The Pages Function proxies transcription server-to-server; the secret is not exposed to the browser. Redeploy Pages after adding the variables.

## Other transcription engines

- Whisper: requires the Pages AI binding named `AI`; this project has that binding configured.
- Workers AI includes a free allocation of 10,000 Neurons per day. On the Workers Free plan, requests stop when the daily allocation is exhausted. On a Paid plan, usage above the free allocation may be billed. Check your Cloudflare plan and usage before transcribing. Google Speech is disabled in the app to avoid paid API calls.

## API

`POST /api/transcribe` accepts multipart form data:
- `audio`: mono 16 kHz PCM WAV audio
- `provider`: `whisper` (default), or `hohe` only if its service has been configured

Whisper word timestamps are grouped into short subtitle lines. Always listen and adjust text and timings before publishing.

## Local development

Use Wrangler Pages local development with an `AI` binding and required secrets in `.dev.vars`. Never commit `.dev.vars`, API keys, or other secrets.

## Known limitations

- Speech recognition is not word-perfect. The model is Amharic-only, does not add punctuation, and performs worse with overlapping speakers. Review the transcript before publishing.
- Browser audio decoding depends on the video's audio codec. MP4 with AAC audio is a good compatibility choice.
- Video export records the video and subtitle overlay in real time to WebM using the browser MediaRecorder API. Keep the tab open until export completes.
- The browser transcription workflow currently supports Amharic only. Afaan Oromoo is not implemented yet.

## Model attribution

Hohe ASR model: `snapwre/hohe-asr-amharic`, created by Chapi and the Dataset.ET contributors. Model licence: CC BY 4.0. The training corpus is not distributed with the model and is not covered by that licence. See `hohe-service/ATTRIBUTION.md`.
