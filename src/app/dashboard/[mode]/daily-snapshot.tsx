import { sql } from "@/lib/db";

type Snapshot = {
  daily_tasks_due: number;
  daily_tasks_done: number;
  pct_done: number;
  events_today: number;
  anomalies_today: number;
  score_now: number | null;
  score_24h_ago: number | null;
};

async function loadSnapshot(businessId: string, projectId: string): Promise<Snapshot> {
  // 1. Daily tasks: how many "daily" cadence tasks were completed today vs total daily
  //    tasks the business has on its protocol. Approximate but useful headline.
  const [dailyCounts] = await sql<Array<{ due: string; done_today: string }>>`
    select
      count(*)::text as due,
      sum(case when last_completed_at::date = current_date then 1 else 0 end)::text as done_today
    from tasks
    where business_id = ${businessId} and cadence = 'daily' and status <> 'snoozed'
  `;
  const due = Number(dailyCounts?.due ?? 0);
  const done = Number(dailyCounts?.done_today ?? 0);
  const pct = due > 0 ? Math.round((done / due) * 100) : 0;

  // 2. Events today on this project.
  const [eventCount] = await sql<Array<{ n: string }>>`
    select count(*)::text as n
    from events
    where project_id = ${projectId} and created_at::date = current_date
  `;

  // 3. Anomalies opened today.
  const [anomalyCount] = await sql<Array<{ n: string }>>`
    select count(*)::text as n
    from anomalies
    where project_id = ${projectId} and created_at::date = current_date
  `;

  // 4. Score now vs 24h ago.
  const [scoreNow] = await sql<Array<{ score: number }>>`
    select score from project_scores
    where project_id = ${projectId}
    order by computed_at desc limit 1
  `;
  const [scorePast] = await sql<Array<{ score: number }>>`
    select score from project_scores
    where project_id = ${projectId} and computed_at < now() - interval '24 hours'
    order by computed_at desc limit 1
  `;

  return {
    daily_tasks_due: due,
    daily_tasks_done: done,
    pct_done: pct,
    events_today: Number(eventCount?.n ?? 0),
    anomalies_today: Number(anomalyCount?.n ?? 0),
    score_now: scoreNow?.score ?? null,
    score_24h_ago: scorePast?.score ?? null,
  };
}

function pctColor(pct: number): string {
  if (pct >= 80) return "text-emerald-300";
  if (pct >= 50) return "text-amber-300";
  return "text-rose-300";
}

export async function DailySnapshot({
  businessId,
  projectId,
  showScore,
}: {
  businessId: string;
  projectId: string;
  showScore: boolean;
}) {
  const s = await loadSnapshot(businessId, projectId);

  const scoreDelta =
    s.score_now != null && s.score_24h_ago != null ? s.score_now - s.score_24h_ago : null;

  return (
    <section className="px-4 sm:px-5 pt-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Hoy</p>
          {showScore && s.score_now != null && (
            <p className={`text-[12px] tabular-nums ${pctColor(s.score_now)}`}>
              score: {s.score_now}/100
              {scoreDelta != null && scoreDelta !== 0 && (
                <span className="ml-1.5 text-[11px]">
                  {scoreDelta > 0 ? "▲" : "▼"} {Math.abs(scoreDelta)}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div>
            <p className={`text-2xl font-semibold tabular-nums leading-none ${pctColor(s.pct_done)}`}>
              {s.pct_done}
              <span className="text-base text-zinc-500">%</span>
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 leading-snug">
              tareas de hoy ({s.daily_tasks_done}/{s.daily_tasks_due})
            </p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums leading-none text-zinc-100">
              {s.events_today}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 leading-snug">
              {s.events_today === 1 ? "evento hoy" : "eventos hoy"}
            </p>
          </div>
          <div>
            <p
              className={`text-2xl font-semibold tabular-nums leading-none ${
                s.anomalies_today > 0 ? "text-amber-300" : "text-zinc-100"
              }`}
            >
              {s.anomalies_today}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 leading-snug">
              {s.anomalies_today === 1 ? "alerta nueva" : "alertas nuevas"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
