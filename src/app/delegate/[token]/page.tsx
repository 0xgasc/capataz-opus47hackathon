import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { TaskLogger } from "./task-logger";

export const dynamic = "force-dynamic";

type TaskRow = {
  id: string;
  title: string;
  detail: string | null;
  category: string | null;
  status: string;
  evidence_required: string | null;
  cadence: string | null;
  due_at: string | null;
  last_completed_at: string | null;
};

function nextOccurrenceLabel(t: TaskRow): string | null {
  if (!t.cadence || t.cadence === "one_off") {
    if (t.due_at) {
      const d = new Date(t.due_at);
      return `vence ${d.toLocaleDateString("es-GT", { day: "numeric", month: "short" })}`;
    }
    return null;
  }
  if (t.cadence === "daily") return "se repite mañana";
  if (t.cadence === "weekly") return "se repite la próxima semana";
  if (t.cadence === "monthly") return "se repite el próximo mes";
  return null;
}

async function loadEncargo(token: string) {
  const rows = await sql<Array<{
    business_id: string;
    business_name: string;
    owner_name: string | null;
    description: string | null;
  }>>`
    select b.id as business_id, b.name as business_name, b.owner_name, b.description
    from businesses b
    where b.magic_token = ${token}::uuid and b.vertical = 'delegacion'
  `;
  if (!rows[0]) return null;

  const { business_id, business_name, owner_name, description } = rows[0];

  const tasks = await sql<TaskRow[]>`
    select id, title, detail, category, status, evidence_required,
           cadence, due_at::text, last_completed_at::text
    from tasks
    where business_id = ${business_id}
    order by
      case status when 'pending' then 0 when 'in_progress' then 1 when 'done' then 2 else 3 end,
      created_at
  `;

  return { business_id, business_name, owner_name, description, tasks };
}

export default async function DelegatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadEncargo(token);

  if (!data) notFound();

  const { business_name, owner_name, description, tasks } = data;

  const activeTasks = tasks.filter((t) => t.status !== "done");
  const doneTasks   = tasks.filter((t) => t.status === "done");
  const recurring   = doneTasks.filter((t) => t.cadence && t.cadence !== "one_off");
  const done        = doneTasks.length;
  const total       = tasks.length;
  const pct         = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="max-w-lg mx-auto w-full px-4 py-8 flex-1 flex flex-col">

        {/* Header */}
        <header className="mb-6">
          <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">
            CAPA · Encargo
          </p>
          <h1 className="text-xl font-semibold leading-snug">{business_name}</h1>
          {owner_name && (
            <p className="text-sm text-zinc-400 mt-0.5">de {owner_name}</p>
          )}
          {description && (
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{description}</p>
          )}
        </header>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
            <span>{done} de {total} tareas completadas</span>
            <span className="tabular-nums font-medium text-zinc-300">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Active tasks */}
        <TaskLogger tasks={activeTasks} token={token} />

        {/* Pipeline — recurring tasks that will come back */}
        {recurring.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-zinc-800" />
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">
                Protocolo
              </p>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
            <p className="text-xs text-zinc-600 mb-3 text-center">
              Tareas que se repiten según su cadencia. CAPA las reactiva automáticamente.
            </p>
            <ul className="space-y-2">
              {recurring.map((t) => {
                const next = nextOccurrenceLabel(t);
                return (
                  <li key={t.id} className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 px-4 py-3 flex items-start gap-3">
                    {/* Cadence icon */}
                    <div className="mt-0.5 shrink-0 text-base">
                      {t.cadence === "daily" ? "🔄" : t.cadence === "weekly" ? "📅" : "🗓️"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-400 leading-snug">{t.title}</p>
                      {t.detail && (
                        <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{t.detail}</p>
                      )}
                    </div>
                    {next && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5 mt-0.5">
                        {next}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="mt-8 text-center text-[11px] text-zinc-600">
          Powered by CAPA · Claude Opus 4.7
        </footer>
      </div>
    </main>
  );
}
