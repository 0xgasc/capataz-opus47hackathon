"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ModuleSuggestion = {
  key: string;
  name: string;
  pitch: string;
};

export function ModuleSuggestion({
  slug,
  suggestion,
}: {
  slug: string;
  suggestion: ModuleSuggestion;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"enable" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "enable" | "decline") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/modules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, module_key: suggestion.key, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="px-4 sm:px-5 pt-4">
      <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/15 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-800/60 bg-emerald-950/40 text-emerald-300 shrink-0">
            módulo sugerido
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] text-zinc-100 font-medium">{suggestion.name}</p>
            <p className="text-[13px] text-zinc-400 leading-relaxed mt-1">{suggestion.pitch}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-3">
          <button
            type="button"
            onClick={() => act("decline")}
            disabled={pending !== null}
            className="text-[12px] text-zinc-500 hover:text-zinc-300 px-3 py-1.5 disabled:opacity-50"
          >
            ahora no
          </button>
          <button
            type="button"
            onClick={() => act("enable")}
            disabled={pending !== null}
            className="text-[12px] bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg px-3 py-1.5 transition-colors"
          >
            {pending === "enable" ? "activando…" : "activar"}
          </button>
        </div>
        {error && <p className="text-[11px] text-rose-400 mt-2">⚠ {error}</p>}
      </div>
    </section>
  );
}
