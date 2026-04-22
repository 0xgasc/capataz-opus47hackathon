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
  agent_status: string | null;
  agent_output: unknown;
};

type AnomalyRow = {
  id: string;
  kind: string;
  severity: string;
  status: string;
  agent_message: string | null;
  created_at: string;
};

type BudgetRow = {
  category: string;
  committed_gtq: string;
  spent_gtq: string;
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

  const budget = await sql<BudgetRow[]>`
    select category,
           coalesce(sum(qty * unit_cost_gtq), 0)::text as committed_gtq,
           coalesce(sum(spent_gtq), 0)::text as spent_gtq
    from budget_items
    where project_id = ${project.id}
    group by category
    order by coalesce(sum(qty * unit_cost_gtq), 0) desc
  `;

  const spent = budget.reduce((acc, b) => acc + Number(b.spent_gtq), 0);
  const total = Number(project.total_budget_gtq);
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;

  const events = await sql<EventRow[]>`
    select e.id, e.type, e.payload, e.created_by, e.created_at,
           ar.status as agent_status, ar.output as agent_output
    from events e
    left join lateral (
      select status, output
      from agent_runs
      where event_id = e.id
      order by started_at desc
      limit 1
    ) ar on true
    where e.project_id = ${project.id}
    order by e.created_at desc
    limit 20
  `;

  const anomalies = await sql<AnomalyRow[]>`
    select id, kind, severity, status, agent_message, created_at
    from anomalies
    where project_id = ${project.id} and status = 'open'
    order by created_at desc
    limit 20
  `;

  return { project, budget, spent, total, pct, events, anomalies };
}

function previewPayload(raw: unknown) {
  const p = asObject(raw);
  if (typeof p.text === "string") return p.text;
  if (typeof p.caption === "string") return p.caption;
  if (typeof p.file_id === "string") return `file_id: ${String(p.file_id).slice(0, 18)}…`;
  return JSON.stringify(p).slice(0, 160);
}

function agentSummary(raw: unknown): string | null {
  const o = asObject(raw);
  const s = typeof o.summary === "string" ? o.summary.trim() : "";
  return s || null;
}

function transcription(raw: unknown): string | null {
  const o = asObject(raw);
  const t = asObject(o.transcription);
  return typeof t.text === "string" && t.text ? t.text : null;
}

function toolsList(raw: unknown): string[] {
  const o = asObject(raw);
  if (!Array.isArray(o.toolsCalled)) return [];
  return (o.toolsCalled as Array<{ name?: unknown }>)
    .map((t) => (typeof t.name === "string" ? t.name : ""))
    .filter(Boolean);
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

function AgentStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-900 text-zinc-500 border border-zinc-800">
        pendiente
      </span>
    );
  }
  const map: Record<string, string> = {
    ok: "bg-emerald-950/40 text-emerald-300 border-emerald-900/60",
    degraded: "bg-amber-950/40 text-amber-300 border-amber-900/60",
    error: "bg-rose-950/40 text-rose-300 border-rose-900/60",
    stub: "bg-zinc-900 text-zinc-400 border-zinc-800",
  };
  const cls = map[status] ?? "bg-zinc-900 text-zinc-400 border-zinc-800";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      opus: {status}
    </span>
  );
}

function SeverityChip({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-rose-900/40 text-rose-200 border-rose-800",
    high: "bg-orange-900/40 text-orange-200 border-orange-800",
    medium: "bg-amber-900/40 text-amber-200 border-amber-800",
    low: "bg-zinc-800 text-zinc-300 border-zinc-700",
  };
  const cls = map[severity] ?? map.low;
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
      {severity}
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

  const { project, budget, spent, total, pct, events, anomalies } = data;

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
          <div className="flex-1 min-w-[280px] max-w-md">
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

        {budget.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {budget.map((b) => {
              const committed = Number(b.committed_gtq);
              const catSpent = Number(b.spent_gtq);
              const over = committed > 0 && catSpent / committed > 1;
              return (
                <li
                  key={b.category}
                  className={`text-[11px] px-2.5 py-1 rounded-md border ${
                    over
                      ? "bg-rose-950/30 text-rose-200 border-rose-900/50"
                      : "bg-zinc-900/60 text-zinc-300 border-zinc-800"
                  }`}
                >
                  <span className="uppercase tracking-wider mr-2">{b.category}</span>
                  <span className="tabular-nums">
                    {formatGTQ(catSpent)} / {formatGTQ(committed)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
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
              {events.map((ev) => {
                const summary = agentSummary(ev.agent_output);
                const trans = transcription(ev.agent_output);
                const tools = toolsList(ev.agent_output);
                return (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
                      <EventTypeBadge type={ev.type} />
                      <AgentStatusBadge status={ev.agent_status} />
                      <span>{ev.created_by ?? "—"}</span>
                      <span className="ml-auto tabular-nums">{formatDateTime(ev.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-zinc-100 break-words">
                      {previewPayload(ev.payload)}
                    </p>
                    {trans && ev.type === "voice_note" && (
                      <p className="mt-1 text-xs italic text-zinc-400 break-words">
                        🎙️ {trans}
                      </p>
                    )}
                    {summary && (
                      <p className="mt-2 text-sm text-emerald-200/90 border-l-2 border-emerald-800 pl-3 break-words">
                        {summary}
                      </p>
                    )}
                    {tools.length > 0 && (
                      <p className="mt-1.5 text-[10px] text-zinc-500 uppercase tracking-wider">
                        herramientas: {tools.join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
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
                  <div className="flex items-center gap-2 text-xs text-amber-300 flex-wrap">
                    <SeverityChip severity={a.severity} />
                    <span className="text-amber-500/70">·</span>
                    <span className="truncate">{a.kind}</span>
                    <span className="ml-auto tabular-nums">{formatDateTime(a.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-zinc-100 break-words">
                    {a.agent_message ?? "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
