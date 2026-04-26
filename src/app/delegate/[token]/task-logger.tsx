"use client";

import { useState, useRef } from "react";
import * as tus from "tus-js-client";

const STASH_SERVER =
  process.env.NEXT_PUBLIC_STASH_SERVER ?? "https://stash-production-47fc.up.railway.app";

type Task = {
  id: string;
  title: string;
  detail: string | null;
  category: string | null;
  status: string;
  evidence_required: string | null;
};

type LogState = {
  note: string;
  uploading: boolean;
  uploadPct: number;
  mediaUrl: string | null;
  submitting: boolean;
  done: boolean;
  error: string | null;
};

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

function TaskCard({
  task,
  token,
  onLogged,
}: {
  task: Task;
  token: string;
  onLogged: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LogState>({
    note: "", uploading: false, uploadPct: 0, mediaUrl: null,
    submitting: false, done: task.status === "done", error: null,
  });
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState((s) => ({ ...s, uploading: true, uploadPct: 0, error: null }));
    try {
      const url = await uploadToStash(file, (pct) =>
        setState((s) => ({ ...s, uploadPct: pct }))
      );
      setState((s) => ({ ...s, uploading: false, mediaUrl: url }));
    } catch {
      setState((s) => ({ ...s, uploading: false, error: "Error subiendo foto" }));
    }
  }

  const needsPhoto = task.evidence_required === "photo" || task.evidence_required === "any";
  const needsNote  = task.evidence_required === "note"  || task.evidence_required === "any";
  const evidenceSatisfied =
    !task.evidence_required ||
    (needsPhoto && !!state.mediaUrl) ||
    (needsNote  && !!state.note.trim()) ||
    (task.evidence_required === "any" && (!!state.mediaUrl || !!state.note.trim()));

  async function submit() {
    if (!evidenceSatisfied) return;
    setState((s) => ({ ...s, submitting: true, error: null }));
    try {
      const res = await fetch("/api/delegate/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          task_id: task.id,
          note: state.note || undefined,
          media_url: state.mediaUrl ?? undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "error");
      setState((s) => ({ ...s, submitting: false, done: true }));
      setOpen(false);
      onLogged(task.id);
    } catch (err) {
      setState((s) => ({
        ...s,
        submitting: false,
        error: err instanceof Error ? err.message : "error al guardar",
      }));
    }
  }

  const isDone = state.done;

  return (
    <div className={`rounded-xl border transition-colors ${
      isDone
        ? "border-emerald-900/40 bg-emerald-950/20"
        : "border-zinc-800 bg-zinc-900/50"
    }`}>
      <div className="flex items-start gap-3 p-4">
        {/* Status dot / check */}
        <button
          onClick={() => !isDone && setOpen((o) => !o)}
          disabled={isDone}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
            isDone
              ? "border-emerald-500 bg-emerald-500"
              : "border-zinc-600 hover:border-emerald-400"
          }`}
        >
          {isDone && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${isDone ? "text-zinc-400 line-through" : "text-zinc-100"}`}>
            {task.title}
          </p>
          {task.detail && (
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{task.detail}</p>
          )}
          {task.category && (
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 mt-1 inline-block">
              {task.category}
            </span>
          )}
          {task.evidence_required && !isDone && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-400 bg-amber-950/30 border border-amber-900/40 rounded px-1.5 py-0.5">
              {task.evidence_required === "photo" ? "📷 foto requerida" : task.evidence_required === "note" ? "✍️ nota requerida" : "📷 o nota requerida"}
            </span>
          )}
        </div>

        {!isDone && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-[11px] uppercase tracking-wider text-emerald-400 hover:text-emerald-300 shrink-0 pt-0.5"
          >
            {open ? "Cancelar" : "Registrar"}
          </button>
        )}
      </div>

      {/* Log form */}
      {open && !isDone && (
        <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3">
          <textarea
            value={state.note}
            onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))}
            placeholder="Nota opcional — ¿cómo quedó? ¿algo que el dueño deba saber?"
            rows={2}
            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 resize-none border border-zinc-700 focus:outline-none focus:border-emerald-600"
          />

          {/* Photo upload */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={state.uploading}
              className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors disabled:opacity-50"
            >
              {state.uploading
                ? `Subiendo ${Math.round(state.uploadPct * 100)}%…`
                : state.mediaUrl
                ? "✓ Foto adjunta"
                : "📷 Adjuntar foto"}
            </button>
            {state.mediaUrl && (
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, mediaUrl: null }))}
                className="text-xs text-zinc-500 hover:text-rose-400"
              >
                Quitar
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          {state.error && <p className="text-xs text-rose-400">{state.error}</p>}

          {task.evidence_required && !evidenceSatisfied && (
            <p className="text-xs text-amber-400 text-center">
              {task.evidence_required === "photo"
                ? "Adjuntá una foto para poder marcarla hecha"
                : task.evidence_required === "note"
                ? "Escribí una nota para poder marcarla hecha"
                : "Adjuntá una foto o escribí una nota para continuar"}
            </p>
          )}
          <button
            onClick={submit}
            disabled={state.submitting || state.uploading || !evidenceSatisfied}
            className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state.submitting ? "Guardando…" : "Marcar hecha"}
          </button>
        </div>
      )}
    </div>
  );
}

export function TaskLogger({ tasks: initial, token }: { tasks: Task[]; token: string }) {
  const [tasks, setTasks] = useState(initial);

  function onLogged(taskId: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: "done" } : t))
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} token={token} onLogged={onLogged} />
      ))}
      {tasks.length === 0 && (
        <div className="text-center py-8">
          <p className="text-2xl mb-2">✅</p>
          <p className="text-sm font-medium text-zinc-300">Todo listo por ahora.</p>
          <p className="text-xs text-zinc-500 mt-1">
            Las tareas recurrentes van a volver a aparecer según su cadencia.
          </p>
        </div>
      )}
    </div>
  );
}
