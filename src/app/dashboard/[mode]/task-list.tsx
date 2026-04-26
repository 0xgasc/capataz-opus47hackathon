"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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

export type TaskItem = {
  id: string;
  title: string;
  detail: string | null;
  cadence: string;
  category: string | null;
  status: string;
  evidence_required: string | null;
};

const CADENCE_LABEL: Record<string, string> = {
  daily: "diaria",
  weekly: "semanal",
  monthly: "mensual",
  as_needed: "según necesidad",
  one_off: "una vez",
};

function EvidenceForm({
  task,
  slug,
  onDone,
  onCancel,
}: {
  task: TaskItem;
  slug: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const needsPhoto = task.evidence_required === "photo" || task.evidence_required === "any";
  const needsNote  = task.evidence_required === "note"  || task.evidence_required === "any";
  const satisfied  =
    !task.evidence_required ||
    (task.evidence_required === "photo" && !!mediaUrl) ||
    (task.evidence_required === "note"  && !!note.trim()) ||
    (task.evidence_required === "any"   && (!!mediaUrl || !!note.trim()));

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadPct(0); setError(null);
    try {
      const url = await uploadToStash(file, setUploadPct);
      setMediaUrl(url);
    } catch {
      setError("Error subiendo foto");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!satisfied) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          slug,
          task_id: task.id,
          note: note.trim() || undefined,
          media_url: mediaUrl ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-3 sm:px-4 pb-3 pt-2 border-t border-zinc-800/60 space-y-2">
      {(needsNote || task.evidence_required === "any") && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="nota sobre esta tarea…"
          rows={2}
          className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700 resize-none"
        />
      )}
      {(needsPhoto || task.evidence_required === "any") && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 transition-colors disabled:opacity-50"
          >
            {uploading ? `Subiendo ${Math.round(uploadPct * 100)}%…` : mediaUrl ? "✓ foto adjunta" : "📷 adjuntar foto"}
          </button>
          {mediaUrl && (
            <button type="button" onClick={() => setMediaUrl(null)} className="text-xs text-zinc-500 hover:text-rose-400">
              quitar
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </div>
      )}
      {task.evidence_required && !satisfied && (
        <p className="text-[11px] text-amber-400">
          {task.evidence_required === "photo" ? "Adjuntá una foto para continuar"
            : task.evidence_required === "note" ? "Escribí una nota para continuar"
            : "Adjuntá una foto o escribí una nota para continuar"}
        </p>
      )}
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5">
          cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting || uploading || !satisfied}
          className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg px-3 py-1.5 transition-colors"
        >
          {submitting ? "guardando…" : "marcar hecha"}
        </button>
      </div>
    </div>
  );
}

export function TaskList({ slug, tasks }: { slug: string; tasks: TaskItem[] }) {
  const router = useRouter();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [evidenceTaskId, setEvidenceTaskId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const done    = tasks.filter((t) => t.status === "done");

  async function complete(task: TaskItem) {
    if (task.evidence_required) {
      setEvidenceTaskId(task.id);
      return;
    }
    setPendingId(task.id); setError(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", slug, task_id: task.id }),
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
    setPendingId(taskId); setError(null);
    try {
      const res = await fetch("/api/dashboard/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "comment", slug, task_id: taskId, message: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setComment(""); setOpenTaskId(null); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingId(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-zinc-500 px-1 py-2">
        Aún no hay protocolo. Pedíle a CAPA que te agregue tareas.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {pending.map((t) => {
        const isBusy   = pendingId === t.id;
        const isComment = openTaskId === t.id;
        const isEvidence = evidenceTaskId === t.id;
        return (
          <div key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/70 transition-colors">
            <div className="flex items-start gap-3 px-3 sm:px-4 py-3">
              <button
                type="button"
                onClick={() => complete(t)}
                disabled={isBusy}
                aria-label={`Marcar "${t.title}" como hecha`}
                className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-zinc-600 hover:border-emerald-500 hover:bg-emerald-900/30 disabled:opacity-50 transition-colors"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] text-zinc-100 leading-snug break-words">{t.title}</p>
                {t.detail && (
                  <p className="text-[12px] text-zinc-500 mt-0.5 leading-snug break-words">{t.detail}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {CADENCE_LABEL[t.cadence] ?? t.cadence}
                  </span>
                  {t.category && (
                    <>
                      <span className="text-zinc-700 text-[10px]">·</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{t.category}</span>
                    </>
                  )}
                  {t.evidence_required && (
                    <>
                      <span className="text-zinc-700 text-[10px]">·</span>
                      <span className="text-[10px] uppercase tracking-wider text-amber-500">
                        {t.evidence_required === "photo" ? "📷 foto" : t.evidence_required === "note" ? "✍️ nota" : "📷 o nota"}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenTaskId(isComment ? null : t.id)}
                className="shrink-0 text-zinc-500 hover:text-zinc-200 text-xs px-2 py-1 rounded hover:bg-zinc-800/80 transition-colors"
                title="comentarle a CAPA sobre esta tarea"
              >
                💬
              </button>
            </div>

            {isEvidence && (
              <EvidenceForm
                task={t}
                slug={slug}
                onDone={() => setEvidenceTaskId(null)}
                onCancel={() => setEvidenceTaskId(null)}
              />
            )}

            {isComment && !isEvidence && (
              <div className="px-3 sm:px-4 pb-3 pt-1 border-t border-zinc-800/60">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="contale a CAPA qué pasó con esta tarea…"
                  rows={2}
                  className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
                <div className="flex gap-2 justify-end mt-2">
                  <button type="button" onClick={() => { setOpenTaskId(null); setComment(""); }} className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5">
                    cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => sendComment(t.id)}
                    disabled={isBusy || !comment.trim()}
                    className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg px-3 py-1.5 transition-colors"
                  >
                    {isBusy ? "enviando…" : "enviar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {done.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-900/60 transition-colors text-sm"
          >
            <span className="flex items-center gap-2 text-zinc-400">
              <span className="h-4 w-4 rounded-full bg-emerald-900/60 border border-emerald-800 flex items-center justify-center text-[9px] text-emerald-300">✓</span>
              {done.length} {done.length === 1 ? "tarea completada" : "tareas completadas"}
            </span>
            <span className="text-zinc-600 text-xs">{showDone ? "ocultar ↑" : "ver ↓"}</span>
          </button>
          {showDone && (
            <ul className="mt-1.5 space-y-1">
              {done.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-zinc-800/40 bg-zinc-900/20 text-sm text-zinc-500">
                  <span className="h-4 w-4 shrink-0 rounded-full bg-emerald-900/40 border border-emerald-800/60 flex items-center justify-center text-[9px] text-emerald-400">✓</span>
                  <span className="flex-1 line-through break-words">{t.title}</span>
                  {t.evidence_required && (
                    <span className="text-[10px] text-zinc-600 shrink-0">
                      {t.evidence_required === "photo" ? "📷" : t.evidence_required === "note" ? "✍️" : "📷/✍️"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-[11px] text-rose-400 px-1">⚠ {error}</p>}
    </div>
  );
}
