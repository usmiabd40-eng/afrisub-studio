# AfriSub Studio — Amharic Edition

A focused browser app for generating editable Amharic subtitles from MP4/MOV videos.

## Features

- Upload an MP4 or MOV video (up to 250 MB in the browser UI).
- Extract the audio in the browser. The original video is not uploaded.
- Transcribe Amharic speech with Cloudflare Workers AI Whisper Large v3 Turbo.
- Review and edit Amharic text and subtitle timings.
- Export subtitles as SRT or WebVTT.

## Cloudflare setup

This project uses Cloudflare Pages Functions and a Workers AI binding.

1. Connect this GitHub repository to a Cloudflare Pages project.
2. Set the production branch to `main`; leave the build command empty and the output directory as `/`.
3. In the Pages project settings, add a Workers AI binding named `AI` for both Production and Preview environments.
4. Deploy the project.

The API route is `POST /api/transcribe` and expects multipart form data with a WAV file field named `audio`.

## Local development

Use the Cloudflare Pages local development tooling (for example, `wrangler pages dev`) with an AI binding configured in your local Wrangler configuration. Do not commit API tokens or secrets.

## Important notes

- Transcription quality varies with recording quality, accent, background noise, and the model's Amharic performance. Review spelling, names, punctuation, and timings before publishing.
- The browser must be able to decode the video's audio track. MP4 with AAC audio is the most broadly compatible starting point.
- The first release exports SRT and VTT. Burned-in MP4 export is not included yet.
- The transcription endpoint has a 24 MB extracted-audio limit.


## Deployment

Production hosting target: Cloudflare Pages (`afrisub-studio.pages.dev`).
