import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { runAgentOnEvent } from "@/lib/agent/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().uuid(),
  task_id: z.string().uuid(),
  note: z.string().max(500).optional(),
  media_url: z.string().url().optional(),
  logged_by: z.string().max(60).optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try { raw = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }

  const { token, task_id, note, media_url, logged_by } = parsed.data;

  // Resolve business + project from magic token
  const rows = await sql<Array<{
    business_id: string;
    project_id: string;
    business_name: string;
    vertical: string;
  }>>`
    select b.id as business_id, p.id as project_id, b.name as business_name, b.vertical
    from businesses b
    join projects p on p.business_id = b.id
    where b.magic_token = ${token}::uuid and b.vertical = 'delegacion'
    limit 1
  `;
  if (!rows[0]) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  const { business_id, project_id, business_name, vertical } = rows[0];

  // Resolve task title
  const taskRows = await sql<Array<{ title: string }>>`
    select title from tasks where id = ${task_id} and business_id = ${business_id}
  `;
  if (!taskRows[0]) {
    return NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  }
  const task_title = taskRows[0].title;

  // Mark task done
  await sql`
    update tasks set status = 'done', updated_at = now()
    where id = ${task_id} and business_id = ${business_id}
  `;

  // Build the event text that Capataz will read
  const parts = [`Delegado marcó hecha la tarea: "${task_title}".`];
  if (note) parts.push(`Nota: "${note}".`);
  if (media_url) parts.push(`Foto adjunta: ${media_url}`);
  const eventText = parts.join(" ");

  // Log event
  const [evt] = await sql<Array<{ id: string }>>`
    insert into events (project_id, type, payload, media_url, created_by)
    values (
      ${project_id},
      'task_log',
      ${JSON.stringify({ text: eventText, task_id, task_title, note: note ?? null, logged_by: logged_by ?? "delegado" })}::jsonb,
      ${media_url ?? null},
      ${logged_by ?? "delegado"}
    )
    returning id
  `;

  // Fire agent asynchronously — owner sees it in their dashboard
  void runAgentOnEvent(evt.id, { intent: "routine_event" })
    .catch((err) => console.error("[delegate/log] agent failed", err));

  return NextResponse.json({ ok: true, event_id: evt.id });
}
