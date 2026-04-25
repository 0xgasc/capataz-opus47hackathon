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

  const projects = await sql<Array<{ id: string; project_name: string; owner_name: string | null; chat_id: string | null }>>`
    select p.id,
           p.name as project_name,
           b.owner_name,
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
  const author = project.owner_name?.trim() || "tú";

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
      ${author}
    )
    returning id
  `;

  // Tighter routing: Sonnet handles all chat (task management included — Sonnet is
  // capable of list_tasks/complete_task/upsert_task). Opus is reserved for events
  // that change the architecture of the business itself: onboarding, installing
  // a new module, asking for design help. Detected via narrower keywords below.
  const msg = parsed.data.message.toLowerCase();
  const moduleKeywords = [
    "activá el módulo", "activar el módulo", "activá módulo", "activar módulo",
    "instalá el módulo", "instalar el módulo", "instalá módulo",
    "valuación", "valuacion", "valuá", "valuar",
    "necesito un módulo", "necesito modulo",
    "rediseñá", "redisenar", "rediseño", "redisenio",
  ];
  const isModuleInstall = moduleKeywords.some((kw) => msg.includes(kw));
  const intent = isModuleInstall ? "baseline_change" : "routine_event";

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
