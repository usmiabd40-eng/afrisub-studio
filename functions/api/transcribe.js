const MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ error: "Speech recognition is not configured yet. Please contact the site administrator." }, 503);

  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Please upload an audio track." }, 400);
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) return json({ error: "No audio file was received." }, 400);
  if (!["audio/wav", "audio/x-wav"].includes(audio.type)) {
    return json({ error: "Audio must be WAV format." }, 415);
  }
  if (audio.size < 44 || audio.size > MAX_AUDIO_BYTES) {
    return json({ error: "Audio must be between 44 bytes and 24 MB." }, 413);
  }

  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const audioBase64 = btoa(binary);

    const result = await env.AI.run(MODEL, {
      audio: audioBase64,
      task: "transcribe",
      language: "am",
      vad_filter: true,
      condition_on_previous_text: true,
    });

    const text = typeof result?.text === "string" ? result.text : "";
    const segments = Array.isArray(result?.segments) ? result.segments : [];
    if (!text && !segments.length) return json({ error: "The speech model returned no transcript. Try another video." }, 422);

    return json({
      text,
      segments: segments.map((segment) => ({
        start: Number(segment.start) || 0,
        end: Number(segment.end) || 0,
        text: String(segment.text || "").trim(),
      })).filter((segment) => segment.text),
      language: result?.transcription_info?.language || "am",
      duration: Number(result?.transcription_info?.duration) || null,
      model: MODEL,
    });
  } catch (error) {
    console.error("Amharic transcription error:", error);
    return json({ error: "Transcription could not be completed. Please try again with a shorter or clearer video." }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "allow": "POST, OPTIONS" } });
}
