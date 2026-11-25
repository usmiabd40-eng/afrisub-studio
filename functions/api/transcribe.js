const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const GOOGLE_CHUNK_SECONDS = 50;
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }});
}
function wavInfo(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || String.fromCharCode(...bytes.subarray(0,4)) !== "RIFF" ||
      String.fromCharCode(...bytes.subarray(8,12)) !== "WAVE") throw new Error("Invalid WAV audio.");
  let offset = 12, sampleRate = 0, channels = 0, bits = 0, dataStart = -1, dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") { channels = view.getUint16(offset + 10, true); sampleRate = view.getUint32(offset + 12, true); bits = view.getUint16(offset + 22, true); }
    if (id === "data") { dataStart = offset + 8; dataSize = Math.min(size, bytes.length - dataStart); break; }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0 || sampleRate !== 16000 || channels !== 1 || bits !== 16) throw new Error("Audio must be mono 16 kHz PCM WAV.");
  return { sampleRate, dataStart, dataSize, bytesPerSecond: sampleRate * channels * bits / 8 };
}
function b64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function seconds(value) {
  if (typeof value === "number") return value;
  return Number(String(value || "0").replace(/s$/, "")) || 0;
}
function groupWords(words, offset) {
  const out = []; let group = [];
  const flush = () => {
    if (!group.length) return;
    out.push({ start: offset + seconds(group[0].startTime), end: offset + seconds(group[group.length - 1].endTime), text: group.map(w => w.word || "").join(" ").trim() });
    group = [];
  };
  for (const word of words) {
    group.push(word);
    const text = String(word.word || "");
    if (group.length >= 7 || /[።፧!?.,፤፥]$/.test(text)) flush();
  }
  flush(); return out.filter(x => x.text && x.end > x.start);
}
async function hoheTranscribe(audio, env) {
  if (!env.HOHE_ASR_URL) throw new Error("Hohe ASR service is not connected yet.");
  const form = new FormData();
  form.append("audio", audio, audio.name || "audio.wav");
  const headers = {};
  if (env.HOHE_ASR_SECRET) headers["x-asr-secret"] = env.HOHE_ASR_SECRET;
  const base = env.HOHE_ASR_URL.replace(/\\/$/, "");
  const upstream = await fetch(base + "/transcribe", { method: "POST", headers, body: form, signal: AbortSignal.timeout(240000) });
  if (!upstream.ok) {
    const message = await upstream.text();
    throw new Error("Hohe ASR error (" + upstream.status + "): " + message.slice(0, 220));
  }
  const body = await upstream.text();
  const events = body.split(/\\r?\\n/).filter(Boolean).map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const final = events.find(event => event.final !== undefined);
  const segments = final?.segments || events.at(-1)?.segments || [];
  return segments.map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || "").replace(/^\\[AMH\\]\\s*/, "").trim() })).filter(s => s.text && s.end > s.start);
}
async function googleTranscribe(bytes, env) {
  if (!env.GOOGLE_SPEECH_API_KEY) throw new Error("Google Chirp is not connected yet. Add GOOGLE_SPEECH_API_KEY as a Cloudflare Pages secret, then retry. You can choose Whisper as a temporary backup.");
  const info = wavInfo(bytes), chunks = [], maxBytes = Math.floor(info.bytesPerSecond * GOOGLE_CHUNK_SECONDS);
  for (let pos = 0; pos < info.dataSize; pos += maxBytes) {
    const size = Math.min(maxBytes, info.dataSize - pos);
    const wav = new Uint8Array(44 + size);
    wav.set(bytes.subarray(0, 44), 0);
    const view = new DataView(wav.buffer);
    view.setUint32(4, 36 + size, true); view.setUint32(40, size, true);
    wav.set(bytes.subarray(info.dataStart + pos, info.dataStart + pos + size), 44);
    const offset = pos / info.bytesPerSecond;
    const response = await fetch("https://speech.googleapis.com/v1/speech:recognize?key=" + encodeURIComponent(env.GOOGLE_SPEECH_API_KEY), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: { encoding: "LINEAR16", sampleRateHertz: 16000, languageCode: "am-ET", model: "default", enableAutomaticPunctuation: true, enableWordTimeOffsets: true }, audio: { content: b64(wav) } })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Google Speech-to-Text request failed.");
    for (const item of result.results || []) {
      const best = item.alternatives?.[0]; if (!best?.transcript) continue;
      if (best.words?.length) chunks.push(...groupWords(best.words, offset));
      else chunks.push({ start: offset, end: offset + GOOGLE_CHUNK_SECONDS, text: best.transcript.trim() });
    }
  }
  return chunks;
}
async function whisperTranscribe(bytes, env) {
  if (!env.AI) throw new Error("Whisper is not configured on this project.");
  const audio = b64(bytes);
  const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio, task: "transcribe", language: "am", vad_filter: true, condition_on_previous_text: true });
  const segments = (result?.segments || []).map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || "").trim() })).filter(s => s.text);
  if (!segments.length && result?.text) segments.push({ start: 0, end: Number(result?.transcription_info?.duration) || 1, text: result.text.trim() });
  return segments;
}
export async function onRequestPost({ request, env }) {
  if (!env.AI && !env.GOOGLE_SPEECH_API_KEY && !env.HOHE_ASR_URL) return json({ error: "No speech recognition engine is configured." }, 503);
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not allowed." }, 403);
  let form; try { form = await request.formData(); } catch { return json({ error: "Please upload an audio track." }, 400); }
  const audio = form.get("audio"), provider = ["hohe", "whisper"].includes(form.get("provider")) ? form.get("provider") : "google";
  if (!(audio instanceof File)) return json({ error: "No audio file was received." }, 400);
  if (!["audio/wav", "audio/x-wav"].includes(audio.type)) return json({ error: "Audio must be WAV format." }, 415);
  if (audio.size < 44 || audio.size > MAX_AUDIO_BYTES) return json({ error: "Audio must be between 44 bytes and 24 MB." }, 413);
  try {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const segments = provider === "hohe" ? await hoheTranscribe(audio, env) : provider === "google" ? await googleTranscribe(bytes, env) : await whisperTranscribe(bytes, env);
    if (!segments.length) return json({ error: "No speech was recognized. Try a clearer recording and listen again." }, 422);
    return json({ text: segments.map(s => s.text).join(" "), segments, language: "am-ET", provider });
  } catch (error) {
    console.error("Transcription error:", error);
    const message = String(error?.message || "");
    return json({ error: message.includes("Google Chirp") || message.includes("Google Speech-to-Text") || message.includes("API key") ? message : "Transcription failed. Please retry or use the other speech engine." }, 502);
  }
}
export async function onRequestOptions() { return new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } }); }
