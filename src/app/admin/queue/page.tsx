// Honest module-request queue. Every "I want this" the operators have asked for
// that wasn't already in the catalog ends up here. The platform team works
// through it. Built so the page is auditable: nothing is silently dropped.

import Link from "next/link";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Capataz · roadmap" };

type QueuedRow = {
  id: string;
  user_message: string;
  agent_reply: string | null;
  status: string;
  matched_module_key: string | null;
  created_by: string | null;
  created_at: Date | string;
  business_slug: string;
  business_name: string;
};

function fmt(s: Date | string): string {
  return new Date(s).toLocaleString("es-GT", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  queued: { label: "queued", tone: "bg-zinc-800 text-zinc-300 border-zinc-700" },
  in_review: { label: "in review", tone: "bg-amber-950/40 text-amber-300 border-amber-900/60" },
  matched: { label: "matched", tone: "bg-emerald-950/40 text-emerald-300 border-emerald-900/60" },
  installed: { label: "installed", tone: "bg-emerald-900/40 text-emerald-200 border-emerald-700" },
  declined: { label: "declined", tone: "bg-zinc-800 text-zinc-500 border-zinc-700" },
  shipped: { label: "shipped", tone: "bg-emerald-900/40 text-emerald-200 border-emerald-700" },
};

export default async function AdminQueuePage() {
  const requests = await sql<QueuedRow[]>`
    select mr.id, mr.user_message, mr.agent_reply, mr.status, mr.matched_module_key,
           mr.created_by, mr.created_at,
           b.slug as business_slug, b.name as business_name
    from module_requests mr
    join businesses b on b.id = mr.business_id
    order by mr.created_at desc
    limit 100
  `;

  const byStatus = new Map<string, number>();
  for (const r of requests) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <header className="mb-6">
          <Link
            href="/"
            className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
          >
            ← Capataz
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold mt-1">Roadmap · solicitudes</h1>
          <p className="text-sm text-zinc-400 mt-1 leading-relaxed max-w-2xl">
            Cada vez que un operador le pide a Capataz una capacidad nueva, el agente
            decide si ya existe en el catálogo (matched) o si la dejamos pendiente para el
            equipo (queued). Acá ves la lista completa — sin filtrar, sin esconder.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 mb-5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
            Distribución por estado
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from(byStatus.entries()).map(([status, count]) => {
              const st = STATUS_LABEL[status] ?? STATUS_LABEL.queued;
              return (
                <span
                  key={status}
                  className={`text-[12px] px-2.5 py-1 rounded-md border ${st.tone}`}
                >
                  {st.label} · {count}
                </span>
              );
            })}
          </div>
        </section>

        {requests.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            Aún no hay solicitudes. Capataz te avisa acá cuando alguien pide algo nuevo.
          </p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r) => {
              const st = STATUS_LABEL[r.status] ?? STATUS_LABEL.queued;
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                >
                  <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                    <Link
                      href={`/dashboard/${r.business_slug}`}
                      className="text-sm font-medium text-zinc-100 hover:text-emerald-300"
                    >
                      {r.business_name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-500">{fmt(r.created_at)}</span>
                      <span
                        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${st.tone}`}
                      >
                        {st.label}
                      </span>
                    </div>
                  </div>
                  <p className="text-[14px] text-zinc-200 break-words italic">
                    "{r.user_message}"
                  </p>
                  {r.agent_reply && (
                    <p className="text-[12px] text-zinc-400 mt-2 break-words">
                      <span className="text-zinc-500">Capataz:</span> {r.agent_reply}
                    </p>
                  )}
                  {r.matched_module_key && (
                    <p className="text-[10px] text-emerald-400 mt-1.5 uppercase tracking-wider">
                      → {r.matched_module_key}
                    </p>
                  )}
                  {r.created_by && (
                    <p className="text-[10px] text-zinc-600 mt-1">
                      pedido por {r.created_by}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
