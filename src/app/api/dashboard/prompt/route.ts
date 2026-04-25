// In-page agent ingress. The dashboard "Ask Capataz" input posts here:
//   { businessSlug, message }
// We create an event of type 'dashboard_message' on the business's primary
// project, fire the regular agent loop (Sonnet for routine), and return the
// event id + the agent's reply. The dashboard's auto-refresh picks up state
// changes (completed tasks, new anomalies, recomputed score) on the next tick.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { runAgentOnEvent } from "@/lib/agent/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  slug: z.string().min(1).max(80),
  message: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "bad body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const projects = await sql<Array<{ id: string; project_name: string; biz_name: string; chat_id: string | null }>>`
    select p.id,
           p.name as project_name,
           b.name as biz_name,
           b.telegram_chat_id as chat_id
    from businesses b
    join projects p on p.business_id = b.id
    where b.slug = ${parsed.data.slug}
    order by p.created_at asc
    limit 1
  `;
  if (!projects[0]) {
    return NextResponse.json({ ok: false, error: "business not found" }, { status: 404 });
  }
  const project = projects[0];

  const [eventRow] = await sql<Array<{ id: string }>>`
    insert into events (project_id, type, payload, created_by)
    values (
      ${project.id},
      'dashboard_message',
      ${JSON.stringify({
        text: parsed.data.message,
        chat_id: project.chat_id ? Number(project.chat_id) : null,
        source: "dashboard",
      })}::jsonb,
      'web-user'
    )
    returning id
  `;

  // Heuristic: if the user is modifying their baseline (adding/removing/completing
  // tasks, changing suppliers, etc.) we route the call to Opus (intent='baseline_change').
  // Routine reports stay on Sonnet.
  const msg = parsed.data.message.toLowerCase();
  const baselineKeywords = [
    "agregá", "agrega", "agregar", "añadí", "anadi", "añadir", "anadir",
    "marcá", "marca", "marcar", "completá", "completa", "completar",
    "borrá", "borra", "borrar", "quitá", "quita", "quitar", "eliminá", "eliminar",
    "creá", "crear", "actualizá", "actualizar",
    "recordame", "recordá", "recordar",
    "tarea", "protocolo", "rutina", "rutinas",
  ];
  const isBaselineChange = baselineKeywords.some((kw) => msg.includes(kw));
  const intent = isBaselineChange ? "baseline_change" : "routine_event";

  try {
    const output = await runAgentOnEvent(eventRow.id, { intent });
    return NextResponse.json({
      ok: true,
      event_id: eventRow.id,
      summary: output.summary,
      tools: (output.toolsCalled ?? []).map((t) => t.name),
      status: output.status,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        event_id: eventRow.id,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
