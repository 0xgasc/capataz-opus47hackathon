"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type HitlOpen = {
  id: string;
  question: string;
  context_summary: string | null;
  urgency: string;
  asked_at: string;
};

export function HitlCard({ slug, request }: { slug: string; request: HitlOpen }) {
  const router = useRouter();
  const [response, setResponse] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = response.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/hitl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, request_id: request.id, response: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResponse("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const tone =
    request.urgency === "high"
      ? "border-rose-800/70 bg-rose-950/20"
      : request.urgency === "low"
      ? "border-zinc-800 bg-zinc-900/40"
      : "border-violet-800/60 bg-violet-950/20";

  return (
    <section className="px-4 sm:px-5 pt-4">
      <div className={`rounded-xl border p-4 ${tone}`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-violet-800/60 bg-violet-950/40 text-violet-200 shrink-0">
            🤔 CAPA necesita guía
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] text-zinc-100 leading-relaxed break-words">
              {request.question}
            </p>
            {request.context_summary && (
              <p className="text-[12px] text-zinc-400 mt-1.5 leading-snug break-words">
                <span className="text-zinc-500">contexto:</span> {request.context_summary}
              </p>
            )}
          </div>
        </div>
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="contale a CAPA, la próxima vez ya sabe…"
          rows={2}
          disabled={pending}
          className="w-full mt-3 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-700"
        />
        <div className="flex items-center justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={send}
            disabled={pending || !response.trim()}
            className="text-[12px] bg-violet-700 hover:bg-violet-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            {pending ? "enviando…" : "responder y seguir"}
          </button>
        </div>
        {error && <p className="text-[11px] text-rose-400 mt-2">⚠ {error}</p>}
      </div>
    </section>
  );
}
