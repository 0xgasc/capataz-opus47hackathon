// Onboarding agent — runs Opus 4.7 in a tight tool-use loop:
//   - ask_clarification: agent needs more from user, returns a question
//   - provision_business: agent has enough to create a tenant. Inserts business + project +
//     starter budget items + bumps a baseline score, and returns the new dashboard slug.
//
// Designed as a stateless POST per turn so the client can keep its own message history.

import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { getAnthropic } from "./anthropic";
import { OPUS } from "./models";
import { listVerticals } from "./verticals";

const ONBOARD_PROMPT = `Eres el agente de onboarding de Capataz. Tu trabajo es escuchar a alguien describir su negocio en español (informal, voseo, chapín si vienen de Guatemala) y aprovisionarles un agente operacional bespoke.

Verticales disponibles HOY (no inventés otras):
- construction: obras y proyectos de construcción, gerentes de proyecto, capataces, contratistas.
- inventory: SOLO bodegas mayoristas / distribuidoras B2B donde el inventario es colateral de un préstamo. NO uses 'inventory' para retail.
- tiendita: cualquier negocio que vende al menudeo a clientes finales — tiendas de barrio, panaderías, pizzerías, restaurantes pequeños, salones, ferreterías chicas, farmacias de barrio. Si dudás entre 'inventory' y 'tiendita' para un negocio que vende al público, escogé 'tiendita'.

Tu proceso:
1. Si el usuario no ha descrito su negocio o falta información clave (vertical aproximado, nombre del negocio, dueño/operador, ~5 productos o ítems iniciales), llama 'ask_clarification' con UNA pregunta corta y específica.
2. Una vez tengas: (a) el vertical, (b) un nombre, (c) el operador, (d) 4-8 ítems iniciales con cantidad y costo aproximado, llama 'provision_business' con TODO incluyendo un protocolo bespoke (initial_tasks).
3. El protocolo debe ser ESPECÍFICO al rubro. Ejemplos de cómo deben verse las tareas:
   - Pizzería: "Preparar masa del día (antes de 9am)", "Verificar temperatura del horno (220°C antes del primer pedido)", "Inventario de toppings (mozzarella, pepperoni)", "Limpieza profunda del horno (domingo)".
   - Panadería: "Encender el horno a las 4am", "Cuadrar la caja de la primera tanda", "Pedido de harina al proveedor (martes)".
   - Salón de belleza: "Confirmar citas del día por WhatsApp", "Inventario de tintes y químicos", "Limpieza de herramientas (alcohol al 70%)".
   - Ferretería: "Conteo cíclico de tornillería", "Cobrar facturas de contratistas pendientes".
   NO copies el protocolo de otra industria. Pensá en este negocio en particular.
4. Después de aprovisionar, escribe UN mensaje final corto: "Listo, ya creé tu negocio. Te llevo a tu panel." y nada más.

Reglas:
- Si el usuario es vago, no inventés datos. Pregunta.
- Si el usuario menciona un vertical que no existe, sugierí el más cercano.
- Tono cálido, breve. Voseo guatemalteco. Sin corporativismo.
- Máximo 3 ask_clarification antes de aprovisionar con lo que tengas y notas explícitas en initial_items.descripcion sobre lo que faltó.`;

const ONBOARD_TOOLS: Anthropic.Tool[] = [
  {
    name: "ask_clarification",
    description: "Hacele al usuario UNA pregunta corta para obtener información que falta para aprovisionar el negocio.",
    input_schema: {
      type: "object",
      required: ["question"],
      properties: {
        question: { type: "string", description: "La pregunta en español, voseo." },
      },
    },
  },
  {
    name: "provision_business",
    description: "Crea el negocio + proyecto + items iniciales + protocolo (tareas recurrentes) en la base de datos. Llamar SOLO cuando tenés la información necesaria. El protocolo es BESPOKE — generalo basado en lo que sabés del rubro específico (no copies el de otra industria).",
    input_schema: {
      type: "object",
      required: ["vertical", "name", "owner_name", "initial_items", "initial_tasks"],
      properties: {
        vertical: { type: "string", enum: ["construction", "inventory", "tiendita"] },
        name: { type: "string", description: "Nombre comercial del negocio. Ej: 'Tiendita La Esquina'." },
        owner_name: { type: "string", description: "Nombre del operador. Ej: 'Doña Lucía'." },
        owner_email: { type: "string", description: "Opcional. Email del dueño." },
        telegram_chat_id: { type: "string", description: "Opcional. ID de chat de Telegram." },
        description: { type: "string", description: "Una oración describiendo el negocio." },
        initial_items: {
          type: "array",
          minItems: 1,
          description: "Productos / materiales / inventario inicial. Lo que vende, fabrica o tiene en bodega.",
          items: {
            type: "object",
            required: ["description", "qty", "unit", "unit_cost_gtq"],
            properties: {
              category: { type: "string" },
              description: { type: "string" },
              qty: { type: "number" },
              unit: { type: "string" },
              unit_cost_gtq: { type: "number" },
            },
          },
        },
        initial_tasks: {
          type: "array",
          minItems: 4,
          maxItems: 10,
          description: "Protocolo BESPOKE para este negocio: 4-10 tareas recurrentes específicas del rubro. Una pizzería tiene tareas DIFERENTES a una panadería o una ferretería. Pensá: ¿qué hace este operador todos los días, semanas, meses? ¿Qué pasaría si se le olvida? Sé concreto con cantidades, horas, días.",
          items: {
            type: "object",
            required: ["title", "cadence"],
            properties: {
              title: { type: "string", description: "Título corto en español. Ej: 'Preparar masa del día'." },
              detail: { type: "string", description: "1-2 oraciones específicas: cuándo, cuánto, cómo." },
              cadence: { type: "string", enum: ["daily", "weekly", "monthly", "as_needed"] },
              category: { type: "string", description: "Ej: 'cocina', 'cuentas', 'inventario', 'mantenimiento', 'seguridad'." },
            },
          },
        },
      },
    },
  },
];

export type OnboardTurnInput = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
};

export type OnboardTurnOutput = {
  reply: string;
  done: boolean;
  redirect?: string;
  business?: { id: string; slug: string; vertical: string; name: string };
  toolsCalled: Array<{ name: string; input: unknown }>;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || `negocio-${Date.now().toString(36)}`;
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let i = 1;
  while (true) {
    const existing = await sql`select id from businesses where slug = ${candidate}`;
    if (existing.length === 0) return candidate;
    i++;
    candidate = `${base}-${i}`;
  }
}

async function provisionBusiness(input: Record<string, unknown>): Promise<OnboardTurnOutput["business"]> {
  const vertical = String(input.vertical ?? "tiendita") as "construction" | "inventory" | "tiendita";
  const name = String(input.name ?? "Negocio sin nombre");
  const ownerName = input.owner_name ? String(input.owner_name) : null;
  const ownerEmail = input.owner_email ? String(input.owner_email) : null;
  const chatId = input.telegram_chat_id ? String(input.telegram_chat_id) : null;
  const description = input.description ? String(input.description) : null;
  const items = Array.isArray(input.initial_items) ? (input.initial_items as Array<Record<string, unknown>>) : [];

  const slug = await uniqueSlug(slugify(name));

  const [biz] = await sql<Array<{ id: string }>>`
    insert into businesses (slug, name, vertical, owner_name, owner_email, telegram_chat_id, description)
    values (${slug}, ${name}, ${vertical}, ${ownerName}, ${ownerEmail}, ${chatId}, ${description})
    returning id
  `;

  const totalBudget = items.reduce((acc, it) => {
    const qty = Number(it.qty ?? 0);
    const cost = Number(it.unit_cost_gtq ?? 0);
    return acc + qty * cost;
  }, 0);

  const [proj] = await sql<Array<{ id: string }>>`
    insert into projects (name, client, total_budget_gtq, start_date, mode, business_id)
    values (
      ${name + " — operación"},
      ${ownerName},
      ${totalBudget || 0},
      current_date,
      ${vertical},
      ${biz.id}
    )
    returning id
  `;

  for (const it of items) {
    const category = String(it.category ?? "otros");
    const description = String(it.description ?? "");
    const qty = Number(it.qty ?? 0);
    const unit = String(it.unit ?? "unidad");
    const unitCost = Number(it.unit_cost_gtq ?? 0);
    if (!description) continue;
    await sql`
      insert into budget_items (project_id, category, description, qty, unit, unit_cost_gtq)
      values (${proj.id}, ${category}, ${description}, ${qty}, ${unit}, ${unitCost})
    `;
  }

  const tasks = Array.isArray(input.initial_tasks)
    ? (input.initial_tasks as Array<Record<string, unknown>>)
    : [];
  for (const t of tasks) {
    const title = String(t.title ?? "").trim();
    if (!title) continue;
    const detail = t.detail ? String(t.detail) : null;
    const cadence = String(t.cadence ?? "as_needed");
    const category = t.category ? String(t.category) : null;
    await sql`
      insert into tasks (business_id, title, detail, cadence, category)
      values (${biz.id}, ${title}, ${detail}, ${cadence}, ${category})
    `;
  }

  await sql`
    insert into project_scores (project_id, score, components, computed_by)
    values (
      ${proj.id},
      80,
      '{"budget_variance": 25, "market_drift": 25, "anomaly_rate": 25, "activity_freshness": 5}'::jsonb,
      'onboard'
    )
  `;

  return { id: biz.id, slug, vertical, name };
}

export async function runOnboardTurn(input: OnboardTurnInput): Promise<OnboardTurnOutput> {
  const client = getAnthropic();
  const verticalSummary = listVerticals()
    .map((v) => `${v.vertical} (${v.label})`)
    .join(", ");

  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    { role: "user", content: input.message },
  ];

  const toolsCalled: OnboardTurnOutput["toolsCalled"] = [];
  let assistantText = "";
  let business: OnboardTurnOutput["business"] | undefined;

  for (let turn = 0; turn < 4; turn++) {
    const resp = await client.messages.create({
      model: OPUS,
      max_tokens: 4096,
      system: ONBOARD_PROMPT + `\n\nVerticales: ${verticalSummary}.`,
      tools: ONBOARD_TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: resp.content });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) assistantText = text;

    if (resp.stop_reason !== "tool_use") break;

    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const inputObj = tu.input as Record<string, unknown>;
      toolsCalled.push({ name: tu.name, input: inputObj });
      if (tu.name === "ask_clarification") {
        // Surface the question as the assistant's reply and stop.
        const q = String(inputObj.question ?? "").trim();
        if (q) assistantText = q;
        return { reply: assistantText, done: false, toolsCalled };
      }
      if (tu.name === "provision_business") {
        try {
          business = await provisionBusiness(inputObj);
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ ok: true, slug: business?.slug }),
          });
        } catch (err) {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            is_error: true,
          });
        }
      } else {
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({ error: "unknown tool" }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  if (business) {
    return {
      reply: assistantText || `Listo, creé "${business.name}". Te llevo a tu panel.`,
      done: true,
      redirect: `/dashboard/${business.slug}`,
      business,
      toolsCalled,
    };
  }

  return {
    reply: assistantText || "(sin respuesta)",
    done: false,
    toolsCalled,
  };
}
