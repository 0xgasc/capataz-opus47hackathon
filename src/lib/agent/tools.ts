// Real tool implementations used by the Opus 4.7 runner. Each tool pairs a JSON-schema
// definition (what Opus sees) with a TypeScript handler (what actually runs). We mirror the
// surface of the MCP server in src/mcp-server/index.ts — that scaffold stays in the repo
// so this could be externalized over MCP-over-HTTP later, but for MVP we call directly.

import { sql } from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { asObject } from "@/lib/json";

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "query_project_state",
    description:
      "Return the active project snapshot: budget categories with committed vs spent (GTQ), the most recent events, open anomalies, and supplier directory. Call this first whenever you need context.",
    input_schema: {
      type: "object",
      properties: {
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["budget", "events", "anomalies", "suppliers"],
          },
          description: "Which sections to include. Defaults to all.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max events to return (default 10).",
        },
      },
    },
  },
  {
    name: "log_event",
    description:
      "Attach structured enrichment to the current event. Use this to store what you parsed from a voice note or photo (supplier, amount, items, category). The enrichment is merged into events.payload.",
    input_schema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: {
          type: "string",
          description: "One-line Spanish summary of what happened on site.",
        },
        supplier: { type: "string", description: "Supplier name if identified." },
        amount_gtq: {
          type: "number",
          description: "Total amount on the receipt in GTQ, if present.",
        },
        category: {
          type: "string",
          description:
            "Budget category this event touches (cemento, acero, mamposteria, agregados, acabados, mano_obra, otros).",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              qty: { type: "number" },
              unit_cost_gtq: { type: "number" },
              unit: { type: "string" },
            },
          },
          description: "Line items on a receipt or materials delivered.",
        },
      },
    },
  },
  {
    name: "flag_anomaly",
    description:
      "Raise an anomaly for the PM. Only use when something warrants attention: category overspend, duplicate delivery within a few hours, off-hours activity (before 06:00 or after 20:00 local), supplier not in directory, or a receipt that doesn't match any budget line.",
    input_schema: {
      type: "object",
      required: ["kind", "severity", "message"],
      properties: {
        kind: {
          type: "string",
          description: "Short machine label: 'overspend' | 'duplicate_delivery' | 'off_hours' | 'unknown_supplier' | 'unbudgeted' | other.",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
        message: {
          type: "string",
          description: "One-sentence Spanish explanation for the PM.",
        },
      },
    },
  },
  {
    name: "reply_in_chat",
    description:
      "Send a short Spanish message back to the Telegram chat. Use sparingly — only when the foreman needs immediate feedback (e.g. you flagged a serious anomaly). The webhook already sends 'recibido ✓' automatically; don't duplicate that.",
    input_schema: {
      type: "object",
      required: ["text"],
      properties: {
        text: {
          type: "string",
          description: "Spanish message, <200 chars. Plain text, no markdown.",
        },
      },
    },
  },
];

export type ToolContext = {
  projectId: string;
  eventId: string;
  chatId: number | string | null;
};

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ ok: boolean; result: unknown }> {
  switch (name) {
    case "query_project_state":
      return { ok: true, result: await queryProjectState(input, ctx) };
    case "log_event":
      return { ok: true, result: await logEvent(input, ctx) };
    case "flag_anomaly":
      return { ok: true, result: await flagAnomaly(input, ctx) };
    case "reply_in_chat":
      return { ok: true, result: await replyInChat(input, ctx) };
    default:
      return { ok: false, result: `unknown tool: ${name}` };
  }
}

async function queryProjectState(input: Record<string, unknown>, ctx: ToolContext) {
  const include = new Set(
    Array.isArray(input.include) && input.include.length
      ? (input.include as string[])
      : ["budget", "events", "anomalies", "suppliers"],
  );
  const limit = Math.min(50, Math.max(1, Number(input.limit ?? 10)));

  const out: Record<string, unknown> = {};

  if (include.has("budget")) {
    const rows = await sql`
      select category,
             coalesce(sum(qty * unit_cost_gtq), 0)::numeric as committed_gtq,
             coalesce(sum(spent_gtq), 0)::numeric as spent_gtq
      from budget_items
      where project_id = ${ctx.projectId}
      group by category
      order by committed_gtq desc
    `;
    out.budget = rows.map((r) => ({
      category: r.category,
      committed_gtq: Number(r.committed_gtq),
      spent_gtq: Number(r.spent_gtq),
    }));
  }

  if (include.has("events")) {
    const rows = await sql`
      select id, type, payload, created_by, created_at
      from events
      where project_id = ${ctx.projectId} and id <> ${ctx.eventId}
      order by created_at desc
      limit ${limit}
    `;
    out.events = rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: asObject(r.payload),
      created_by: r.created_by,
      created_at: r.created_at,
    }));
  }

  if (include.has("anomalies")) {
    const rows = await sql`
      select id, kind, severity, status, agent_message, created_at
      from anomalies
      where project_id = ${ctx.projectId}
      order by created_at desc
      limit 20
    `;
    out.anomalies = rows;
  }

  if (include.has("suppliers")) {
    out.suppliers = await sql`
      select name, telegram_handle, categories from suppliers order by name
    `;
  }

  return out;
}

async function logEvent(input: Record<string, unknown>, ctx: ToolContext) {
  const enrichment = { ...input, logged_by_agent: true };
  await sql`
    update events
    set payload = payload || ${JSON.stringify(enrichment)}::jsonb
    where id = ${ctx.eventId}
  `;
  return { merged_into_event: ctx.eventId, keys: Object.keys(enrichment) };
}

async function flagAnomaly(input: Record<string, unknown>, ctx: ToolContext) {
  const kind = String(input.kind ?? "unspecified");
  const severity = String(input.severity ?? "medium");
  const message = String(input.message ?? "");
  const rows = await sql<Array<{ id: string }>>`
    insert into anomalies (project_id, event_id, kind, severity, agent_message)
    values (${ctx.projectId}, ${ctx.eventId}, ${kind}, ${severity}, ${message})
    returning id
  `;
  return { anomaly_id: rows[0].id, kind, severity };
}

async function replyInChat(input: Record<string, unknown>, ctx: ToolContext) {
  if (ctx.chatId == null) return { sent: false, reason: "no chat_id in context" };
  const text = String(input.text ?? "").slice(0, 500);
  if (!text) return { sent: false, reason: "empty text" };
  try {
    await sendMessage(ctx.chatId, text);
    return { sent: true, to: ctx.chatId };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
