"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTER: Msg = {
  role: "assistant",
  content: "Hola, soy Capataz. Contame qué negocio tenés y qué te gustaría que te ayude a llevar.",
};

export function OnboardChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([STARTER]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setPending(true);
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setMessages((cur) => [...cur, { role: "assistant", content: data.reply ?? "(sin respuesta)" }]);
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
    <div className="flex flex-col flex-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-[320px] max-h-[60vh]">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] text-sm rounded-2xl px-3.5 py-2 leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-emerald-900/40 text-emerald-50 border border-emerald-800/60 rounded-br-md"
                  : "bg-zinc-800/80 text-zinc-100 border border-zinc-700 rounded-bl-md"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/60 border border-zinc-700 text-zinc-400 text-xs px-3 py-2 rounded-2xl rounded-bl-md inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              opus pensando…
            </div>
          </div>
        )}
        {error && (
          <p className="text-xs text-rose-400 px-1">⚠ {error}</p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 border-t border-zinc-800 bg-zinc-900/80 p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="contame de tu negocio…"
          rows={2}
          className="flex-1 resize-none bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          enviar
        </button>
      </form>
    </div>
  );
}
