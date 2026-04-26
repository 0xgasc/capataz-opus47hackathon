"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";

const STASH_SERVER =
  process.env.NEXT_PUBLIC_STASH_SERVER ?? "https://stash-production-47fc.up.railway.app";

type StashUpload = { url: string; id: string; size: number; contentType: string };

async function uploadToStash(file: File, onProgress: (pct: number) => void): Promise<StashUpload> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${STASH_SERVER}/tus-upload`,
      retryDelays: [0, 1000, 3000],
      chunkSize: 5 * 1024 * 1024,
      metadata: { filename: file.name, filetype: file.type },
      onError: (err) => reject(err),
      onProgress: (sent, total) => onProgress(total > 0 ? sent / total : 0),
      onSuccess: async () => {
        try {
          const uploadUrl = upload.url ?? "";
          const uploadId = uploadUrl.split("/").pop() ?? "";
          const res = await fetch(`${STASH_SERVER}/tus-upload/complete`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ uploadId, originalFilename: file.name }),
          });
          if (!res.ok) {
            reject(new Error(`stash complete failed: ${res.status}`));
            return;
          }
          const data = (await res.json()) as StashUpload;
          resolve(data);
        } catch (err) {
          reject(err);
        }
      },
    });
    upload.start();
  });
}

type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function ChatInput({
  slug,
  mode,
  suggestions,
}: {
  slug: string;
  mode: string;
  suggestions: string[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; url?: string; pct: number } | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechCtor() !== null);
  }, []);

  function startListening() {
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      setError("tu navegador no soporta dictado por voz (probá Chrome/Edge/Safari)");
      return;
    }
    const rec = new Ctor();
    rec.lang = "es-GT";
    rec.interimResults = true;
    rec.continuous = false;
    let last = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      last = text;
      setInput(text);
    };
    rec.onerror = (e) => {
      setError(`error de dictado: ${e.error}`);
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      if (last.trim()) {
        // small delay so React state is flushed first
        setTimeout(() => void send(last.trim()), 50);
      }
    };
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }

  function stopListening() {
    recRef.current?.stop();
    setListening(false);
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    const imageUrl = pendingImage?.url;
    if (!message && !imageUrl) return;
    if (pending) return;
    setInput("");
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/dashboard/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, message, image_url: imageUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPendingImage(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function onFilePicked(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("solo imágenes por ahora");
      return;
    }
    setError(null);
    setPendingImage({ file, pct: 0 });
    try {
      const result = await uploadToStash(file, (pct) =>
        setPendingImage((cur) => (cur && cur.file === file ? { ...cur, pct } : cur)),
      );
      setPendingImage({ file, url: result.url, pct: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPendingImage(null);
    }
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80 px-3 sm:px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-wrap gap-1.5 mb-2 max-w-3xl mx-auto">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => void send(s)}
            disabled={pending || listening}
            className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      {pendingImage && (
        <div className="max-w-3xl mx-auto mb-2 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs">
          <span className="text-zinc-400 truncate flex-1">
            📎 {pendingImage.file.name}{" "}
            {pendingImage.url ? (
              <span className="text-emerald-400">listo</span>
            ) : (
              <span className="text-amber-400">subiendo {Math.round(pendingImage.pct * 100)}%</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            className="text-zinc-500 hover:text-rose-400"
          >
            quitar
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 max-w-3xl mx-auto"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFilePicked(f);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending || listening || !!pendingImage}
          aria-label="subir imagen"
          title="subir foto"
          className="shrink-0 h-12 w-12 rounded-full flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors"
        >
          📎
        </button>
        {voiceSupported && (
          <button
            type="button"
            onClick={() => (listening ? stopListening() : startListening())}
            disabled={pending}
            aria-label={listening ? "detener dictado" : "dictar por voz"}
            className={`shrink-0 h-12 w-12 rounded-full flex items-center justify-center transition-colors ${
              listening
                ? "bg-rose-700 hover:bg-rose-600 text-white animate-pulse"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
            title={listening ? "tocá para parar" : "tocá para dictar"}
          >
            {listening ? "■" : "🎤"}
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={listening ? "escuchando…" : "hablale a CAPA…"}
          rows={1}
          disabled={pending}
          className="flex-1 resize-none bg-zinc-900/80 border border-zinc-800 rounded-2xl px-4 py-3 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700 max-h-32"
        />
        <button
          type="submit"
          disabled={pending || (!input.trim() && !pendingImage?.url)}
          className="rounded-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium px-5 py-3 shrink-0 transition-colors"
        >
          {pending ? "…" : "enviar"}
        </button>
      </form>
      {pending && (
        <p className="text-[11px] text-amber-300 mt-2 text-center flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          CAPA está pensando…
        </p>
      )}
      {error && (
        <p className="text-[11px] text-rose-400 mt-2 text-center">⚠ {error}</p>
      )}
    </div>
  );
}
