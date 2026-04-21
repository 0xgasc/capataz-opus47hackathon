import { sql } from "@/lib/db";
import { formatGTQ, formatDateTime } from "@/lib/format";
import { asObject } from "@/lib/json";
import { AutoRefresh } from "./refresh";

export const dynamic = "force-dynamic";

type Project = {
  id: string;
  name: string;
  client: string | null;
  total_budget_gtq: string;
  start_date: Date | string | null;
};

type EventRow = {
  id: string;
  type: string;
  payload: unknown;
  created_by: string | null;
  created_at: string;
};

type AnomalyRow = {
  id: string;
  kind: string;
  severity: string;
  status: string;
  agent_message: string | null;
  created_at: string;
};

async function loadDashboard() {
  const projects = await sql<Project[]>`
    select id, name, client, total_budget_gtq, start_date
    from projects
    order by created_at asc
    limit 1
  `;
  const project = projects[0];
  if (!project) return null;

  const spentRows = await sql<Array<{ spent: string }>>`
    select coalesce(sum(spent_gtq), 0)::text as spent
    from budget_items
    where project_id = ${project.id}
  `;
  const spent = Number(spentRows[0]?.spent ?? 0);
  const total = Number(project.total_budget_gtq);
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;

  const events = await sql<EventRow[]>`
    select id, type, payload, created_by, created_at
    from events
    where project_id = ${project.id}
    order by created_at desc
    limit 20
  `;

  const anomalies = await sql<AnomalyRow[]>`
    select id, kind, severity, status, agent_message, created_at
    from anomalies
    where project_id = ${project.id} and status = 'open'
    order by created_at desc
    limit 20
  `;

  return { project, spent, total, pct, events, anomalies };
}

function previewPayload(raw: unknown) {
  const p = asObject(raw);
  if (typeof p.text === "string") return p.text;
  if (typeof p.caption === "string") return p.caption;
  if (typeof p.file_id === "string") return `file_id: ${String(p.file_id).slice(0, 18)}…`;
  return JSON.stringify(p).slice(0, 120);
}

function EventTypeBadge({ type }: { type: string }) {
  const label =
    type === "text_message" ? "texto" :
    type === "voice_note"   ? "voz"   :
    type === "photo"        ? "foto"  :
    type;
  return (
    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
      {label}
    </span>
  );
}

export default async function DashboardPage() {
  const data = await loadDashboard();

  if (!data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <AutoRefresh />
        <p className="text-zinc-400">
          No hay proyectos en la base de datos. Ejecute <code className="text-amber-300">pnpm db:migrate</code>.
        </p>
      </main>
    );
  }

  const { project, spent, total, pct, events, anomalies } = data;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AutoRefresh />

      <header className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">Capataz · panel</p>
            <h1 className="text-2xl font-semibold mt-1">{project.name}</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {project.client ?? "—"} · inicio{" "}
              {project.start_date
                ? new Date(project.start_date).toISOString().slice(0, 10)
                : "—"}
            </p>
          </div>
          <div className="flex-1 min-w-[260px] max-w-md">
            <div className="flex items-baseline justify-between text-xs text-zinc-400 mb-1">
              <span>Presupuesto</span>
              <span>
                {formatGTQ(spent)} / {formatGTQ(total)}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${pct.toFixed(2)}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">{pct.toFixed(1)}% ejecutado</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 px-6 py-6">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
            Actividad reciente
          </h2>
          {events.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              Aún no hay eventos. Envíe un mensaje al bot de Telegram para comenzar.
            </p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                >
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <EventTypeBadge type={ev.type} />
                    <span>{ev.created_by ?? "—"}</span>
                    <span className="ml-auto tabular-nums">{formatDateTime(ev.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-100 break-words">
                    {previewPayload(ev.payload)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
            Anomalías abiertas
          </h2>
          {anomalies.length === 0 ? (
            <p className="text-zinc-500 text-sm">Sin anomalías por ahora.</p>
          ) : (
            <ul className="space-y-2">
              {anomalies.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3"
                >
                  <div className="flex items-center gap-3 text-xs text-amber-300">
                    <span className="uppercase tracking-wider">{a.severity}</span>
                    <span className="text-amber-500/70">·</span>
                    <span>{a.kind}</span>
                    <span className="ml-auto tabular-nums">{formatDateTime(a.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-100">{a.agent_message ?? "—"}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
