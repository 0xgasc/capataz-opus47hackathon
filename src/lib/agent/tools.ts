// Real tool implementations used by the Opus 4.7 runner. Each tool pairs a JSON-schema
// definition (what Opus sees) with a TypeScript handler (what actually runs). The
// surface mirrors the MCP server in src/mcp-server/index.ts — the scaffold stays in
// the repo so this could be externalized over MCP-over-HTTP later, but for MVP we
// call directly.

import { sql } from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { asObject } from "@/lib/json";
import { computeScore, persistScore } from "@/lib/scoring";

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "query_project_state",
    description:
      "Return the active project snapshot: committed vs. spent budget by category, current market value per commodity (portfolio view), latest composite health score with components, the most recent events, open anomalies, and supplier directory. Call this first whenever you need context.",
    input_schema: {
      type: "object",
      properties: {
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["budget", "portfolio", "health", "events", "anomalies", "suppliers"],
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
      "Attach structured enrichment to the current event. Use this to store what you parsed from a voice note or photo (supplier, amount, items, category, counterparty for inventory, movement_type). The enrichment is merged into events.payload.",
    input_schema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: {
          type: "string",
          description: "One-line Spanish summary of what happened.",
        },
        movement_type: {
          type: "string",
          enum: ["delivery_in", "stock_in", "stock_out", "incident", "progress_report", "adjustment", "other"],
          description: "What kind of real-world movement this event represents.",
        },
        supplier: { type: "string", description: "Supplier name if identified." },
        counterparty: {
          type: "string",
          description: "Customer or destination counterparty (inventory mode).",
        },
        amount_gtq: {
          type: "number",
          description: "Total amount on the receipt in GTQ, if present.",
        },
        category: {
          type: "string",
          description:
            "Category this event touches (cemento, acero, mamposteria, agregados, acabados, mano_obra, otros).",
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
          description: "Line items on a receipt or materials moved.",
        },
      },
    },
  },
  {
    name: "flag_anomaly",
    description:
      "Raise an anomaly for the PM or lender. Only use when something warrants attention. For construction: category overspend, duplicate delivery within a few hours, off-hours activity (before 06:00 or after 20:00 local), supplier not in directory, receipt that doesn't match any budget line. For inventory: shrinkage (stock_out without buyer), slow-mover (no movement in 30d), price shock (market drift > 10% in a day), under-collateralization, supplier not in directory.",
    input_schema: {
      type: "object",
      required: ["kind", "severity", "message"],
      properties: {
        kind: {
          type: "string",
          description:
            "Short machine label. Construction: overspend | duplicate_delivery | off_hours | unknown_supplier | unbudgeted. Inventory: shrinkage | slow_mover | price_shock | under_collateral | unknown_counterparty.",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
        message: {
          type: "string",
          description: "One-sentence Spanish explanation suitable for the PM or lender.",
        },
      },
    },
  },
  {
    name: "recompute_score",
    description:
      "Recompute and persist the project's composite health score (0-100) across four components: budget_variance, market_drift, anomaly_rate, activity_freshness. Call this after you've logged material enrichment or flagged an anomaly so the dashboard reflects the updated state.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "reply_in_chat",
    description:
      "Send a short Spanish message back to the Telegram chat. Use sparingly — only when the operator needs immediate feedback (e.g. you flagged a serious anomaly and want to confirm). The webhook already sends 'recibido ✓' automatically; don't duplicate that.",
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
  projectMode: "construction" | "inventory" | "tiendita";
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
    case "recompute_score":
      return { ok: true, result: await recomputeScore(ctx) };
    case "reply_in_chat":
      return { ok: true, result: await replyInChat(input, ctx) };
    default:
      return { ok: false, result: `unknown tool: ${name}` };
  }
}

async function queryProjectState(input: Record<string, unknown>, ctx: ToolContext) {
  const defaultSections = ["budget", "portfolio", "health", "events", "anomalies", "suppliers"];
  const requested = Array.isArray(input.include) && input.include.length
    ? (input.include as string[])
    : defaultSections;
  const include = new Set(requested);
  const limit = Math.min(50, Math.max(1, Number(input.limit ?? 10)));

  const out: Record<string, unknown> = { mode: ctx.projectMode };

  if (include.has("budget")) {
    const rows = await sql`
      select category,
             coalesce(sum(qty * unit_cost_gtq), 0)::numeric as committed_gtq,
             coalesce(sum(spent_gtq), 0)::numeric as spent_gtq
      from budget_items
      where project_id = ${ctx.projectId}
      group by category
      order by coalesce(sum(qty * unit_cost_gtq), 0) desc
    `;
    out.budget = rows.map((r) => ({
      category: r.category,
      committed_gtq: Number(r.committed_gtq),
      spent_gtq: Number(r.spent_gtq),
    }));
  }

  if (include.has("portfolio")) {
    const rows = await sql`
      select bi.category,
             mf.commodity_key,
             mf.display_name,
             bi.qty,
             bi.unit_cost_gtq,
             bi.market_unit_cost_gtq,
             bi.market_updated_at
      from budget_items bi
      left join market_feeds mf on mf.id = bi.commodity_id
      where bi.project_id = ${ctx.projectId} and bi.commodity_id is not null
      order by bi.category, bi.description
    `;
    out.portfolio = rows.map((r) => {
      const qty = Number(r.qty);
      const cost = Number(r.unit_cost_gtq);
      const market = Number(r.market_unit_cost_gtq ?? r.unit_cost_gtq);
      const committedValue = qty * cost;
      const marketValue = qty * market;
      return {
        category: r.category,
        commodity_key: r.commodity_key,
        display_name: r.display_name,
        qty,
        cost_basis_gtq: cost,
        market_unit_cost_gtq: market,
        committed_value_gtq: committedValue,
        market_value_gtq: marketValue,
        drift_gtq: marketValue - committedValue,
        drift_pct: cost > 0 ? (market - cost) / cost : 0,
        market_updated_at: r.market_updated_at,
      };
    });
  }

  if (include.has("health")) {
    const rows = await sql<
      Array<{ score: number; components: unknown; computed_at: Date | string; computed_by: string }>
    >`
      select score, components, computed_at, computed_by
      from project_scores
      where project_id = ${ctx.projectId}
      order by computed_at desc
      limit 1
    `;
    const row = rows[0];
    if (row) {
      out.health = {
        score: row.score,
        components:
          typeof row.components === "string" ? JSON.parse(row.components) : row.components,
        computed_at: row.computed_at,
        computed_by: row.computed_by,
      };
    }
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

async function recomputeScore(ctx: ToolContext) {
  const result = await computeScore(ctx.projectId);
  const row = await persistScore(ctx.projectId, result, "agent");
  return {
    score_id: row.id,
    score: result.score,
    components: result.components,
    evidence: result.evidence,
  };
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
