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
  message: z.string().min(0).max(2000).optional().default(""),
  image_url: z.string().url().max(500).optional(),
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

  const hasImage = !!parsed.data.image_url;
  const messageText = parsed.data.message?.trim() ?? "";
  if (!hasImage && !messageText) {
    return NextResponse.json({ ok: false, error: "message or image required" }, { status: 400 });
  }

  const eventType = hasImage ? "photo" : "dashboard_message";
  const payload = hasImage
    ? {
        text: messageText,
        caption: messageText || null,
        media_url: parsed.data.image_url,
        chat_id: project.chat_id ? Number(project.chat_id) : null,
        source: "dashboard",
      }
    : {
        text: messageText,
        chat_id: project.chat_id ? Number(project.chat_id) : null,
        source: "dashboard",
      };

  const [eventRow] = await sql<Array<{ id: string }>>`
    insert into events (project_id, type, payload, telegram_msg_id, media_url, created_by)
    values (
      ${project.id},
      ${eventType},
      ${JSON.stringify(payload)}::jsonb,
      null,
      ${parsed.data.image_url ?? null},
      ${author}
    )
    returning id
  `;

  // Tighter routing: Sonnet handles all chat (task management included — Sonnet is
  // capable of list_tasks/complete_task/upsert_task). Opus is reserved for events
  // that change the architecture of the business itself: onboarding, installing
  // a new module, asking for design help. Detected via narrower keywords below.
  const msg = parsed.data.message.toLowerCase();
  // Trigger Opus + extended thinking for moments that change the operator's
  // baseline: adding/removing tasks, installing modules, asking for redesign.
  // Routine reports stay on Sonnet (cheaper, faster, no thinking overhead).
  // Each entry is a regex matched against the (lowercased) message. Allows
  // optional articles between verb + noun ("agregá tarea" / "agregá una tarea").
  const baselineRegexes: RegExp[] = [
    /activá?r? (el )?(m[óo]dulo)/,
    /instal(á|ar)? (el )?(m[óo]dulo)/,
    /valuaci[óo]n|valu(á|ar)/,
    /necesito (un )?m[óo]dulo/,
    /redise[ñn](á|a|o|ar|io)/,
    /(agreg(á|ar?|ame)|añad(í|ir)) (una?\s+)?tarea/,
    /(nueva|crear|cre(á|ar)) tarea/,
    /(borr(á|ar)|elimin(á|ar)|quit(á|ar)) (la\s+)?tarea/,
    /recordam?e/,
    /agend(á|ame|ar)/,
  ];
  const isBaselineChange = baselineRegexes.some((rx) => rx.test(msg));
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
