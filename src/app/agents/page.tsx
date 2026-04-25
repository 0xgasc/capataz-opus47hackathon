import Link from "next/link";
import { sql } from "@/lib/db";
import { asObject } from "@/lib/json";
import { estimateCostUsd, formatUsd } from "@/lib/agent/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Capataz · agentes" };

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  owner_name: string | null;
};

type RunRow = {
  business_slug: string;
  event_id: string;
  status: string;
  input: unknown;
  output: unknown;
  started_at: Date | string;
};

type CheckInRow = {
  id: string;
  business_slug: string;
  status: string;
  message: string | null;
  fired_at: Date | string | null;
  created_at: Date | string;
};

function fmt(s: Date | string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-GT", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return String(s);
  }
}

function timeAgo(s: Date | string | null): string {
  if (!s) return "nunca";
  const ms = Date.now() - new Date(s).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const d = Math.floor(hr / 24);
  return `hace ${d} d`;
}

async function loadAgents() {
  const businesses = await sql<BusinessRow[]>`
    select id, slug, name, vertical, owner_name from businesses order by created_at asc
  `;
  const runs = await sql<RunRow[]>`
    select b.slug as business_slug, ar.event_id, ar.status, ar.input, ar.output, ar.started_at
    from agent_runs ar
    join events e on e.id = ar.event_id
    join projects p on p.id = e.project_id
    join businesses b on b.id = p.business_id
    order by ar.started_at desc
    limit 100
  `;
  const checkIns = await sql<CheckInRow[]>`
    select ac.id, b.slug as business_slug, ac.status, ac.message, ac.fired_at, ac.created_at
    from agent_check_ins ac
    join businesses b on b.id = ac.business_id
    order by ac.created_at desc
    limit 50
  `;
  const intervalMin = Number(process.env.CRON_INTERVAL_MIN ?? 30);
  const cronEnabled = process.env.CRON_DISABLED !== "true";

  // Aggregate token usage per (model, intent, business) across the last 24h and 7d.
  type Bucket = {
    runs: number;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  const byModel24h = new Map<string, Bucket>();
  const byModel7d = new Map<string, Bucket>();
  const byBusiness7d = new Map<string, Bucket>();
  const byIntent7d = new Map<string, Bucket>();

  const now = Date.now();
  const _24h = 24 * 3600 * 1000;
  const _7d = 7 * 24 * 3600 * 1000;

  function bump(map: Map<string, Bucket>, key: string, usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | null, cost: number) {
    const cur = map.get(key) ?? { runs: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    cur.runs += 1;
    cur.input_tokens += usage?.input_tokens ?? 0;
    cur.output_tokens += usage?.output_tokens ?? 0;
    cur.cost_usd += cost;
    map.set(key, cur);
  }

  for (const r of runs) {
    const inp = asObject(r.input);
    const out = asObject(r.output);
    const model = (inp.model as string | undefined) ?? (out.model as string | undefined) ?? "(unknown)";
    const intent = (inp.intent as string | undefined) ?? (out.intent as string | undefined) ?? "(unknown)";
    const usage = (out.usage as Bucket | null | undefined) ?? null;
    const cost = estimateCostUsd(model, usage as never);
    const ts = new Date(r.started_at).getTime();
    if (now - ts <= _24h) bump(byModel24h, model, usage as never, cost);
    if (now - ts <= _7d) {
      bump(byModel7d, model, usage as never, cost);
      bump(byBusiness7d, r.business_slug, usage as never, cost);
      bump(byIntent7d, intent, usage as never, cost);
    }
  }

  return {
    businesses,
    runs,
    checkIns,
    intervalMin,
    cronEnabled,
    byModel24h: Array.from(byModel24h.entries()).map(([model, b]) => ({ model, ...b })),
    byModel7d: Array.from(byModel7d.entries()).map(([model, b]) => ({ model, ...b })),
    byBusiness7d: Array.from(byBusiness7d.entries()).map(([slug, b]) => ({ slug, ...b })),
    byIntent7d: Array.from(byIntent7d.entries()).map(([intent, b]) => ({ intent, ...b })),
  };
}

export default async function AgentsPage() {
  const {
    businesses,
    runs,
    checkIns,
    intervalMin,
    cronEnabled,
    byModel24h,
    byModel7d,
    byBusiness7d,
    byIntent7d,
  } = await loadAgents();

  const runsByBiz = new Map<string, RunRow[]>();
  for (const r of runs) {
    const arr = runsByBiz.get(r.business_slug) ?? [];
    arr.push(r);
    runsByBiz.set(r.business_slug, arr);
  }

  const checkInsByBiz = new Map<string, CheckInRow[]>();
  for (const c of checkIns) {
    const arr = checkInsByBiz.get(c.business_slug) ?? [];
    arr.push(c);
    checkInsByBiz.set(c.business_slug, arr);
  }

  // Distinct anthropic agent_ids in the wild, with model tags.
  const seenAgents = new Map<string, { agent_id: string; model: string; runs: number; lastSeen: Date | string | null; businesses: Set<string> }>();
  for (const r of runs) {
    const inp = asObject(r.input);
    const agentId = typeof inp.agent_id === "string" ? inp.agent_id : null;
    const model = typeof inp.model === "string" ? inp.model : "(messages+tools)";
    if (!agentId) continue;
    const key = `${agentId}|${model}`;
    const existing = seenAgents.get(key) ?? {
      agent_id: agentId,
      model,
      runs: 0,
      lastSeen: null,
      businesses: new Set<string>(),
    };
    existing.runs += 1;
    existing.businesses.add(r.business_slug);
    if (!existing.lastSeen || new Date(r.started_at) > new Date(existing.lastSeen)) {
      existing.lastSeen = r.started_at;
    }
    seenAgents.set(key, existing);
  }

  const lastTickFromCheckIns = checkIns[0]?.created_at ?? null;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <header className="mb-6">
          <Link href="/" className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
            ← Capataz
          </Link>
          <h1 className="text-xl sm:text-2xl font-semibold mt-1">Estado de los agentes</h1>
          <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
            Acá ves qué Managed Agents tiene Capataz desplegados, qué corridas
            han pasado, y cuándo fue el último check-in proactivo.
          </p>
        </header>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5 mb-6">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-sm uppercase tracking-wider text-zinc-400">Cron de check-ins</h2>
            <span className={`text-[11px] px-2 py-0.5 rounded border ${cronEnabled ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300" : "border-rose-900/60 bg-rose-950/40 text-rose-300"}`}>
              {cronEnabled ? "activo" : "deshabilitado"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Intervalo</dt>
              <dd className="text-zinc-100 mt-0.5">cada {intervalMin} min</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Último tick observado</dt>
              <dd className="text-zinc-100 mt-0.5">{timeAgo(lastTickFromCheckIns)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-zinc-500">Check-ins totales</dt>
              <dd className="text-zinc-100 mt-0.5">{checkIns.length}</dd>
            </div>
          </dl>
          <p className="text-[11px] text-zinc-500 mt-3">
            El cron corre dentro del proceso de Next.js (instrumentation.ts). Cada tick llama a{" "}
            <code className="text-amber-300">/api/cron/checkins</code> que itera todos los negocios.
            Haiku 4.5 decide si vale la pena pingear o quedarse callado, considerando la hora del día.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">Tokens y costo</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                  Por modelo (últimas 24h)
                </p>
                {byModel24h.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin actividad en 24h.</p>
                ) : (
                  <table className="w-full text-[12px] tabular-nums">
                    <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="text-left font-normal pb-1">modelo</th>
                        <th className="text-right font-normal pb-1">corridas</th>
                        <th className="text-right font-normal pb-1">tokens in</th>
                        <th className="text-right font-normal pb-1">tokens out</th>
                        <th className="text-right font-normal pb-1">costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {byModel24h
                        .sort((a, b) => b.cost_usd - a.cost_usd)
                        .map((b) => (
                          <tr key={b.model} className="text-zinc-300">
                            <td className="py-1.5 pr-2 font-mono text-[11px]">{b.model}</td>
                            <td className="text-right">{b.runs}</td>
                            <td className="text-right">{b.input_tokens.toLocaleString()}</td>
                            <td className="text-right">{b.output_tokens.toLocaleString()}</td>
                            <td className="text-right text-emerald-300">{formatUsd(b.cost_usd)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                  Por modelo (7 días)
                </p>
                {byModel7d.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin actividad en 7d.</p>
                ) : (
                  <table className="w-full text-[12px] tabular-nums">
                    <thead className="text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="text-left font-normal pb-1">modelo</th>
                        <th className="text-right font-normal pb-1">corridas</th>
                        <th className="text-right font-normal pb-1">tokens in</th>
                        <th className="text-right font-normal pb-1">tokens out</th>
                        <th className="text-right font-normal pb-1">costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {byModel7d
                        .sort((a, b) => b.cost_usd - a.cost_usd)
                        .map((b) => (
                          <tr key={b.model} className="text-zinc-300">
                            <td className="py-1.5 pr-2 font-mono text-[11px]">{b.model}</td>
                            <td className="text-right">{b.runs}</td>
                            <td className="text-right">{b.input_tokens.toLocaleString()}</td>
                            <td className="text-right">{b.output_tokens.toLocaleString()}</td>
                            <td className="text-right text-emerald-300">{formatUsd(b.cost_usd)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 pt-5 border-t border-zinc-800">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                  Por negocio (7 días)
                </p>
                {byBusiness7d.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin actividad.</p>
                ) : (
                  <ul className="space-y-1 text-[12px] tabular-nums">
                    {byBusiness7d
                      .sort((a, b) => b.cost_usd - a.cost_usd)
                      .map((b) => (
                        <li key={b.slug} className="flex items-center justify-between gap-2 text-zinc-300">
                          <span className="font-mono text-[11px] truncate">{b.slug}</span>
                          <span className="text-zinc-500 text-[10px]">
                            {b.runs} corridas · {(b.input_tokens + b.output_tokens).toLocaleString()} tok
                          </span>
                          <span className="text-emerald-300">{formatUsd(b.cost_usd)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                  Por intención (7 días)
                </p>
                {byIntent7d.length === 0 ? (
                  <p className="text-sm text-zinc-500">Sin actividad.</p>
                ) : (
                  <ul className="space-y-1 text-[12px] tabular-nums">
                    {byIntent7d
                      .sort((a, b) => b.cost_usd - a.cost_usd)
                      .map((b) => (
                        <li key={b.intent} className="flex items-center justify-between gap-2 text-zinc-300">
                          <span className="font-mono text-[11px]">{b.intent}</span>
                          <span className="text-zinc-500 text-[10px]">
                            {b.runs} corridas
                          </span>
                          <span className="text-emerald-300">{formatUsd(b.cost_usd)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
            <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">
              Costos calculados con tarifas públicas estimadas: Opus 4.7 $15/$75, Sonnet 4.6 $3/$15,
              Haiku 4.5 $1/$5 por millón de tokens (in/out). Tokens cacheados se descuentan al 10%.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
            Cuándo dispara cada modelo
          </h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-emerald-950/40 text-emerald-300 border-emerald-900/60 self-start whitespace-nowrap">
                  Opus 4.7
                </span>
                <div>
                  <p className="text-zinc-100">Solo cuando construís sobre tu baseline.</p>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    Onboarding (genera tu protocolo bespoke), agregar/quitar/modificar
                    tareas, cambios de proveedores. La heurística detecta palabras clave
                    como <code className="text-amber-300">agregá</code>,{" "}
                    <code className="text-amber-300">marcá</code>,{" "}
                    <code className="text-amber-300">tarea</code>,{" "}
                    <code className="text-amber-300">protocolo</code>.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-sky-950/40 text-sky-300 border-sky-900/60 self-start whitespace-nowrap">
                  Sonnet 4.6
                </span>
                <div>
                  <p className="text-zinc-100">Eventos rutinarios del día a día.</p>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    Reportar una venta, una entrega, una foto de factura, una nota de voz.
                    Procesa con el mismo set de tools que Opus, ~5x más barato y 2x más
                    rápido.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border bg-amber-950/40 text-amber-300 border-amber-900/60 self-start whitespace-nowrap">
                  Haiku 4.5
                </span>
                <div>
                  <p className="text-zinc-100">Recordatorios proactivos del cron.</p>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    Cada {intervalMin} min revisa los pendientes vencidos y la hora del día,
                    decide si vale la pena pingearte. La mayoría de las veces se queda
                    callado.
                  </p>
                </div>
              </li>
            </ul>
            <p className="text-[10px] text-zinc-600 mt-4 leading-relaxed">
              ¿Por qué? Opus razona mejor pero cuesta más. Reservarlo para los momentos que
              cambian el baseline del negocio mantiene la economía sana
              (~$0.05–0.15 por interacción en lugar de $0.30–0.50). Sonnet ya cubre el grueso
              del trabajo operativo. Haiku se encarga de la vigilancia barata.
            </p>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
            Anthropic Managed Agents activos ({seenAgents.size})
          </h2>
          {seenAgents.size === 0 ? (
            <p className="text-sm text-zinc-500">Aún no hay corridas con Managed Agents Sessions registradas.</p>
          ) : (
            <ul className="space-y-2">
              {Array.from(seenAgents.values())
                .sort((a, b) => new Date(b.lastSeen ?? 0).getTime() - new Date(a.lastSeen ?? 0).getTime())
                .map((a) => (
                  <li
                    key={`${a.agent_id}|${a.model}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <code className="text-xs text-emerald-300 break-all">{a.agent_id}</code>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                        {a.model}
                      </span>
                    </div>
                    <p className="text-[12px] text-zinc-500 mt-1">
                      {a.runs} corridas · última {timeAgo(a.lastSeen)} · {a.businesses.size} negocio
                      {a.businesses.size === 1 ? "" : "s"}
                    </p>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      negocios: {Array.from(a.businesses).join(", ")}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-zinc-400 mb-3">
            Por negocio ({businesses.length})
          </h2>
          <ul className="space-y-3">
            {businesses.map((b) => {
              const bizRuns = runsByBiz.get(b.slug) ?? [];
              const bizCheckIns = checkInsByBiz.get(b.slug) ?? [];
              const lastRun = bizRuns[0];
              const lastCheckIn = bizCheckIns[0];
              return (
                <li
                  key={b.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                >
                  <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                    <Link
                      href={`/dashboard/${b.slug}`}
                      className="text-base font-semibold text-zinc-100 hover:text-emerald-300"
                    >
                      {b.name}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                      {b.vertical} · {b.owner_name ?? "—"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Última corrida del agente
                      </p>
                      {lastRun ? (
                        <p className="text-zinc-300">
                          <span className="text-emerald-300">{lastRun.status}</span>
                          {" · "}
                          {fmt(lastRun.started_at)} ({timeAgo(lastRun.started_at)})
                        </p>
                      ) : (
                        <p className="text-zinc-500">sin corridas aún</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                        Último check-in (cron)
                      </p>
                      {lastCheckIn ? (
                        <p className="text-zinc-300">
                          <span className={lastCheckIn.status === "fired" ? "text-amber-300" : "text-zinc-400"}>
                            {lastCheckIn.status}
                          </span>
                          {" · "}
                          {fmt(lastCheckIn.fired_at ?? lastCheckIn.created_at)} ({timeAgo(lastCheckIn.fired_at ?? lastCheckIn.created_at)})
                        </p>
                      ) : (
                        <p className="text-zinc-500">aún no ha tocado</p>
                      )}
                    </div>
                  </div>
                  {bizRuns.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer">
                        últimas {Math.min(5, bizRuns.length)} corridas
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {bizRuns.slice(0, 5).map((r) => {
                          const inp = asObject(r.input);
                          const out = asObject(r.output);
                          const intent = (inp.intent as string | undefined) ?? "?";
                          const model = (inp.model as string | undefined) ?? "?";
                          const summary = typeof out.summary === "string" ? out.summary : "";
                          return (
                            <li key={r.event_id} className="text-[12px] text-zinc-400">
                              <Link href={`/runs/${r.event_id}`} className="hover:text-zinc-100">
                                <span className="text-zinc-500">{fmt(r.started_at)}</span>
                                {" · "}
                                <span className="text-emerald-300">{intent}</span>
                                {" · "}
                                <span>{model}</span>
                                <p className="ml-0 text-zinc-300 truncate">
                                  {summary.slice(0, 140)}
                                </p>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
