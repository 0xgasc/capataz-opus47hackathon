"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SUGGESTIONS_BY_MODE: Record<string, string[]> = {
  construction: [
    "llegaron 50 sacos de cemento",
    "agregá tarea: revisar varilla los miércoles",
    "¿qué tengo pendiente hoy?",
  ],
  inventory: [
    "salieron 200 sacos de cemento a Constructora Progreso",
    "marcá hecho el conteo de hoy",
    "¿qué pendientes tengo esta semana?",
  ],
  tiendita: [
    "vendí 2 cervezas a Don Chepe que paga viernes",
    "ya repuse los huevos",
    "agregá tarea: pedir tortillas martes",
  ],
};

export function ChatInput({ slug, mode }: { slug: string; mode: string }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestions = SUGGESTIONS_BY_MODE[mode] ?? SUGGESTIONS_BY_MODE.construction;

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    setInput("");
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/dashboard/prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
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
            disabled={pending}
            className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 max-w-3xl mx-auto"
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
          placeholder="hablale a Capataz…"
          rows={1}
          disabled={pending}
          className="flex-1 resize-none bg-zinc-900/80 border border-zinc-800 rounded-2xl px-4 py-3 text-[15px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700 max-h-32"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="rounded-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium px-5 py-3 shrink-0 transition-colors"
        >
          {pending ? "…" : "enviar"}
        </button>
      </form>
      {pending && (
        <p className="text-[11px] text-amber-300 mt-2 text-center flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          Capataz está pensando…
        </p>
      )}
      {error && (
        <p className="text-[11px] text-rose-400 mt-2 text-center">⚠ {error}</p>
      )}
    </div>
  );
}
