import Link from "next/link";
import { sql } from "@/lib/db";
import { getVertical } from "@/lib/agent/verticals";
import { ThemeToggle } from "./theme-toggle";

export const dynamic = "force-dynamic";

type Vertical = "construction" | "inventory" | "tiendita" | "general";

type BusinessRow = {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  owner_name: string | null;
  description: string | null;
  score: number | null;
  task_count: number;
};

async function loadBusinesses(): Promise<BusinessRow[]> {
  const rows = await sql<BusinessRow[]>`
    select b.id, b.slug, b.name, b.vertical, b.owner_name, b.description,
           (
             select ps.score
             from project_scores ps
             join projects p on p.id = ps.project_id
             where p.business_id = b.id
             order by ps.computed_at desc
             limit 1
           ) as score,
           (select count(*)::int from tasks t where t.business_id = b.id) as task_count
    from businesses b
    order by b.created_at asc
  `;
  return rows;
}

function scoreColor(score: number | null): string {
  if (score == null) return "text-zinc-500";
  if (score >= 85) return "text-emerald-300";
  if (score >= 70) return "text-amber-300";
  if (score >= 50) return "text-orange-300";
  return "text-rose-300";
}

function verticalBadge(v: string): string {
  return v === "construction"
    ? "bg-amber-950/30 text-amber-300 border-amber-900/50"
    : v === "inventory"
    ? "bg-sky-950/30 text-sky-300 border-sky-900/50"
    : v === "general"
    ? "bg-violet-950/30 text-violet-300 border-violet-900/50"
    : "bg-emerald-950/30 text-emerald-300 border-emerald-900/50";
}

export default async function Landing() {
  const businesses = await loadBusinesses();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col">
        <header className="mb-8 sm:mb-10">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-400">
              Capataz · Claude Opus 4.7
            </p>
            <ThemeToggle />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold leading-tight tracking-tight">
            Un agente que vive dentro del grupo de Telegram del equipo, convierte notas de
            voz y fotos en estado estructurado, y emite un score auditable que un
            prestamista puede revisar.
          </h1>
          <p className="text-zinc-400 mt-4 text-sm sm:text-base leading-relaxed max-w-2xl">
            Plataforma para operaciones físicas. Cada negocio que entra tiene su propio
            agente con memoria, su propio protocolo (tareas bespoke escritas por Opus),
            su propio dashboard. Mismo sustrato, distinta personalidad.
          </p>
        </header>

        <section className="mb-6">
          <Link
            href="/onboard"
            className="block rounded-2xl border border-dashed border-emerald-900/60 bg-emerald-950/10 hover:bg-emerald-950/20 p-5 sm:p-6 text-center transition-colors"
          >
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-400 mb-1">
              + agregar un nuevo negocio
            </p>
            <p className="text-sm text-zinc-300">
              Conversación con Opus 4.7 → Capataz aprovisiona tu vertical, te asigna un agente
              persistente con un protocolo bespoke, y te lleva a tu panel.
            </p>
          </Link>
        </section>

        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm uppercase tracking-wider text-zinc-400">
              Negocios activos ({businesses.length})
            </h2>
            <p className="text-[11px] text-zinc-500">
              cada uno con su propio agente + protocolo
            </p>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {businesses.map((b) => {
              const v = getVertical(b.vertical);
              return (
                <li key={b.id}>
                  <Link
                    href={`/dashboard/${b.slug}`}
                    className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 hover:border-emerald-900/60 hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span
                            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${verticalBadge(
                              b.vertical,
                            )}`}
                          >
                            {v.label}
                          </span>
                          {b.owner_name && (
                            <span className="text-[11px] text-zinc-500">
                              {b.owner_name}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-zinc-100 break-words">
                          {b.name}
                        </p>
                        {b.description && (
                          <p className="text-[12px] text-zinc-400 mt-1 leading-snug line-clamp-2">
                            {b.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                          {v.scoreLabel}
                        </p>
                        <p
                          className={`text-2xl font-semibold tabular-nums leading-none mt-0.5 ${scoreColor(
                            b.score,
                          )}`}
                        >
                          {b.score ?? "—"}
                          <span className="text-[11px] text-zinc-500 ml-1">/100</span>
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-3 flex items-center gap-2">
                      <span className="font-mono">{b.slug}</span>
                      <span className="text-zinc-700">·</span>
                      <span>{b.task_count} tareas en protocolo</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-zinc-400 mb-10">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Ingesta</p>
            <p>
              Telegram. Los operadores mandan texto, voz o foto en chapín. Groq Whisper
              transcribe, Opus 4.7 razona en multimodal nativo.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Agente</p>
            <p>
              Opus para onboarding y cambios de baseline; Sonnet para eventos de día a día;
              Haiku para nudges proactivos. Cada negocio tiene su propio Managed Agent.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Salida</p>
            <p>
              Protocolo bespoke escrito por Opus, score compuesto 0–100, traza completa de
              cada decisión — evidencia para un lender o auditor.
            </p>
          </div>
        </section>

        <footer className="mt-auto text-[11px] text-zinc-600 border-t border-zinc-900 pt-5 flex items-center justify-between flex-wrap gap-2">
          <span>
            Datos ficticios. Guatemala · GTQ. MIT-licensed open source. ·{" "}
            <Link href="/agents" className="text-zinc-500 hover:text-emerald-300 underline">
              estado de los agentes
            </Link>
          </span>
          <span>
            Claude Opus 4.7 · Managed Agents 2026-04-01 · Railway · Next.js 16
          </span>
        </footer>
      </div>
    </main>
  );
}
