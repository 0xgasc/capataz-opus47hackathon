import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { formatGTQ, formatDateTime } from "@/lib/format";
import { asObject } from "@/lib/json";
import { ModeSwitcher } from "./switcher";
import { AutoRefresh } from "../refresh";

export const dynamic = "force-dynamic";

type Mode = "construction" | "inventory";

type Project = {
  id: string;
  name: string;
  client: string | null;
  total_budget_gtq: string;
  start_date: Date | string | null;
  mode: Mode;
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
  event_id: string | null;
};

type BudgetRow = {
  category: string;
  committed_gtq: string;
  spent_gtq: string;
  committed_market_gtq: string;
};

type ScoreRow = {
  score: number;
  components: unknown;
  computed_at: Date | string;
  computed_by: string;
};

const MODE_COPY: Record<Mode, {
  label: string;
  valueLabel: string;
  timelineLabel: string;
  scoreLabel: string;
  portfolioLabel: string;
  driftLabel: string;
  emptyEvents: string;
}> = {
  construction: {
    label: "Construcción",
    valueLabel: "Presupuesto",
    timelineLabel: "Actividad en obra",
    scoreLabel: "Project Health",
    portfolioLabel: "Portafolio de materiales (mercado vs. presupuesto)",
    driftLabel: "drift",
    emptyEvents: "Aún no hay actividad. Envíe un mensaje al bot para comenzar.",
  },
  inventory: {
    label: "Inventario",
    valueLabel: "Valor de inventario",
    timelineLabel: "Movimientos de bodega",
    scoreLabel: "Collateral Readiness",
    portfolioLabel: "Portafolio (mercado vs. costo base)",
    driftLabel: "revaluación",
    emptyEvents: "Aún no hay movimientos registrados.",
  },
};

async function loadDashboard(mode: Mode) {
  const projects = await sql<Project[]>`
    select id, name, client, total_budget_gtq, start_date, mode
    from projects
    where mode = ${mode}
    order by created_at asc
    limit 1
  `;
  const project = projects[0];
  if (!project) return null;

  const budget = await sql<BudgetRow[]>`
    select category,
           coalesce(sum(qty * unit_cost_gtq), 0)::text as committed_gtq,
           coalesce(sum(spent_gtq), 0)::text as spent_gtq,
           coalesce(sum(qty * coalesce(market_unit_cost_gtq, unit_cost_gtq)), 0)::text as committed_market_gtq
    from budget_items
    where project_id = ${project.id}
    group by category
    order by coalesce(sum(qty * unit_cost_gtq), 0) desc
  `;

  const spent = budget.reduce((acc, b) => acc + Number(b.spent_gtq), 0);
  const total = Number(project.total_budget_gtq);
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;

  const totalCommitted = budget.reduce((acc, b) => acc + Number(b.committed_gtq), 0);
  const totalMarket = budget.reduce((acc, b) => acc + Number(b.committed_market_gtq), 0);
  const driftGtq = totalMarket - totalCommitted;
  const driftPct = totalCommitted > 0 ? (driftGtq / totalCommitted) * 100 : 0;

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
    select id, kind, severity, status, agent_message, created_at, event_id
    from anomalies
    where project_id = ${project.id} and status = 'open'
    order by created_at desc
    limit 20
  `;

  const scoreRows = await sql<ScoreRow[]>`
    select score, components, computed_at, computed_by
    from project_scores
    where project_id = ${project.id}
    order by computed_at desc
    limit 12
  `;
  const score = scoreRows[0] ?? null;
  const previousScore = scoreRows[1]?.score ?? null;
  const history = scoreRows
    .slice()
    .reverse()
    .map((r) => r.score);

  return {
    project,
    budget,
    spent,
    total,
    pct,
    totalCommitted,
    totalMarket,
    driftGtq,
    driftPct,
    events,
    anomalies,
    score,
    previousScore,
    history,
  };
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
      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-zinc-900 text-amber-300 border border-amber-900/40 inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" aria-hidden />
        opus procesando…
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

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-amber-300";
  if (score >= 50) return "text-orange-300";
  return "text-rose-300";
}

function ScoreSparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 80;
  const height = 22;
  const max = 100;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - (Math.max(0, Math.min(max, v)) / max) * height;
      return `${x},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const stroke = last >= prev ? "stroke-emerald-400" : "stroke-rose-400";
  return (
    <svg width={width} height={height} className="mt-1.5 block">
      <polyline
        fill="none"
        className={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function ScoreCard({
  score,
  previousScore,
  label,
  history,
}: {
  score: ScoreRow | null;
  previousScore: number | null;
  label: string;
  history: number[];
}) {
  const value = score?.score ?? null;
  const components = asObject(score?.components);
  const rows: Array<[string, number]> = [
    ["Budget variance", Number(components.budget_variance ?? 0)],
    ["Market drift", Number(components.market_drift ?? 0)],
    ["Anomaly rate", Number(components.anomaly_rate ?? 0)],
    ["Activity freshness", Number(components.activity_freshness ?? 0)],
  ];
  const delta = value != null && previousScore != null ? value - previousScore : null;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 sm:px-5 py-4 flex items-center gap-4 sm:gap-6 flex-wrap">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className={`text-4xl font-semibold tabular-nums ${value == null ? "text-zinc-500" : scoreColor(value)}`}>
            {value ?? "—"}
            <span className="text-sm text-zinc-500 ml-1">/100</span>
          </p>
          {delta != null && delta !== 0 && (
            <span
              className={`text-xs tabular-nums font-medium ${
                delta > 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
            </span>
          )}
        </div>
        {score && (
          <p className="text-[10px] text-zinc-500 mt-0.5">
            {score.computed_by} · {formatDateTime(score.computed_at)}
          </p>
        )}
        <ScoreSparkline values={history} />
      </div>
      <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-2 w-full min-w-0">
        {rows.map(([name, n]) => {
          const pct = Math.max(0, Math.min(100, (n / 25) * 100));
          return (
            <div key={name} className="bg-zinc-950/60 border border-zinc-800 rounded-md px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">{name}</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-lg tabular-nums text-zinc-100">{Math.round(n)}</span>
                <span className="text-[10px] text-zinc-500">/25</span>
              </div>
              <div className="h-1 rounded-full bg-zinc-800 mt-1 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${pct.toFixed(1)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function DashboardModePage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode: modeSlug } = await params;
  if (modeSlug !== "construction" && modeSlug !== "inventory") notFound();
  const mode = modeSlug as Mode;
  const copy = MODE_COPY[mode];
  const data = await loadDashboard(mode);

  if (!data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
        <AutoRefresh />
        <ModeSwitcher current={mode} />
        <p className="text-zinc-400 mt-6">
          No hay proyectos en modo <code className="text-amber-300">{mode}</code>. Ejecute{" "}
          <code className="text-amber-300">pnpm db:migrate</code>.
        </p>
      </main>
    );
  }

  const { project, budget, spent, total, pct, totalCommitted, totalMarket, driftGtq, driftPct, events, anomalies, score, previousScore, history } = data;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <AutoRefresh />

      <header className="border-b border-zinc-800 bg-zinc-900/50 px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-xs uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
              >
                Capataz · panel
              </Link>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-900/60 bg-emerald-950/40 text-emerald-300">
                {copy.label}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold mt-1 break-words">{project.name}</h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              {project.client ?? "—"} · inicio{" "}
              {project.start_date
                ? new Date(project.start_date).toISOString().slice(0, 10)
                : "—"}
            </p>
          </div>
          <ModeSwitcher current={mode} />
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 sm:gap-4">
          <ScoreCard
            score={score}
            previousScore={previousScore}
            history={history}
            label={copy.scoreLabel}
          />
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 sm:px-5 py-4 lg:min-w-[240px]">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              {copy.valueLabel}
            </p>
            <p className="text-xl font-semibold mt-0.5 tabular-nums">
              {formatGTQ(mode === "inventory" ? totalMarket : spent)}
              <span className="text-sm text-zinc-500 ml-1">
                / {formatGTQ(mode === "inventory" ? totalCommitted : total)}
              </span>
            </p>
            <div className="h-2 rounded-full bg-zinc-800 mt-2 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{
                  width: `${(mode === "inventory"
                    ? totalCommitted > 0
                      ? Math.min(100, (totalMarket / totalCommitted) * 100)
                      : 0
                    : pct
                  ).toFixed(2)}%`,
                }}
              />
            </div>
            <p
              className={`text-[11px] mt-1 tabular-nums ${
                driftGtq >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {copy.driftLabel}: {driftGtq >= 0 ? "+" : ""}
              {formatGTQ(driftGtq)} ({driftPct >= 0 ? "+" : ""}
              {driftPct.toFixed(2)}%)
            </p>
          </div>
        </div>

        {budget.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
              {copy.portfolioLabel}
            </p>
            <ul className="flex flex-wrap gap-2">
              {budget.map((b) => {
                const committed = Number(b.committed_gtq);
                const market = Number(b.committed_market_gtq);
                const catDrift = committed > 0 ? ((market - committed) / committed) * 100 : 0;
                const up = catDrift > 0.05;
                const down = catDrift < -0.05;
                const cls = up
                  ? "bg-emerald-950/30 text-emerald-200 border-emerald-900/50"
                  : down
                  ? "bg-rose-950/30 text-rose-200 border-rose-900/50"
                  : "bg-zinc-900/60 text-zinc-300 border-zinc-800";
                return (
                  <li
                    key={b.category}
                    className={`text-[11px] px-2.5 py-1 rounded-md border ${cls}`}
                  >
                    <span className="uppercase tracking-wider mr-2">{b.category}</span>
                    <span className="tabular-nums">{formatGTQ(market)}</span>
                    <span className="text-[10px] opacity-70 ml-1.5 tabular-nums">
                      ({catDrift >= 0 ? "+" : ""}
                      {catDrift.toFixed(1)}%)
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 lg:gap-6 px-4 sm:px-6 py-5 sm:py-6">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
            {copy.timelineLabel}
          </h2>
          {events.length === 0 ? (
            <p className="text-zinc-500 text-sm">{copy.emptyEvents}</p>
          ) : (
            <ul className="space-y-2">
              {events.map((ev) => {
                const summary = agentSummary(ev.agent_output);
                const trans = transcription(ev.agent_output);
                const tools = toolsList(ev.agent_output);
                return (
                  <li key={ev.id}>
                    <Link
                      href={`/runs/${ev.id}`}
                      className="block rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 hover:border-zinc-700 hover:bg-zinc-900 transition-colors"
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
                          herramientas: {tools.join(" · ")} <span className="text-zinc-600">· ver traza →</span>
                        </p>
                      )}
                    </Link>
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
              {anomalies.map((a) => {
                const inner = (
                  <>
                    <div className="flex items-center gap-2 text-xs text-amber-300 flex-wrap">
                      <SeverityChip severity={a.severity} />
                      <span className="text-amber-500/70">·</span>
                      <span className="truncate">{a.kind}</span>
                      <span className="ml-auto tabular-nums">{formatDateTime(a.created_at)}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-zinc-100 break-words">
                      {a.agent_message ?? "—"}
                    </p>
                    {a.event_id && (
                      <p className="mt-1.5 text-[10px] text-amber-500/80 uppercase tracking-wider">
                        ver traza →
                      </p>
                    )}
                  </>
                );
                const cls =
                  "block rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 hover:bg-amber-950/35 hover:border-amber-800/60 transition-colors";
                return (
                  <li key={a.id}>
                    {a.event_id ? (
                      <Link href={`/runs/${a.event_id}`} className={cls}>
                        {inner}
                      </Link>
                    ) : (
                      <div className={cls}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
