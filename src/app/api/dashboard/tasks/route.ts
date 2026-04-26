// One-click task interactions from the dashboard:
//   { action: "complete", task_id, slug }    → marks done immediately, no agent turn
//   { action: "comment",  task_id, slug, message } → routes through the agent loop
//                                                    (Opus, intent='baseline_change')
//                                                    so it can decide to complete /
//                                                    update / annotate / etc.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { runAgentOnEvent } from "@/lib/agent/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    slug: z.string().min(1).max(80),
    task_id: z.string().min(1).max(80),
    note: z.string().max(1000).optional(),
    media_url: z.string().url().optional(),
  }),
  z.object({
    action: z.literal("comment"),
    slug: z.string().min(1).max(80),
    task_id: z.string().min(1).max(80),
    message: z.string().min(1).max(2000),
  }),
]);

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

  const data = parsed.data;
  const projects = await sql<Array<{ project_id: string; business_id: string; chat_id: string | null; owner_name: string | null }>>`
    select p.id as project_id, b.id as business_id,
           b.telegram_chat_id as chat_id, b.owner_name
    from businesses b
    join projects p on p.business_id = b.id
    where b.slug = ${data.slug}
    order by p.created_at asc
    limit 1
  `;
  if (!projects[0]) {
    return NextResponse.json({ ok: false, error: "business not found" }, { status: 404 });
  }
  const ctx = projects[0];
  const author = ctx.owner_name?.trim() || "tú";

  const tasks = await sql<Array<{ id: string; title: string; status: string; evidence_required: string | null }>>`
    select id, title, status, evidence_required from tasks
    where id = ${data.task_id} and business_id = ${ctx.business_id}
  `;
  if (!tasks[0]) {
    return NextResponse.json({ ok: false, error: "task not found" }, { status: 404 });
  }
  const task = tasks[0];

  if (data.action === "complete") {
    const note = "note" in data ? data.note : undefined;
    const mediaUrl = "media_url" in data ? data.media_url : undefined;

    await sql`
      update tasks
      set status = 'done', last_completed_at = now(), updated_at = now()
      where id = ${task.id}
    `;
    await sql`
      insert into events (project_id, type, payload, media_url, created_by)
      values (
        ${ctx.project_id},
        'task_completed',
        ${JSON.stringify({
          task_id: task.id,
          task_title: task.title,
          note: note ?? null,
          media_url: mediaUrl ?? null,
          source: "dashboard_click",
        })}::jsonb,
        ${mediaUrl ?? null},
        ${author}
      )
    `;
    return NextResponse.json({ ok: true, completed: { id: task.id, title: task.title } });
  }

  // action === "comment": create a text event with task context, route to Opus.
  const messageText = `[Sobre la tarea "${task.title}" (id ${task.id})]: ${data.message}`;
  const [eventRow] = await sql<Array<{ id: string }>>`
    insert into events (project_id, type, payload, created_by)
    values (
      ${ctx.project_id},
      'dashboard_message',
      ${JSON.stringify({
        text: messageText,
        chat_id: ctx.chat_id ? Number(ctx.chat_id) : null,
        source: "dashboard",
        task_id: task.id,
        task_title: task.title,
      })}::jsonb,
      ${author}
    )
    returning id
  `;

  try {
    const output = await runAgentOnEvent(eventRow.id, { intent: "baseline_change" });
    return NextResponse.json({
      ok: true,
      event_id: eventRow.id,
      summary: output.summary,
      tools: (output.toolsCalled ?? []).map((t) => t.name),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, event_id: eventRow.id, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
