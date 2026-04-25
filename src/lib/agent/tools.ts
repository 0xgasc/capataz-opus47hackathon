// Real tool implementations used by the Opus 4.7 runner. Each tool pairs a JSON-schema
// definition (what Opus sees) with a TypeScript handler (what actually runs). The
// surface mirrors the MCP server in src/mcp-server/index.ts — the scaffold stays in
// the repo so this could be externalized over MCP-over-HTTP later, but for MVP we
// call directly.

import { sql } from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { asObject } from "@/lib/json";
import { computeScore, persistScore } from "@/lib/scoring";
import { MODULE_CATALOG, modulesForBusiness, setModuleStatus } from "@/lib/modules";

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
    name: "list_tasks",
    description:
      "Lee el protocolo del negocio: tareas recurrentes y pendientes con cadencia (daily, weekly, monthly, as_needed). Llamala si necesitas saber qué tiene pendiente el operador o si el evento sugiere completar una tarea existente.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "in_progress", "done", "snoozed", "any"] },
      },
    },
  },
  {
    name: "complete_task",
    description:
      "Marca una tarea como completada (status='done', last_completed_at=now). Usá cuando el operador menciona haber hecho algo del protocolo (ej: 'ya repuse los huevos' → completar 'Revisar stock de huevos').",
    input_schema: {
      type: "object",
      required: ["task_id"],
      properties: {
        task_id: { type: "string" },
        note: { type: "string", description: "Nota opcional de qué se completó." },
      },
    },
  },
  {
    name: "upsert_task",
    description:
      "Agrega o actualiza una tarea del protocolo. Usá si el operador pide algo nuevo recurrente ('recordame los lunes…') o si querés sugerir una tarea nueva basada en el evento.",
    input_schema: {
      type: "object",
      required: ["title", "cadence"],
      properties: {
        task_id: { type: "string", description: "Si existe, actualiza; si omitís, crea nueva." },
        title: { type: "string" },
        detail: { type: "string" },
        cadence: { type: "string", enum: ["daily", "weekly", "monthly", "as_needed", "one_off"] },
        category: { type: "string" },
        due_at: { type: "string", description: "ISO timestamp opcional para tareas one_off." },
      },
    },
  },
  {
    name: "record_credit_change",
    description:
      "Anotá un cargo o pago en el ledger de fiados. Usá esto cuando el operador menciona ventas a crédito ('Don Chepe se llevó 2 cervezas que paga viernes') o cobros ('me pagó Doña Lucía Q150 de lo que debía'). Usá amount_gtq positivo para un cargo (cliente debe más), negativo para un pago (cliente debe menos). Solo usá este tool si el módulo 'cobros' está activado en el negocio — sino sugerilo primero con suggest_module.",
    input_schema: {
      type: "object",
      required: ["customer_name", "kind", "amount_gtq"],
      properties: {
        customer_name: { type: "string", description: "Nombre del cliente. Ej: 'Don Chepe'." },
        kind: { type: "string", enum: ["charge", "payment", "adjustment"] },
        amount_gtq: { type: "number", description: "Cargo positivo, pago positivo (signo lo deduce el kind)." },
        note: { type: "string", description: "Detalle corto. Ej: '2 cervezas a crédito'." },
      },
    },
  },
  {
    name: "list_credits",
    description:
      "Listá todos los clientes con saldo en fiado. Útil para responder '¿quién me debe más?' o cuando el operador pregunta el ledger.",
    input_schema: {
      type: "object",
      properties: {
        only_with_balance: {
          type: "boolean",
          description: "Si true, solo trae cuentas con saldo > 0. Default true.",
        },
      },
    },
  },
  {
    name: "list_modules",
    description:
      "Lee qué módulos tiene activos / sugeridos el negocio. Llamala antes de sugerir uno nuevo, para no duplicar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "suggest_module",
    description:
      "Sugiere activar un módulo opcional (valuacion, lender_view, etc.). Usá esto cuando el operador menciona algo que ese módulo resolvería — ej: pregunta por costos → suggest_module('valuacion'). NO actives el módulo, solo lo dejás 'suggested'; el usuario tiene que aceptar.",
    input_schema: {
      type: "object",
      required: ["module_key", "reason"],
      properties: {
        module_key: {
          type: "string",
          enum: ["valuacion", "lender_view", "cobros", "clientes", "ventas_diarias"],
        },
        reason: {
          type: "string",
          description: "Una oración explicando POR QUÉ ahora.",
        },
      },
    },
  },
  {
    name: "install_module",
    description:
      "Activa un módulo opcional. SOLO usá esto si el operador dijo claramente que sí (ej: 'sí, activálo', 'dale', 'sí por favor'). Si la intención no es clara, usá suggest_module.",
    input_schema: {
      type: "object",
      required: ["module_key"],
      properties: {
        module_key: {
          type: "string",
          enum: ["valuacion", "lender_view", "cobros", "clientes", "ventas_diarias"],
        },
      },
    },
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
  businessId: string | null;
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
    case "list_modules":
      return { ok: true, result: await listModulesTool(ctx) };
    case "suggest_module":
      return { ok: true, result: await suggestModuleTool(input, ctx) };
    case "install_module":
      return { ok: true, result: await installModuleTool(input, ctx) };
    case "record_credit_change":
      return { ok: true, result: await recordCreditChange(input, ctx) };
    case "list_credits":
      return { ok: true, result: await listCredits(input, ctx) };
    case "list_tasks":
      return { ok: true, result: await listTasks(input, ctx) };
    case "complete_task":
      return { ok: true, result: await completeTask(input, ctx) };
    case "upsert_task":
      return { ok: true, result: await upsertTask(input, ctx) };
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

async function listTasks(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.businessId) return { tasks: [], note: "no business linked" };
  const status = String(input.status ?? "pending");
  const rows =
    status === "any"
      ? await sql`select id, title, detail, cadence, category, status, last_completed_at, due_at from tasks where business_id = ${ctx.businessId} order by status, cadence, title`
      : await sql`select id, title, detail, cadence, category, status, last_completed_at, due_at from tasks where business_id = ${ctx.businessId} and status = ${status} order by cadence, title`;
  return { tasks: rows, count: rows.length };
}

async function completeTask(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.businessId) return { ok: false, error: "no business linked" };
  const taskId = String(input.task_id ?? "");
  if (!taskId) return { ok: false, error: "task_id required" };
  const rows = await sql<Array<{ id: string; title: string }>>`
    update tasks
    set status = 'done', last_completed_at = now(), updated_at = now()
    where id = ${taskId} and business_id = ${ctx.businessId}
    returning id, title
  `;
  return rows[0] ? { completed: rows[0] } : { ok: false, error: "task not found" };
}

async function upsertTask(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.businessId) return { ok: false, error: "no business linked" };
  const taskId = input.task_id ? String(input.task_id) : null;
  const title = String(input.title ?? "");
  const cadence = String(input.cadence ?? "as_needed");
  const detail = input.detail ? String(input.detail) : null;
  const category = input.category ? String(input.category) : null;
  const dueAt = input.due_at ? String(input.due_at) : null;
  if (!title) return { ok: false, error: "title required" };
  if (taskId) {
    const rows = await sql<Array<{ id: string }>>`
      update tasks
      set title = ${title}, detail = ${detail}, cadence = ${cadence},
          category = ${category}, due_at = ${dueAt}, updated_at = now()
      where id = ${taskId} and business_id = ${ctx.businessId}
      returning id
    `;
    return rows[0] ? { updated: rows[0].id } : { ok: false, error: "task not found" };
  }
  const rows = await sql<Array<{ id: string }>>`
    insert into tasks (business_id, title, detail, cadence, category, due_at)
    values (${ctx.businessId}, ${title}, ${detail}, ${cadence}, ${category}, ${dueAt})
    returning id
  `;
  return { created: rows[0].id };
}

async function listModulesTool(ctx: ToolContext) {
  if (!ctx.businessId) return { modules: [], note: "no business linked" };
  const map = await modulesForBusiness(ctx.businessId);
  return {
    catalog: MODULE_CATALOG.map((m) => ({
      key: m.key,
      name: m.name,
      one_liner: m.one_liner,
      pitch: m.pitch,
      baseline: m.baseline,
      status: map.get(m.key) ?? (m.baseline ? "enabled" : "suggested"),
    })),
  };
}

async function suggestModuleTool(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.businessId) return { ok: false, error: "no business linked" };
  const key = String(input.module_key ?? "");
  const reason = String(input.reason ?? "");
  const exists = MODULE_CATALOG.find((m) => m.key === key);
  if (!exists || exists.baseline) return { ok: false, error: "invalid module key" };
  await setModuleStatus(ctx.businessId, key, "suggested", "agent");
  return { ok: true, suggested: key, reason };
}

async function installModuleTool(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.businessId) return { ok: false, error: "no business linked" };
  const key = String(input.module_key ?? "");
  const exists = MODULE_CATALOG.find((m) => m.key === key);
  if (!exists || exists.baseline) return { ok: false, error: "invalid module key" };
  await setModuleStatus(ctx.businessId, key, "enabled", "agent");
  return { ok: true, enabled: key };
}

async function recordCreditChange(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.businessId) return { ok: false, error: "no business linked" };
  const customer = String(input.customer_name ?? "").trim();
  if (!customer) return { ok: false, error: "customer_name required" };
  const kind = (String(input.kind ?? "charge") as "charge" | "payment" | "adjustment");
  const rawAmount = Number(input.amount_gtq ?? 0);
  if (!Number.isFinite(rawAmount) || rawAmount === 0) {
    return { ok: false, error: "amount_gtq required and non-zero" };
  }
  // Normalize sign: charge & adjustment use positive delta; payment subtracts.
  const delta = kind === "payment" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const note = input.note ? String(input.note) : null;

  // Upsert account.
  const accountRows = await sql<Array<{ id: string }>>`
    insert into credit_accounts (business_id, customer_name, balance_gtq, last_event_at, updated_at)
    values (${ctx.businessId}, ${customer}, ${delta}, now(), now())
    on conflict (business_id, customer_name)
    do update set
      balance_gtq = credit_accounts.balance_gtq + ${delta},
      last_event_at = now(),
      updated_at = now()
    returning id
  `;
  const accountId = accountRows[0].id;

  await sql`
    insert into credit_ledger (account_id, business_id, kind, amount_gtq, note, event_id)
    values (${accountId}, ${ctx.businessId}, ${kind}, ${Math.abs(rawAmount)}, ${note}, ${ctx.eventId})
  `;

  const [updated] = await sql<Array<{ balance_gtq: string }>>`
    select balance_gtq from credit_accounts where id = ${accountId}
  `;
  return {
    customer,
    kind,
    delta_gtq: delta,
    new_balance_gtq: Number(updated.balance_gtq),
  };
}

async function listCredits(input: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.businessId) return { credits: [] };
  const onlyWithBalance = input.only_with_balance === undefined ? true : Boolean(input.only_with_balance);
  const rows = onlyWithBalance
    ? await sql`
        select customer_name, balance_gtq, last_event_at, notes
        from credit_accounts
        where business_id = ${ctx.businessId} and balance_gtq > 0
        order by balance_gtq desc
      `
    : await sql`
        select customer_name, balance_gtq, last_event_at, notes
        from credit_accounts
        where business_id = ${ctx.businessId}
        order by balance_gtq desc
      `;
  return {
    credits: rows.map((r) => ({
      customer: r.customer_name,
      balance_gtq: Number(r.balance_gtq),
      last_event_at: r.last_event_at,
      notes: r.notes,
    })),
    total_owed: rows.reduce((acc, r) => acc + Number(r.balance_gtq), 0),
    customer_count: rows.length,
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
