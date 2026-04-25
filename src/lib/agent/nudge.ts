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

  // Find tasks that are "due" based on cadence + last_completed_at.
  const dueTasks = await sql<
    Array<{ id: string; title: string; detail: string | null; cadence: string; category: string | null; last_completed_at: Date | string | null }>
  >`
    select id, title, detail, cadence, category, last_completed_at
    from tasks
    where business_id = ${biz.id}
      and status = 'pending'
      and (
        (cadence = 'daily'   and (last_completed_at is null or last_completed_at < now() - interval '20 hours')) or
        (cadence = 'weekly'  and (last_completed_at is null or last_completed_at < now() - interval '6 days')) or
        (cadence = 'monthly' and (last_completed_at is null or last_completed_at < now() - interval '28 days')) or
        (cadence = 'one_off' and due_at is not null and due_at < now() + interval '24 hours')
      )
    order by
      case cadence when 'one_off' then 0 when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end,
      coalesce(last_completed_at, '1970-01-01')
    limit 5
  `;

  const taskBullets = dueTasks.length
    ? dueTasks
        .map(
          (t) =>
            `- [${t.cadence}] ${t.title}${t.detail ? " — " + t.detail : ""}${t.last_completed_at ? " (última vez: " + new Date(t.last_completed_at).toISOString().slice(0, 10) + ")" : " (nunca completada)"}`,
        )
        .join("\n")
    : "(sin tareas vencidas)";

  // Guatemala = UTC-6 year-round, so this is good enough for the demo.
  const guateHour = (new Date().getUTCHours() - 6 + 24) % 24;
  const timeBucket =
    guateHour < 6 ? "madrugada (no molestés salvo emergencia)"
    : guateHour < 9 ? "mañana temprana — bueno para arrancar el día y revisar tareas diarias"
    : guateHour < 12 ? "media mañana — bueno para empujar pendientes pendientes"
    : guateHour < 14 ? "mediodía — solo si hay algo realmente urgente"
    : guateHour < 17 ? "tarde — bueno para preguntar cómo va el día"
    : guateHour < 20 ? "fin del día laboral — bueno para cierre de caja, conteos, recordatorios de cuentas"
    : guateHour < 22 ? "noche — solo cosas pendientes de cuentas"
    : "noche tarde (no molestés salvo emergencia)";

  const promptText = `Check-in proactivo para ${biz.owner_name ?? "el operador"}.

Hora actual: ${guateHour.toString().padStart(2, "0")}:00 hora de Guatemala — ${timeBucket}.

Tareas del protocolo que están vencidas o por vencer:
${taskBullets}

Mirá los eventos recientes y el score con query_project_state. Decidí si es BUEN MOMENTO para mandar un recordatorio (considerá la hora del día). Si hay una tarea importante vencida Y la hora es apropiada, mandale UN mensaje corto por reply_in_chat mencionando la tarea específica. Si no es buen momento, o todo está al día, NO mandes mensaje — solo respondé "todo en orden, sin mensaje".`;

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
