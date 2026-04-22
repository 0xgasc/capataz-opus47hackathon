import Link from "next/link";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type ModeStat = {
  mode: "construction" | "inventory";
  name: string;
  score: number | null;
};

async function loadModeStats(): Promise<ModeStat[]> {
  const rows = await sql<Array<{ mode: string; name: string; score: number | null }>>`
    select p.mode, p.name,
           (select score from project_scores ps where ps.project_id = p.id order by ps.computed_at desc limit 1) as score
    from projects p
    order by p.created_at asc
  `;
  return rows
    .filter((r) => r.mode === "construction" || r.mode === "inventory")
    .map((r) => ({
      mode: r.mode as "construction" | "inventory",
      name: r.name,
      score: r.score,
    }));
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-zinc-500";
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-amber-300";
  if (score >= 50) return "text-orange-300";
  return "text-rose-300";
}

export default async function Landing() {
  const stats = await loadModeStats();
  const statByMode = new Map(stats.map((s) => [s.mode, s]));

  const modeCopy = {
    construction: {
      lens: "Modo A · Operaciones",
      title: "Construcción",
      scoreLabel: "Project Health",
      desc:
        "PM observa una obra activa: entregas, cuadrillas, gastos. El agente detecta sobregastos, actividad fuera de horario, proveedores no autorizados, entregas duplicadas.",
    },
    inventory: {
      lens: "Modo B · Valuación",
      title: "Inventarios",
      scoreLabel: "Collateral Readiness",
      desc:
        "Distribuidor / bodega como colateral de un préstamo. El agente detecta mermas, productos lentos, shocks de precio de mercado, sub-colateralización.",
    },
  } as const;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="max-w-4xl mx-auto w-full px-6 py-12 flex-1 flex flex-col">
        <header className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-3">
            Capataz · Claude Opus 4.7
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold leading-tight">
            Un agente que vive dentro del grupo de Telegram del equipo,
            <br />
            convierte notas de voz y fotos en estado estructurado,
            <br />
            y emite un score auditable que un prestamista puede revisar.
          </h1>
          <p className="text-zinc-400 mt-4 text-base leading-relaxed max-w-2xl">
            Capataz es el primer vertical de una plataforma para operaciones físicas:
            construcción hoy, inventarios distribuidos mañana, cualquier activo físico donde
            alguien reporta movimientos por WhatsApp-o-similar y nadie tiene un ERP.
            Mismo sustrato, misma IA, dos lentes.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {(["construction", "inventory"] as const).map((mode) => {
            const s = statByMode.get(mode);
            const copy = modeCopy[mode];
            return (
              <Link
                key={mode}
                href={`/dashboard/${mode}`}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 hover:border-emerald-900/70 hover:bg-zinc-900 transition-colors"
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-400 mb-2">
                  {copy.lens}
                </p>
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-xl font-semibold mb-2">{copy.title}</h2>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                      {copy.scoreLabel}
                    </p>
                    <p
                      className={`text-2xl font-semibold tabular-nums leading-none mt-0.5 ${scoreColor(
                        s?.score ?? null,
                      )}`}
                    >
                      {s?.score ?? "—"}
                      <span className="text-[11px] text-zinc-500 ml-1">/100</span>
                    </p>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed mb-4">{copy.desc}</p>
                {s?.name && (
                  <p className="text-[11px] text-zinc-500 mt-2 truncate">
                    {s.name}
                  </p>
                )}
                <p className="text-xs text-zinc-500 group-hover:text-zinc-300 mt-2">
                  ir al panel →
                </p>
              </Link>
            );
          })}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-zinc-400 mb-10">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Ingesta</p>
            <p>
              Telegram. Los capataces mandan texto, voz o foto en chapín. Groq Whisper
              transcribe, Opus 4.7 razona en multimodal nativo.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Agente</p>
            <p>
              Claude Managed Agents Sessions (beta). 4 tools custom:{" "}
              <code>query_project_state</code>, <code>log_event</code>,{" "}
              <code>flag_anomaly</code>, <code>recompute_score</code>. Sesión persistente
              por evento — auditable.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Salida</p>
            <p>
              Panel en tiempo casi real, score compuesto 0–100 con 4 componentes, y una
              traza completa por evento — evidencia para un lender.
            </p>
          </div>
        </section>

        <footer className="mt-auto text-[11px] text-zinc-600 border-t border-zinc-900 pt-5 flex items-center justify-between flex-wrap gap-2">
          <span>Datos ficticios. Guatemala · GTQ. MIT-licensed open source.</span>
          <span>
            Claude Opus 4.7 · Managed Agents 2026-04-01 · Railway · Next.js 16
          </span>
        </footer>
      </div>
    </main>
  );
}
