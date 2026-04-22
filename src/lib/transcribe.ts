// Spanish voice note → text. Tries Groq (free-tier whisper-large-v3) first, then OpenAI.
// Both speak the same OpenAI-compatible multipart API, so the only delta is base URL + model.

type Provider = { name: string; url: string; model: string; key: string };

function pickProvider(): Provider | null {
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    return {
      name: "groq",
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      model: "whisper-large-v3",
      key: groq,
    };
  }
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    return {
      name: "openai",
      url: "https://api.openai.com/v1/audio/transcriptions",
      model: "whisper-1",
      key: openai,
    };
  }
  return null;
}

export type TranscriptionResult = {
  text: string;
  provider: string | "none";
  durationMs: number;
};

export async function transcribeSpanish(
  buffer: Buffer,
  mime: string,
): Promise<TranscriptionResult> {
  const provider = pickProvider();
  if (!provider) {
    return {
      text: "[sin transcripción — no hay GROQ_API_KEY ni OPENAI_API_KEY configurado]",
      provider: "none",
      durationMs: 0,
    };
  }

  const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "m4a" : "mp3";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), `audio.${ext}`);
  form.append("model", provider.model);
  form.append("language", "es");
  form.append("response_format", "json");

  const started = Date.now();
  const res = await fetch(provider.url, {
    method: "POST",
    headers: { authorization: `Bearer ${provider.key}` },
    body: form,
  });
  const durationMs = Date.now() - started;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[transcribe.${provider.name}] ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as { text?: string };
  return {
    text: data.text?.trim() ?? "",
    provider: provider.name,
    durationMs,
  };
}
