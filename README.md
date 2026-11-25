# AfriSub Studio — Amharic Edition

A mobile-friendly browser workspace to transcribe Amharic speech, edit timed captions, preview them over a video, and export a captioned WebM for YouTube.

## Features

- MP4/MOV upload (250 MB browser UI limit).
- Audio extraction in the browser; the original video is not uploaded to the transcription API.
- Google Cloud Speech-to-Text (am-ET) as the recommended Amharic engine, using automatic punctuation and word timestamps.
- Cloudflare Workers AI Whisper as a selectable fallback.
- Editable Amharic captions and start/end times.
- Live subtitle preview with text size, color and background controls.
- Export SRT and WebVTT files.
- Record a subtitled WebM in the browser; YouTube accepts WebM uploads.

## Cloudflare Pages setup

The repository is connected to Cloudflare Pages and deploys from main. The Pages project uses an AI binding named AI for the Whisper fallback.

### Enable Google Chirp (recommended)

1. In Google Cloud Console, select or create a project and enable the Cloud Speech-to-Text API.
2. Create an API key. Restrict it to the Cloud Speech-to-Text API and appropriate usage limits.
3. In Cloudflare Dashboard, open Workers & Pages → afrisub-studio → Settings → Variables and Secrets.
4. Add a production secret named GOOGLE_SPEECH_API_KEY with the API key value. Add it to Preview too if you want preview deployments to use Google.
5. Redeploy the latest commit.

The key is read only by the server-side Pages Function; it is never sent to the browser. Google lists Amharic (Ethiopia), locale am-ET, for Chirp and Chirp 2. Recognition quality still depends on the audio and must be reviewed.

### API

POST /api/transcribe accepts multipart form data: audio (mono 16 kHz PCM WAV) and provider (google or whisper).

The Google provider sends 50-second audio chunks to Google Cloud Speech-to-Text and offsets returned word timestamps to the original video timeline. The Whisper provider calls the Cloudflare Workers AI Whisper Large v3 Turbo model.

## Local development

Use Wrangler Pages local development with an AI binding and a local GOOGLE_SPEECH_API_KEY secret in .dev.vars. Never commit .dev.vars, API keys, or other secrets.

## Notes and limitations

- Speech recognition is not guaranteed to be word-perfect. Always play the video and correct the transcript before publishing.
- Browser audio decoding depends on the video audio codec. MP4 with AAC audio is a good compatibility choice.
- Video export records the video and subtitle overlay in real time to WebM using the browser MediaRecorder API. Keep the tab open until export completes; long videos take as long as their playback duration.
- Video export depends on browser support for canvas capture and MediaRecorder. SRT/VTT exports remain available if a browser cannot record video.
- Google Chirp requires a Google Cloud API key and may incur Google Cloud charges. Whisper remains available as a fallback.
