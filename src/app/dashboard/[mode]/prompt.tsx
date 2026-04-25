"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SUGGESTIONS_BY_MODE: Record<string, string[]> = {
  construction: [
    "marcá como hecha la inspección de seguridad",
    "agregá una tarea de pedir más varilla los miércoles",
    "¿qué proveedores tenemos pendientes de pagar esta semana?",
  ],
  inventory: [
    "marcá hecho el conteo cíclico de cemento",
    "agregá tarea: validar precios de varilla los lunes",
    "¿cuál es la cobertura colateral actual?",
  ],
  tiendita: [
    "marcá hecho el cobro de fiados de la semana",
    "ya repuse los huevos, marcá esa tarea",
    "agregá tarea: pedir más cervezas los jueves",
  ],
};

export function AgentPrompt({ slug, mode }: { slug: string; mode: string }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = SUGGESTIONS_BY_MODE[mode] ?? SUGGESTIONS_BY_MODE.construction;

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    setInput("");
    setReply(null);
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
      setReply(data.summary ?? "(sin resumen)");
      // Force a server-component refresh so tasks/score/anomalies update.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="px-4 sm:px-6 pt-4 sm:pt-5">
      <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-3 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-stretch gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="hablale al agente: marcá tareas, agregá rutinas, preguntá lo que sea…"
            disabled={pending}
            className="flex-1 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:border-emerald-700"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium px-4 transition-colors"
          >
            {pending ? "…" : "enviar"}
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={pending}
              className="text-[11px] px-2 py-1 rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        {pending && (
          <p className="text-xs text-amber-300 mt-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            opus está trabajando — esto suele tomar 5-15 segundos
          </p>
        )}
        {reply && (
          <p className="text-sm text-emerald-200/90 border-l-2 border-emerald-800 pl-3 mt-3 break-words">
            {reply}
          </p>
        )}
        {error && (
          <p className="text-xs text-rose-400 mt-2">⚠ {error}</p>
        )}
      </div>
    </section>
  );
}
