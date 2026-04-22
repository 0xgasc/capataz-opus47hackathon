import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { asObject } from "@/lib/json";
import { AutoRefresh } from "../../dashboard/refresh";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  project_id: string | null;
  type: string;
  payload: unknown;
  telegram_msg_id: string | null;
  media_url: string | null;
  created_by: string | null;
  created_at: Date | string;
  project_name: string | null;
  project_mode: "construction" | "inventory" | null;
};

type RunRow = {
  id: string;
  status: string;
  input: unknown;
  output: unknown;
  started_at: Date | string;
  ended_at: Date | string | null;
};

type AnomalyRow = {
  id: string;
  kind: string;
  severity: string;
  status: string;
  agent_message: string | null;
  created_at: Date | string;
};

async function loadRun(eventId: string) {
  const events = await sql<EventRow[]>`
    select e.id, e.project_id, e.type, e.payload, e.telegram_msg_id, e.media_url,
           e.created_by, e.created_at,
           p.name as project_name, p.mode as project_mode
    from events e
    left join projects p on p.id = e.project_id
    where e.id = ${eventId}
  `;
  const event = events[0];
  if (!event) return null;

  const runs = await sql<RunRow[]>`
    select id, status, input, output, started_at, ended_at
    from agent_runs
    where event_id = ${eventId}
    order by started_at desc
  `;

  const anomalies = await sql<AnomalyRow[]>`
    select id, kind, severity, status, agent_message, created_at
    from anomalies
    where event_id = ${eventId}
    order by created_at desc
  `;

  return { event, runs, anomalies };
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "ok" | "warn" | "bad" | "neutral" }) {
  const map = {
    ok: "bg-emerald-950/40 text-emerald-300 border-emerald-900/60",
    warn: "bg-amber-950/40 text-amber-300 border-amber-900/60",
    bad: "bg-rose-950/40 text-rose-300 border-rose-900/60",
    neutral: "bg-zinc-900 text-zinc-400 border-zinc-800",
  } as const;
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${map[tone]}`}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-100 mt-0.5 break-all">{children}</p>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const pretty = JSON.stringify(value ?? null, null, 2);
  return (
    <pre className="text-[11px] leading-relaxed text-zinc-300 bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-words">
      {pretty}
    </pre>
  );
}

export default async function RunInspectorPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const data = await loadRun(eventId);
  if (!data) notFound();
  const { event, runs, anomalies } = data;
  const payload = asObject(event.payload);

  const hasRuns = runs.length > 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 px-6 py-6">
      {!hasRuns && <AutoRefresh intervalMs={2000} />}
      <div className="max-w-4xl mx-auto">
        <nav className="text-xs text-zinc-500 mb-4">
          <Link href={event.project_mode ? `/dashboard/${event.project_mode}` : "/dashboard"} className="hover:text-zinc-300">
            ← volver al panel
          </Link>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Pill>{event.type}</Pill>
            {event.project_mode && (
              <Pill tone="ok">{event.project_mode}</Pill>
            )}
            <span className="text-xs text-zinc-500">
              {event.project_name ?? "—"}
            </span>
          </div>
          <h1 className="text-lg font-semibold">Traza del evento</h1>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">{event.id}</p>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 mb-5">
          <h2 className="text-xs uppercase tracking-wider text-zinc-400 mb-3">Evento</h2>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <Field label="Reportado por">{event.created_by ?? "—"}</Field>
            <Field label="Fecha">{formatDateTime(event.created_at)}</Field>
            <Field label="Telegram msg id">{event.telegram_msg_id ?? "—"}</Field>
            <Field label="Tipo">{event.type}</Field>
          </div>
          {typeof payload.text === "string" && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Mensaje</p>
              <p className="text-sm text-zinc-100 mt-1 italic">"{payload.text}"</p>
            </div>
          )}
          <details className="mt-3">
            <summary className="text-[10px] uppercase tracking-wider text-zinc-500 cursor-pointer">
              Payload crudo
            </summary>
            <div className="mt-2">
              <JsonBlock value={payload} />
            </div>
          </details>
        </section>

        {runs.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            Aún no hay ejecuciones del agente para este evento.
          </p>
        ) : (
          runs.map((run, idx) => {
            const output = asObject(run.output);
            const input = asObject(run.input);
            const runner = (input.runner as string | undefined) ?? "messages+tools";
            const sessionId = input.session_id as string | undefined;
            const agentId = input.agent_id as string | undefined;
            const summary = (output.summary as string | undefined) ?? "";
            const stopReason = (output.stopReason as string | null | undefined) ?? null;
            const usage = asObject(output.usage);
            const transcription = asObject(output.transcription);
            const tools = Array.isArray(output.toolsCalled)
              ? (output.toolsCalled as Array<{ name: string; input: unknown; result: unknown }>)
              : [];
            const statusTone = run.status === "ok" ? "ok" : run.status === "error" ? "bad" : "warn";
            return (
              <section
                key={run.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 mb-5"
              >
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <h2 className="text-xs uppercase tracking-wider text-zinc-400">
                    Run {runs.length - idx}
                  </h2>
                  <Pill tone={statusTone as "ok" | "warn" | "bad" | "neutral"}>opus: {run.status}</Pill>
                  <Pill>{runner}</Pill>
                  {stopReason && <Pill>stop: {stopReason}</Pill>}
                  <span className="text-xs text-zinc-500 ml-auto">
                    {formatDateTime(run.started_at)}
                  </span>
                </div>

                {summary && (
                  <p className="text-sm text-emerald-200/90 border-l-2 border-emerald-800 pl-3 mb-4">
                    {summary}
                  </p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mb-4">
                  {sessionId && <Field label="Session">{sessionId}</Field>}
                  {agentId && <Field label="Agent">{agentId}</Field>}
                  {usage.input_tokens != null && (
                    <Field label="Tokens in">{String(usage.input_tokens)}</Field>
                  )}
                  {usage.output_tokens != null && (
                    <Field label="Tokens out">{String(usage.output_tokens)}</Field>
                  )}
                </div>

                {typeof transcription.text === "string" && transcription.text && (
                  <div className="mb-4">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                      Transcripción ({String(transcription.provider ?? "—")},{" "}
                      {String(transcription.durationMs ?? 0)}ms)
                    </p>
                    <p className="text-sm italic text-zinc-300">"{transcription.text}"</p>
                  </div>
                )}

                {tools.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                      Tool trace ({tools.length})
                    </p>
                    <ol className="space-y-3">
                      {tools.map((t, i) => (
                        <li key={i} className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/40">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] text-zinc-500 tabular-nums">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <code className="text-sm text-amber-300">{t.name}</code>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                                input
                              </p>
                              <JsonBlock value={t.input} />
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                                result
                              </p>
                              <JsonBlock value={t.result} />
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            );
          })
        )}

        {anomalies.length > 0 && (
          <section className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-5 mb-5">
            <h2 className="text-xs uppercase tracking-wider text-amber-300 mb-3">
              Anomalías levantadas
            </h2>
            <ul className="space-y-2">
              {anomalies.map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center gap-2 text-xs text-amber-300 mb-0.5">
                    <Pill tone="warn">{a.severity}</Pill>
                    <span>{a.kind}</span>
                    <span className="ml-auto text-amber-500/70">{formatDateTime(a.created_at)}</span>
                  </div>
                  <p className="text-zinc-100">{a.agent_message ?? "—"}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-[10px] text-zinc-600 mt-6">
          Esta página es la evidencia auditable: un prestamista, auditor o contraparte puede
          reproducir toda la decisión del agente — input, tools llamadas, resultados, y
          razonamiento final — desde aquí.
        </p>
      </div>
    </main>
  );
}
