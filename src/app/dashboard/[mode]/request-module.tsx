"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ModuleRequestRow = {
  id: string;
  user_message: string;
  agent_reply: string | null;
  status: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  queued: { label: "anotado para el equipo", tone: "bg-zinc-800/60 text-zinc-300 border-zinc-700" },
  matched: { label: "tenemos algo similar", tone: "bg-emerald-900/30 text-emerald-300 border-emerald-800/60" },
  installed: { label: "activado", tone: "bg-emerald-900/40 text-emerald-200 border-emerald-700" },
  in_review: { label: "necesita más info", tone: "bg-amber-900/30 text-amber-200 border-amber-800/60" },
  declined: { label: "no aplica", tone: "bg-zinc-800/60 text-zinc-500 border-zinc-700" },
  shipped: { label: "ya disponible", tone: "bg-emerald-900/40 text-emerald-200 border-emerald-700" },
};

export function RequestModule({
  slug,
  recent,
}: {
  slug: string;
  recent: ModuleRequestRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const message = text.trim();
    if (!message || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/module-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, message }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setText("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="px-4 sm:px-5 pt-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-zinc-300 font-medium">
              ¿Te falta algo? Pediles a Capataz que arme un módulo nuevo.
            </p>
            <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
              Ej: "control de fiados de mis clientes", "mapa de rutas de entrega",
              "alertas cuando un cliente pase Q500 sin pagar".
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[12px] px-3 py-1.5 rounded-lg border border-emerald-800/60 bg-emerald-950/20 text-emerald-300 hover:bg-emerald-950/40 transition-colors shrink-0"
          >
            {open ? "cerrar" : "+ pedir módulo"}
          </button>
        </div>

        {open && (
          <div className="mt-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="describí qué necesitás…"
              rows={2}
              disabled={pending}
              className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700"
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setText("");
                }}
                className="text-[12px] text-zinc-500 hover:text-zinc-300 px-3 py-1.5"
              >
                cancelar
              </button>
              <button
                type="button"
                onClick={send}
                disabled={pending || !text.trim()}
                className="text-[12px] bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg px-3 py-1.5 transition-colors"
              >
                {pending ? "Capataz pensando…" : "enviar"}
              </button>
            </div>
            {error && <p className="text-[11px] text-rose-400 mt-2">⚠ {error}</p>}
          </div>
        )}

        {recent.length > 0 && (
          <ul className="mt-3 space-y-2">
            {recent.map((r) => {
              const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.queued;
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3"
                >
                  <p className="text-[12px] text-zinc-200 break-words">"{r.user_message}"</p>
                  {r.agent_reply && (
                    <p className="text-[12px] text-zinc-400 mt-1 italic break-words">
                      Capataz: {r.agent_reply}
                    </p>
                  )}
                  <span
                    className={`mt-1.5 inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${st.tone}`}
                  >
                    {st.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
