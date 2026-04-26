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

const ONBOARD_PROMPT = `Sos el agente de onboarding de CAPA. Tu trabajo no es solo capturar lo que el usuario te dice — es pensar como un consultor de operaciones con experiencia en ERP, SAP y Connected Worker, y ayudarle a armar un sistema de operaciones completo para su situación. La mayoría de las personas saben qué hacen pero no saben cómo sistematizarlo bien. Vos sí sabés.

CAPA sirve para cualquier cosa con rutina: hogares, tienditas, obras, iglesias, encargos, voluntariados, cualquier cosa.

═══ VERTICALES DISPONIBLES ═══
- construction: obras de construcción, capataces, contratistas, proyectos.
- inventory: bodegas B2B, distribuidoras, donde el inventario tiene valor como colateral.
- tiendita: venta al menudeo — tiendas, panaderías, restaurantes, salones, ferreterías, farmacias.
- general: hogares (adultos mayores, niños, mascotas), iglesias, comunidades, clubs, voluntariados, rutinas personales.
- delegacion: ENCARGOS — el dueño describe el trabajo, CAPA crea el checklist, el delegado lo ejecuta desde su celular con fotos y notas como evidencia.

═══ TU MENTALIDAD COMO CONSULTOR ═══

Antes de aprovisionar, pensá en estas dimensiones. No las preguntés todas — elegí las que son relevantes para su contexto y que claramente NO se respondieron en la conversación:

ACCOUNTABILITY Y EVIDENCIA
→ ¿Hay tareas donde se necesita foto o documentación como prueba? (entrega de materiales, estado antes/después, medicamentos dados, productos contados)
→ ¿Alguien tiene que aprobar o revisar el trabajo de otra persona antes de cerrarlo?
→ ¿Hay tareas de seguridad o compliance que NO se pueden saltar nunca?

FLUJOS DE TRABAJO
→ ¿Hay dependencias entre tareas? (no podés X sin antes hacer Y)
→ ¿Hay ventanas de tiempo críticas o SLAs? (si no pasa en N horas, es un problema)
→ ¿Hay escalaciones? (si la tarea no se completa, ¿a quién se avisa?)

EQUIPO Y ROLES
→ ¿Quién ejecuta vs quién supervisa? (una persona sola, o varias con roles distintos)
→ ¿El dueño y el ejecutor son personas diferentes? (→ usá 'delegacion')
→ ¿Hay turnos? (mañana/tarde, días distintos)

TRAZABILIDAD Y REPORTES
→ ¿Necesita historial de quién hizo qué y cuándo? (para rendir cuentas a alguien: banco, jefe, cliente, familiar)
→ ¿Hay terceros que van a querer ver el estado? (proveedor, prestamista, inspector, familiar a distancia)

COSTOS Y RECURSOS
→ ¿Hay materiales o insumos que importa rastrear?
→ ¿Hay un presupuesto o límite de gasto?
→ ¿Hay crédito, fiados, o cobros pendientes de clientes?

═══ TU PROCESO ═══

1. Escuchá la descripción inicial. Si falta info crítica para elegir el vertical o armar el protocolo, preguntá UNA cosa a la vez con 'ask_clarification'. Hacé todas las preguntas que necesitás para llegar a claridad — no hay límite, pero de a una por vez y solo lo que realmente importa.

2. Antes de aprovisionar, asegurate de entender:
   □ Qué tareas son recurrentes vs one-off
   □ Cuáles requieren evidencia (foto, nota)
   □ Si hay más de una persona involucrada
   □ Si hay algo crítico que no se puede olvidar

3. Llamá 'provision_business' con un protocolo BESPOKE. Ejemplos de lo que significa bespoke:
   - Construcción: no solo "comprar cemento" — "Verificar entrega de 50 blocks de Cementos Progreso, contar y fotografiar antes de firmar remisión"
   - Farmacia: no solo "abrir caja" — "Contar efectivo y comparar con cierre del día anterior, foto del conteo"
   - Hogar adulto mayor: no solo "pastilla" — "Dar metformina 500mg con desayuno, anotar si la tomó o rechazó"
   - Encargo limpieza: no solo "limpiar" — "Fotografiar estado inicial del área, limpiar, fotografiar estado final"
   - Iglesia: no solo "servicio" — "Confirmar que el predicador llegó antes de las 9am, si no: llamar a Pastor Mario inmediatamente"

4. Para 'evidence_required' en tareas: usá 'photo' cuando sea una tarea de campo, entrega, inspección, o cualquier cosa donde el dueño querría ver prueba. Usá 'note' para reportes, conteos, observaciones. Usá 'any' si cualquier documentación alcanza.

5. Para 'initial_items':
   - Tiendita/bodega/construcción: productos/materiales reales con cantidad y costo
   - General/delegacion: recursos del contexto (medicamentos, materiales, etc), costo Q0 si no aplica

6. Cuando tenés suficiente, aprovisioná y respondé solo: "Listo, ya armé todo. Te llevo a tu panel."

═══ REGLAS ═══
- Tono cálido, directo. Voseo. Sin corporativismo ni tecnicismos de ERP.
- Hacé preguntas de a una — nunca hagas lista de preguntas juntas.
- Si la persona dice "sí" o "dale" a algo que sugerís, incluílo.
- No inventés datos. Si no sabés algo, preguntá.
- No uses lenguaje de negocio (factura, proveedor, colateral) en contextos de hogar/comunidad salvo que ellos lo usen primero.`;

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
        vertical: { type: "string", enum: ["construction", "inventory", "tiendita", "general", "delegacion"] },
        name: {
          type: "string",
          description:
            "Nombre de la situación. Ej negocio: 'Tiendita La Esquina'. Ej hogar: 'Casa de la Abuela Lucía'. Ej iglesia: 'Iglesia La Verbena'.",
        },
        owner_name: {
          type: "string",
          description: "Persona principal a cargo. Ej: 'Doña Lucía', 'Pastor Mario', 'Don Beto'.",
        },
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
              cadence: { type: "string", enum: ["daily", "weekly", "monthly", "as_needed", "one_off"] },
              category: { type: "string", description: "Ej: 'cocina', 'cuentas', 'inventario', 'mantenimiento', 'seguridad'." },
              evidence_required: { type: "string", enum: ["photo", "note", "any"], description: "Solo si la tarea requiere evidencia para marcarse hecha. 'photo' = foto obligatoria (ej: 'fotografiá el estado final', 'mandame foto de la entrega'). Omití si no se necesita evidencia." },
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
  attachmentUrl?: string;
  attachmentType?: "image" | "pdf" | "document";
  sessionId?: string;
};

export type OnboardTurnOutput = {
  reply: string;
  done: boolean;
  redirect?: string;
  business?: { id: string; slug: string; vertical: string; name: string };
  toolsCalled: Array<{ name: string; input: unknown }>;
  thinking?: string;
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

async function provisionBusiness(input: Record<string, unknown>, sessionId?: string): Promise<OnboardTurnOutput["business"]> {
  const vertical = String(input.vertical ?? "general") as "construction" | "inventory" | "tiendita" | "general" | "delegacion";
  const name = String(input.name ?? "Negocio sin nombre");
  const ownerName = input.owner_name ? String(input.owner_name) : null;
  const ownerEmail = input.owner_email ? String(input.owner_email) : null;
  const chatId = input.telegram_chat_id ? String(input.telegram_chat_id) : null;
  const description = input.description ? String(input.description) : null;
  const items = Array.isArray(input.initial_items) ? (input.initial_items as Array<Record<string, unknown>>) : [];

  const slug = await uniqueSlug(slugify(name));

  const [biz] = await sql<Array<{ id: string }>>`
    insert into businesses (slug, name, vertical, owner_name, owner_email, telegram_chat_id, description, session_id)
    values (${slug}, ${name}, ${vertical}, ${ownerName}, ${ownerEmail}, ${chatId}, ${description}, ${sessionId ?? null})
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
    const evidenceRequired = t.evidence_required ? String(t.evidence_required) : null;
    await sql`
      insert into tasks (business_id, title, detail, cadence, category, evidence_required)
      values (${biz.id}, ${title}, ${detail}, ${cadence}, ${category}, ${evidenceRequired})
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

  // Seed modules based on vertical — only suggest what's actually relevant.
  const hasMoney = vertical === "tiendita" || vertical === "construction" || vertical === "inventory";
  const hasInventory = vertical === "inventory" || vertical === "construction";

  const moduleRows: Array<[string, string, string]> = [
    [biz.id, "chat",     "enabled"],
    [biz.id, "protocolo","enabled"],
    ...(hasMoney     ? [[biz.id, "cobros",         "suggested"]] as Array<[string,string,string]> : []),
    ...(hasMoney     ? [[biz.id, "clientes",        "suggested"]] as Array<[string,string,string]> : []),
    ...(hasMoney     ? [[biz.id, "ventas_diarias",  "suggested"]] as Array<[string,string,string]> : []),
    ...(hasInventory ? [[biz.id, "valuacion",       "suggested"]] as Array<[string,string,string]> : []),
    ...(hasInventory ? [[biz.id, "lender_view",     "suggested"]] as Array<[string,string,string]> : []),
  ];

  for (const [bid, key, status] of moduleRows) {
    await sql`
      insert into business_modules (business_id, module_key, status, enabled_at, enabled_by)
      values (${bid}, ${key}, ${status}, ${status === "enabled" ? sql`now()` : null}, ${status === "enabled" ? "onboard" : null})
      on conflict (business_id, module_key) do nothing
    `;
  }

  return { id: biz.id, slug, vertical, name };
}

export async function runOnboardTurn(input: OnboardTurnInput): Promise<OnboardTurnOutput> {
  const client = getAnthropic();
  const verticalSummary = listVerticals()
    .map((v) => `${v.vertical} (${v.label})`)
    .join(", ");

  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((m) => ({ role: m.role, content: m.content }) as Anthropic.MessageParam),
    {
      role: "user",
      content: (() => {
        const { attachmentUrl: url, attachmentType: type, message } = input;
        if (!url) return message;
        if (type === "image") return [
          { type: "image" as const, source: { type: "url" as const, url } },
          { type: "text" as const, text: message || "Adjunté una imagen." },
        ];
        if (type === "pdf") return [
          { type: "document" as const, source: { type: "url" as const, url } },
          { type: "text" as const, text: message || "Adjunté un PDF." },
        ];
        // docx/xlsx/csv/txt — pass url as text context, Opus can acknowledge it
        return `${message || "Adjunté un documento."}\n\n[Documento adjunto: ${url}]`;
      })(),
    },
  ];

  const toolsCalled: OnboardTurnOutput["toolsCalled"] = [];
  const thinkingChunks: string[] = [];
  let assistantText = "";
  let business: OnboardTurnOutput["business"] | undefined;

  for (let turn = 0; turn < 4; turn++) {
    const resp = await client.messages.create({
      model: OPUS,
      max_tokens: 8192,
      // Opus 4.7 uses adaptive thinking + an effort knob (not the legacy
      // `enabled + budget_tokens` shape). Cast through unknown because the
      // SDK type defs lag behind the new params.
      ...({
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
      } as unknown as Record<string, never>),
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

    for (const block of resp.content) {
      if ((block as { type: string }).type === "thinking") {
        thinkingChunks.push("[razonamiento extendido — encriptado por Anthropic]");
        break;
      }
    }

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
          business = await provisionBusiness(inputObj, input.sessionId);
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

  const thinking = thinkingChunks.length > 0 ? thinkingChunks.join("\n\n") : undefined;
  if (business) {
    return {
      reply: assistantText || `Listo, creé "${business.name}". Te llevo a tu panel.`,
      done: true,
      redirect: `/dashboard/${business.slug}`,
      business,
      toolsCalled,
      thinking,
    };
  }

  return {
    reply: assistantText || "(sin respuesta)",
    done: false,
    toolsCalled,
    thinking,
  };
}
