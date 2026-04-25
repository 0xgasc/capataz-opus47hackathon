// Proactive check-in for a single business. Runs Haiku 4.5 (cheap, fast) — its job
// is just to look at the recent state and decide whether to ping the operator.
//
// Inserts a synthetic event of type "scheduled_checkin" so the same agent runner
// + tool surface handles it; the only real difference is the model selection.

import { sql } from "@/lib/db";
import { runAgentOnEvent } from "./runner";

export type CheckInOutcome = {
  business_id: string;
  slug: string;
  status: "fired" | "skipped" | "error";
  agent_summary: string | null;
  agent_run_id?: string;
  message?: string;
  event_id?: string;
  error?: string;
};

export async function runCheckInForBusiness(businessId: string): Promise<CheckInOutcome> {
  const businesses = await sql<
    Array<{
      id: string;
      slug: string;
      vertical: string;
      owner_name: string | null;
      telegram_chat_id: string | null;
    }>
  >`
    select id, slug, vertical, owner_name, telegram_chat_id
    from businesses where id = ${businessId}
  `;
  const biz = businesses[0];
  if (!biz) {
    return {
      business_id: businessId,
      slug: "?",
      status: "error",
      agent_summary: null,
      error: "business not found",
    };
  }

  const projects = await sql<Array<{ id: string }>>`
    select id from projects where business_id = ${biz.id} order by created_at asc limit 1
  `;
  const project = projects[0];
  if (!project) {
    return {
      business_id: businessId,
      slug: biz.slug,
      status: "skipped",
      agent_summary: null,
      message: "no project linked",
    };
  }

  const [checkInRow] = await sql<Array<{ id: string }>>`
    insert into agent_check_ins (business_id, intent, status)
    values (${biz.id}, 'nudge', 'pending')
    returning id
  `;

  const promptText = `Es hora de un check-in proactivo. Mirá los eventos recientes y el score, y decidí si ${biz.owner_name ?? "el operador"} necesita un recordatorio o aviso. Si no hay nada urgente, NO mandes mensaje — solo respondé "todo en orden, sin mensaje".`;

  const [eventRow] = await sql<Array<{ id: string }>>`
    insert into events (project_id, type, payload, created_by)
    values (
      ${project.id},
      'scheduled_checkin',
      ${JSON.stringify({
        text: promptText,
        chat_id: biz.telegram_chat_id ? Number(biz.telegram_chat_id) : null,
        check_in_id: checkInRow.id,
      })}::jsonb,
      'capataz-cron'
    )
    returning id
  `;

  try {
    const output = await runAgentOnEvent(eventRow.id, { intent: "nudge" });
    const repliedInChat = (output.toolsCalled ?? []).some((t) => t.name === "reply_in_chat");
    const status = repliedInChat ? "fired" : "skipped";
    await sql`
      update agent_check_ins
      set status = ${status}, fired_at = now(), message = ${output.summary},
          output = ${JSON.stringify({ summary: output.summary, tools: output.toolsCalled?.map((t) => t.name) ?? [] })}::jsonb
      where id = ${checkInRow.id}
    `;
    return {
      business_id: biz.id,
      slug: biz.slug,
      status,
      agent_summary: output.summary,
      event_id: eventRow.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`
      update agent_check_ins
      set status = 'error', fired_at = now(), message = ${msg}
      where id = ${checkInRow.id}
    `;
    return {
      business_id: biz.id,
      slug: biz.slug,
      status: "error",
      agent_summary: null,
      error: msg,
    };
  }
}

export async function runCheckInsForAll(): Promise<CheckInOutcome[]> {
  const all = await sql<Array<{ id: string }>>`select id from businesses order by created_at asc`;
  const out: CheckInOutcome[] = [];
  for (const b of all) {
    out.push(await runCheckInForBusiness(b.id));
  }
  return out;
}
