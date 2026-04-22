// Spanish voice note → text via Groq Whisper (whisper-large-v3, free tier).
// If GROQ_API_KEY is missing we gracefully degrade — the event still flows, just
// with a placeholder transcript. Get a key at https://console.groq.com/keys.

export type TranscriptionResult = {
  text: string;
  provider: "groq" | "none";
  durationMs: number;
};

export async function transcribeSpanish(
  buffer: Buffer,
  mime: string,
): Promise<TranscriptionResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return {
      text: "[sin transcripción — GROQ_API_KEY no configurado]",
      provider: "none",
      durationMs: 0,
    };
  }

  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "mp3";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-large-v3");
  form.append("language", "es");
  form.append("response_format", "json");

  const started = Date.now();
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  const durationMs = Date.now() - started;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[transcribe.groq] ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { text?: string };
  return {
    text: data.text?.trim() ?? "",
    provider: "groq",
    durationMs,
  };
}
