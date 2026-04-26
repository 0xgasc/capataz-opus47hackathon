"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";

const STASH_SERVER =
  process.env.NEXT_PUBLIC_STASH_SERVER ?? "https://stash-production-47fc.up.railway.app";

async function uploadToStash(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${STASH_SERVER}/tus-upload`,
      retryDelays: [0, 1000, 3000],
      chunkSize: 5 * 1024 * 1024,
      metadata: { filename: file.name, filetype: file.type },
      onError: reject,
      onProgress: (sent, total) => onProgress(total > 0 ? sent / total : 0),
      onSuccess: async () => {
        try {
          const uploadId = (upload.url ?? "").split("/").pop() ?? "";
          const res = await fetch(`${STASH_SERVER}/tus-upload/complete`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ uploadId, originalFilename: file.name }),
          });
          if (!res.ok) { reject(new Error("stash complete failed")); return; }
          const data = await res.json() as { url: string };
          resolve(data.url);
        } catch (err) { reject(err); }
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
  start(): void;
  stop(): void;
};
type SpeechRecognitionCtor = new () => SpeechRecognition;
function getSpeechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type AttachmentType = "image" | "pdf" | "document";

function detectType(file: File): AttachmentType {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) return "pdf";
  return "document";
}

function fileIcon(type: AttachmentType) {
  if (type === "image") return "📷";
  if (type === "pdf") return "📄";
  return "📎";
}

type Msg = {
  role: "user" | "assistant";
  content: string;
  attachmentUrl?: string;
  attachmentType?: AttachmentType;
  thinking?: string | null;
};

const STARTER: Msg = {
  role: "assistant",
  content: "Hola, soy CAPA. Contame tu situación — qué llevás, qué te gustaría no olvidarte, qué querés tener organizado.",
};

function ThinkingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-zinc-800/60 border border-zinc-700 rounded-2xl rounded-bl-md px-4 py-3 inline-flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
              style={{
                animation: "capa-bounce 1.2s ease-in-out infinite",
                animationDelay: `${i * 0.18}s`,
              }}
            />
          ))}
        </div>
        <p className="text-[10px] uppercase tracking-widest text-violet-400 flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400"
            style={{ animation: "capa-pulse 2s ease-in-out infinite" }}
          />
          Opus 4.7 · adaptive thinking
        </p>
      </div>
    </div>
  );
}

export function OnboardChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([STARTER]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingFile, setPendingFile] = useState<{ file: File; type: AttachmentType; url?: string; pct: number } | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setVoiceSupported(getSpeechCtor() !== null);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function startListening() {
    const Ctor = getSpeechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "es-GT";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const t = Array.from(e.results as unknown as ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>)
        .map((r) => r[0].transcript)
        .join(" ");
      setInput((cur) => (cur ? cur + " " + t : t));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stopListening() {
    recRef.current?.stop();
    setListening(false);
  }

  async function onFilePicked(file: File) {
    setError(null);
    const type = detectType(file);
    setPendingFile({ file, type, pct: 0 });
    try {
      const url = await uploadToStash(file, (pct) =>
        setPendingFile((cur) => cur && cur.file === file ? { ...cur, pct } : cur)
      );
      setPendingFile({ file, type, url, pct: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "error subiendo archivo");
      setPendingFile(null);
    }
  }

  async function send() {
    const text = input.trim();
    const attachmentUrl = pendingFile?.url;
    const attachmentType = pendingFile?.type;
    if ((!text && !attachmentUrl) || pending) return;
    setInput("");
    setPendingFile(null);
    setError(null);

    const icon = attachmentType ? fileIcon(attachmentType) : "📎";
    const userMsg: Msg = {
      role: "user",
      content: text || `${icon} archivo adjunto`,
      attachmentUrl,
      attachmentType,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setPending(true);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text || "Adjunté un archivo.",
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setMessages((cur) => [
        ...cur,
        { role: "assistant", content: data.reply ?? "(sin respuesta)", thinking: data.thinking ?? null },
      ]);
      if (data.done && data.redirect) {
        setTimeout(() => router.push(data.redirect), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes capa-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes capa-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
      `}</style>

      <div className="flex flex-col flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
        {/* Message list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-[320px] max-h-[55vh]">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[88%]">
                {m.attachmentUrl && m.attachmentType === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.attachmentUrl}
                    alt="adjunto"
                    className="max-h-48 w-auto rounded-xl rounded-br-md mb-1.5 border border-emerald-800/60"
                  />
                )}
                {m.attachmentUrl && m.attachmentType !== "image" && (
                  <a
                    href={m.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 mb-1.5 underline underline-offset-2"
                  >
                    {fileIcon(m.attachmentType ?? "document")} {m.attachmentType === "pdf" ? "PDF adjunto" : "Documento adjunto"}
                  </a>
                )}
                <div className={`text-sm rounded-2xl px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-emerald-900/40 text-emerald-50 border border-emerald-800/60 rounded-br-md"
                    : "bg-zinc-800/80 text-zinc-100 border border-zinc-700 rounded-bl-md"
                }`}>
                  {m.content}
                </div>
                {m.thinking && (
                  <p className="mt-1.5 text-[10px] uppercase tracking-wider text-violet-400">
                    💭 razonó extendido
                  </p>
                )}
              </div>
            </div>
          ))}

          {pending && <ThinkingIndicator />}
          {error && <p className="text-xs text-rose-400 px-1">⚠ {error}</p>}
        </div>

        {/* Pending file preview */}
        {pendingFile && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs">
            <span className="shrink-0">{fileIcon(pendingFile.type)}</span>
            <span className="text-zinc-400 truncate flex-1">
              {pendingFile.file.name}{" "}
              {pendingFile.url
                ? <span className="text-emerald-400">listo</span>
                : <span className="text-amber-400">subiendo {Math.round(pendingFile.pct * 100)}%</span>
              }
            </span>
            <button type="button" onClick={() => setPendingFile(null)} className="text-zinc-500 hover:text-rose-400">
              quitar
            </button>
          </div>
        )}

        {/* Input row */}
        <form
          onSubmit={(e) => { e.preventDefault(); void send(); }}
          className="flex items-end gap-2 border-t border-zinc-800 bg-zinc-900/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf,.pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
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
            disabled={pending || !!pendingFile}
            title="adjuntar archivo"
            className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 transition-colors text-base"
          >
            📎
          </button>

          {voiceSupported && (
            <button
              type="button"
              onClick={() => listening ? stopListening() : startListening()}
              disabled={pending}
              title={listening ? "parar" : "dictar"}
              className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-colors text-base ${
                listening
                  ? "bg-rose-700 hover:bg-rose-600 text-white animate-pulse"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              }`}
            >
              {listening ? "■" : "🎤"}
            </button>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            placeholder={listening ? "escuchando…" : "contame de tu situación…"}
            rows={2}
            disabled={pending}
            className="flex-1 resize-none bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700"
          />

          <button
            type="submit"
            disabled={pending || (!input.trim() && !pendingFile?.url)}
            className="shrink-0 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {pending ? "…" : "enviar"}
          </button>
        </form>
      </div>
    </>
  );
}
