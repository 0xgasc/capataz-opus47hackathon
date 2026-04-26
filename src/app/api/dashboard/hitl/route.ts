// Operator answers an open HITL request. We log the response, mark the request
// answered, and run the agent again on a synthetic event so it can act on the
// new info immediately.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { runAgentOnEvent } from "@/lib/agent/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
  slug: z.string().min(1).max(80),
  request_id: z.string().min(1).max(80),
  response: z.string().min(1).max(2000),
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
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }

  const business = await sql<Array<{ id: string; project_id: string; chat_id: string | null; owner_name: string | null }>>`
    select b.id, p.id as project_id, b.telegram_chat_id as chat_id, b.owner_name
    from businesses b
    join projects p on p.business_id = b.id
    where b.slug = ${parsed.data.slug}
    order by p.created_at asc
    limit 1
  `;
  if (!business[0]) return NextResponse.json({ ok: false, error: "business not found" }, { status: 404 });
  const ctx = business[0];
  const author = ctx.owner_name?.trim() || "tú";

  const hitl = await sql<Array<{ id: string; question: string }>>`
    update agent_hitl_requests
    set status = 'answered', human_response = ${parsed.data.response}, resolved_at = now()
    where id = ${parsed.data.request_id} and business_id = ${ctx.id} and status = 'open'
    returning id, question
  `;
  if (!hitl[0]) {
    return NextResponse.json({ ok: false, error: "request not found or already resolved" }, { status: 404 });
  }

  // Spawn a new event so the agent can act on the answer.
  const messageText = `[Respuesta del operador a una pregunta previa de Capataz: "${hitl[0].question}"] ${parsed.data.response}`;
  const [eventRow] = await sql<Array<{ id: string }>>`
    insert into events (project_id, type, payload, created_by)
    values (
      ${ctx.project_id},
      'dashboard_message',
      ${JSON.stringify({
        text: messageText,
        chat_id: ctx.chat_id ? Number(ctx.chat_id) : null,
        source: "dashboard",
        hitl_request_id: hitl[0].id,
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
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
