"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type TaskItem = {
  id: string;
  title: string;
  detail: string | null;
  cadence: string;
  category: string | null;
  status: string;
};

const CADENCE_LABEL: Record<string, string> = {
  daily: "diaria",
  weekly: "semanal",
  monthly: "mensual",
  as_needed: "según necesidad",
  one_off: "una vez",
};

export function TaskList({ slug, tasks }: { slug: string; tasks: TaskItem[] }) {
  const router = useRouter();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");

  async function complete(taskId: string) {
    setPendingId(taskId);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", slug, task_id: taskId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  async function sendComment(taskId: string) {
    const text = comment.trim();
    if (!text) return;
    setPendingId(taskId);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "comment", slug, task_id: taskId, message: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setComment("");
      setOpenTaskId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-zinc-500 px-1 py-2">
        Aún no hay protocolo. Pedíle a Capataz que te agregue tareas.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {pending.map((t) => {
        const isPending = pendingId === t.id;
        const isOpen = openTaskId === t.id;
        return (
          <div
            key={t.id}
            className="group rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors"
          >
            <div className="flex items-start gap-3 px-3 sm:px-4 py-3">
              <button
                type="button"
                onClick={() => complete(t.id)}
                disabled={isPending}
                aria-label={`Marcar "${t.title}" como hecha`}
                className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-zinc-600 hover:border-emerald-500 hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-zinc-100 leading-snug break-words">{t.title}</p>
                {t.detail && (
                  <p className="text-[12px] text-zinc-500 mt-0.5 leading-snug break-words">
                    {t.detail}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                  <span>{CADENCE_LABEL[t.cadence] ?? t.cadence}</span>
                  {t.category && (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span>{t.category}</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenTaskId(isOpen ? null : t.id)}
                className="shrink-0 text-zinc-500 hover:text-zinc-200 text-xs px-2 py-1 rounded hover:bg-zinc-800/80 transition-colors"
                title="comentarle a Capataz sobre esta tarea"
              >
                💬
              </button>
            </div>
            {isOpen && (
              <div className="px-3 sm:px-4 pb-3 pt-1 border-t border-zinc-800/60">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="contale a Capataz qué pasó con esta tarea…"
                  rows={2}
                  className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
                <div className="flex gap-2 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenTaskId(null);
                      setComment("");
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5"
                  >
                    cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => sendComment(t.id)}
                    disabled={isPending || !comment.trim()}
                    className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {isPending ? "enviando…" : "enviar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {done.length > 0 && (
        <details className="mt-3">
          <summary className="text-[12px] text-zinc-500 hover:text-zinc-300 cursor-pointer px-1">
            {done.length} hechas
          </summary>
          <ul className="mt-2 space-y-1">
            {done.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-500"
              >
                <span className="h-4 w-4 rounded-full bg-emerald-900/40 border border-emerald-800/60 flex items-center justify-center text-[10px] text-emerald-300">
                  ✓
                </span>
                <span className="line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p className="text-[11px] text-rose-400 px-1">⚠ {error}</p>
      )}
    </div>
  );
}
