import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { asObject } from "@/lib/json";
import { buildSuggestions } from "@/lib/agent/suggestions";
import { MODULE_CATALOG, modulesForBusiness, isEnabled, isSuggested } from "@/lib/modules";
import { ModuleSuggestion } from "./module-card";
import { RequestModule, type ModuleRequestRow } from "./request-module";
import { CobrosWidget } from "./cobros-widget";
import { DailySnapshot } from "./daily-snapshot";
import { HitlCard, type HitlOpen } from "./hitl-card";
import { formatGTQ } from "@/lib/format";
import { ModeSwitcher } from "./switcher";
import { ChatInput } from "./chat-input";
import { ChatThread, type ChatMessage } from "./chat-thread";
import { TaskList, type TaskItem } from "./task-list";
import { AutoRefresh } from "../refresh";
import { ThemeToggle } from "../../theme-toggle";

export const dynamic = "force-dynamic";

type Mode = "construction" | "inventory" | "tiendita" | "general";

const MODE_COPY: Record<Mode, { label: string; greeting: string; emptyEvents: string }> = {
  construction: {
    label: "Construcción",
    greeting: "Tu obra, en chat",
    emptyEvents: "Mandale a Capataz lo que está pasando en la obra para arrancar.",
  },
  inventory: {
    label: "Bodega",
    greeting: "Tu bodega, en chat",
    emptyEvents: "Contale a Capataz qué entró o salió hoy.",
  },
  tiendita: {
    label: "Tiendita",
    greeting: "Tu tiendita, en chat",
    emptyEvents: "Mandale un mensaje a Capataz para empezar el día.",
  },
  general: {
    label: "Rutina",
    greeting: "Tu día a día, en chat",
    emptyEvents: "Contale a Capataz qué pasó hoy. Lo que sea — Capataz lo organiza.",
  },
};

function timeAgoShort(s: Date | string): string {
  const ms = Date.now() - new Date(s).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  return `hace ${Math.floor(hr / 24)}d`;
}

async function loadDashboard(key: string) {
  let projects = await sql<
    Array<{
      id: string;
      name: string;
      mode: string;
      business_id: string | null;
      business_slug: string | null;
      business_name: string | null;
      owner_name: string | null;
    }>
  >`
    select p.id, p.name, p.mode,
           p.business_id, b.slug as business_slug, b.name as business_name, b.owner_name
    from projects p
    join businesses b on b.id = p.business_id
    where b.slug = ${key}
    order by p.created_at asc
    limit 1
  `;
  if (projects.length === 0) {
    projects = await sql<
      Array<{
        id: string;
        name: string;
        mode: string;
        business_id: string | null;
        business_slug: string | null;
        business_name: string | null;
        owner_name: string | null;
      }>
    >`
      select p.id, p.name, p.mode,
             p.business_id, b.slug as business_slug, b.name as business_name, b.owner_name
      from projects p
      left join businesses b on b.id = p.business_id
      where p.mode = ${key}
      order by p.created_at asc
      limit 1
    `;
  }
  const project = projects[0];
  if (!project) return null;

  const events = await sql<
    Array<{
      id: string;
      type: string;
      payload: unknown;
      media_url: string | null;
      created_by: string | null;
      created_at: Date | string;
      agent_output: unknown;
    }>
  >`
    select e.id, e.type, e.payload, e.media_url, e.created_by, e.created_at,
           ar.output as agent_output
    from events e
    left join lateral (
      select output from agent_runs
      where event_id = e.id
      order by started_at desc
      limit 1
    ) ar on true
    where e.project_id = ${project.id}
    order by e.created_at desc
    limit 30
  `;

  const eventIds = events.map((e) => e.id);
  const anomaliesByEvent = new Map<
    string,
    Array<{ kind: string; severity: string; message: string | null }>
  >();
  if (eventIds.length > 0) {
    const allAnomalies = await sql<
      Array<{ event_id: string | null; kind: string; severity: string; agent_message: string | null }>
    >`
      select event_id, kind, severity, agent_message
      from anomalies
      where event_id::text = any(${eventIds})
      order by created_at asc
    `;
    for (const a of allAnomalies) {
      if (!a.event_id) continue;
      const arr = anomaliesByEvent.get(a.event_id) ?? [];
      arr.push({ kind: a.kind, severity: a.severity, message: a.agent_message });
      anomaliesByEvent.set(a.event_id, arr);
    }
  }

  const tasks = project.business_id
    ? await sql<TaskItem[]>`
        select id, title, detail, cadence, category, status
        from tasks
        where business_id = ${project.business_id}
        order by
          case status when 'pending' then 0 when 'in_progress' then 1 when 'snoozed' then 2 when 'done' then 3 else 4 end,
          case cadence when 'daily' then 0 when 'weekly' then 1 when 'monthly' then 2 when 'one_off' then 3 when 'as_needed' then 4 else 5 end,
          title
        limit 40
      `
    : [];

  // Sample a few items for suggestion templates ("vendí 2 cervezas").
  const recentItems = await sql<Array<{ description: string; unit: string }>>`
    select description, unit
    from budget_items
    where project_id = ${project.id} and qty > 0
    order by random()
    limit 5
  `;

  const lastCheckIn = project.business_id
    ? await sql<Array<{ created_at: Date | string; status: string }>>`
        select created_at, status from agent_check_ins
        where business_id = ${project.business_id}
        order by created_at desc
        limit 1
      `
    : [];

  const moduleMap = project.business_id
    ? await modulesForBusiness(project.business_id)
    : new Map<string, "enabled" | "suggested" | "disabled">();
  const valuationEnabled = isEnabled(moduleMap, "valuacion");
  const cobrosEnabled = isEnabled(moduleMap, "cobros");
  const lenderViewEnabled = isEnabled(moduleMap, "lender_view");
  const firstSuggested = MODULE_CATALOG.find(
    (m) => !m.baseline && isSuggested(moduleMap, m.key) && m.pitch.length > 0,
  );

  // Compute valuation snapshot only if the module is enabled.
  let valuation: { committed_gtq: number; market_gtq: number; drift_gtq: number; drift_pct: number; score: number | null } | null = null;
  if (valuationEnabled) {
    const [budgetRow] = await sql<Array<{ committed: string; market: string }>>`
      select
        coalesce(sum(qty * unit_cost_gtq), 0)::text as committed,
        coalesce(sum(qty * coalesce(market_unit_cost_gtq, unit_cost_gtq)), 0)::text as market
      from budget_items
      where project_id = ${project.id}
    `;
    const committed = Number(budgetRow?.committed ?? 0);
    const market = Number(budgetRow?.market ?? 0);
    const drift = market - committed;
    const driftPct = committed > 0 ? (drift / committed) * 100 : 0;
    const [scoreRow] = await sql<Array<{ score: number }>>`
      select score from project_scores where project_id = ${project.id} order by computed_at desc limit 1
    `;
    valuation = {
      committed_gtq: committed,
      market_gtq: market,
      drift_gtq: drift,
      drift_pct: driftPct,
      score: scoreRow?.score ?? null,
    };
  }

  const messages: ChatMessage[] = events.map((e) => {
    const p = asObject(e.payload);
    const out = asObject(e.agent_output);
    const text =
      typeof p.text === "string"
        ? p.text
        : typeof p.caption === "string"
        ? p.caption
        : typeof p.task_title === "string"
        ? `✓ marqué hecha la tarea: ${p.task_title}`
        : "";
    const summary =
      typeof out.summary === "string" && out.summary.trim() ? out.summary.trim() : null;
    const tools = Array.isArray(out.toolsCalled)
      ? (out.toolsCalled as Array<{ name?: unknown }>)
          .map((t) => (typeof t.name === "string" ? t.name : ""))
          .filter(Boolean)
      : [];
    const transObj = asObject(out.transcription);
    const transcription =
      typeof transObj.text === "string" && transObj.text ? transObj.text : null;
    return {
      event_id: e.id,
      type: e.type,
      text,
      who: e.created_by ?? "—",
      created_at:
        typeof e.created_at === "string" ? e.created_at : new Date(e.created_at).toISOString(),
      agent_summary: summary,
      agent_tools: tools,
      transcription,
      media_url:
        e.media_url ??
        (typeof p.media_url === "string" ? p.media_url : null),
      anomalies: anomaliesByEvent.get(e.id) ?? [],
    };
  });

  const moduleRequests = project.business_id
    ? await sql<ModuleRequestRow[]>`
        select id, user_message, agent_reply, status, created_at::text
        from module_requests
        where business_id = ${project.business_id}
        order by created_at desc
        limit 5
      `
    : [];

  const openHitl = project.business_id
    ? await sql<HitlOpen[]>`
        select id, question, context_summary, urgency, asked_at::text
        from agent_hitl_requests
        where business_id = ${project.business_id} and status = 'open'
        order by asked_at desc
        limit 3
      `
    : [];

  return {
    project,
    messages,
    tasks,
    recentItems,
    lastCheckIn: lastCheckIn[0] ?? null,
    valuation,
    cobrosEnabled,
    lenderViewEnabled,
    suggestion: firstSuggested
      ? { key: firstSuggested.key, name: firstSuggested.name, pitch: firstSuggested.pitch }
      : null,
    moduleRequests,
    openHitl,
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ mode: string }>;
}) {
  const { mode: keyParam } = await params;
  const data = await loadDashboard(keyParam);

  if (!data) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-12 flex items-center justify-center text-center">
        <AutoRefresh />
        <div className="max-w-md">
          <p className="text-zinc-300 text-base mb-2">
            No encontré ningún negocio con esa URL.
          </p>
          <p className="text-zinc-500 text-sm">
            <Link href="/" className="text-emerald-300 hover:underline">
              ← volver al inicio
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const { project, messages, tasks, recentItems, lastCheckIn, valuation, cobrosEnabled, lenderViewEnabled, suggestion, moduleRequests, openHitl } = data;
  const mode = (project.mode as Mode) ?? "construction";
  const copy = MODE_COPY[mode] ?? MODE_COPY.construction;
  const slug = project.business_slug;
  const displayName = project.business_name ?? project.name;
  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const pendingCount = pendingTasks.length;
  const suggestions = buildSuggestions({
    vertical: mode,
    pendingTasks: pendingTasks.map((t) => ({ title: t.title })),
    recentItems,
  });

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <AutoRefresh />

      <header className="sticky top-0 z-10 border-b border-zinc-900 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
          <div className="min-w-0 flex-1">
            <Link
              href="/"
              className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
            >
              ← Capataz
            </Link>
            <p className="text-base sm:text-lg font-semibold leading-tight truncate mt-0.5">
              {displayName}
            </p>
            <p className="text-[12px] text-zinc-500 truncate">
              {project.owner_name ?? "—"} · {copy.label}
              {lastCheckIn && (
                <>
                  {" · "}
                  <Link
                    href="/agents"
                    className="text-zinc-500 hover:text-emerald-300"
                    title={`último check-in del cron: ${new Date(lastCheckIn.created_at).toLocaleString("es-GT")}`}
                  >
                    Capataz revisó {timeAgoShort(lastCheckIn.created_at)}
                  </Link>
                </>
              )}
              {lenderViewEnabled && (
                <>
                  {" · "}
                  <Link
                    href="/agents"
                    className="text-amber-400 hover:text-amber-300"
                    title="vista exportable de evidencia auditable para un prestamista o auditor"
                  >
                    🔒 vista del prestamista
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ModeSwitcher current={mode} />
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-3xl w-full mx-auto flex flex-col">
        {project.business_id && (
          <DailySnapshot
            businessId={project.business_id}
            projectId={project.id}
            showScore={!!valuation}
          />
        )}

        {slug && openHitl.map((h) => <HitlCard key={h.id} slug={slug} request={h} />)}

        {valuation && (
          <section className="px-4 sm:px-5 pt-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-3">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Valuación</span>
                <span className="text-2xl font-semibold tabular-nums text-zinc-100">
                  {valuation.score ?? "—"}
                  <span className="text-xs text-zinc-500 ml-1">/100</span>
                </span>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Mercado vs costo</p>
                <p
                  className={`text-sm tabular-nums ${
                    valuation.drift_gtq >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {valuation.drift_gtq >= 0 ? "+" : ""}
                  {formatGTQ(valuation.drift_gtq)} ({valuation.drift_pct >= 0 ? "+" : ""}
                  {valuation.drift_pct.toFixed(1)}%)
                </p>
              </div>
            </div>
          </section>
        )}

        {cobrosEnabled && project.business_id && (
          <CobrosWidget businessId={project.business_id} />
        )}

        {!valuation && suggestion && slug && (
          <ModuleSuggestion slug={slug} suggestion={suggestion} />
        )}

        {slug && (
          <RequestModule slug={slug} recent={moduleRequests} />
        )}

        {tasks.length > 0 && (
          <details className="border-b border-zinc-900" open={pendingCount > 0 && messages.length < 3}>
            <summary className="cursor-pointer px-4 sm:px-5 py-3 text-sm text-zinc-300 hover:text-zinc-100 flex items-center justify-between list-none">
              <span className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Protocolo
                </span>
                <span className="text-zinc-700">·</span>
                <span>{pendingCount} pendientes</span>
              </span>
              <span className="text-zinc-600 text-xs">tocá ▾</span>
            </summary>
            <div className="px-3 sm:px-4 pb-4">
              {slug && <TaskList slug={slug} tasks={tasks} />}
            </div>
          </details>
        )}

        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6 py-16 text-center">
            <div className="max-w-sm">
              <p className="text-zinc-300 text-lg">{copy.greeting}</p>
              <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                {copy.emptyEvents}
              </p>
            </div>
          </div>
        ) : (
          <ChatThread messages={messages} />
        )}
      </div>

      {slug && (
        <div className="sticky bottom-0 z-10">
          <ChatInput slug={slug} mode={mode} suggestions={suggestions} />
        </div>
      )}
    </div>
  );
}
