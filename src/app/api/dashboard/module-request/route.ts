// Operator describes a need ("quiero llevar control de fiados", "necesito un mapa
// de mis clientes", etc.) and Opus decides:
//   - 'matched'    : it overlaps with an existing module → suggest installing it
//   - 'queued'     : it's a real new need we can't auto-fulfill → log to roadmap
//   - 'in_review'  : ambiguous, agent leaves a clarifying note for the operator
//
// Every request gets persisted in module_requests. Status moves to 'installed'
// when the operator accepts a match.

import type Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { getAnthropic } from "@/lib/agent/anthropic";
import { OPUS } from "@/lib/agent/models";
import { MODULE_CATALOG, setModuleStatus } from "@/lib/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const BodySchema = z.object({
  slug: z.string().min(1).max(80),
  message: z.string().min(2).max(2000),
});

const SYSTEM_PROMPT = `Eres el "router de capacidades" de Capataz. Un operador acaba de pedir una nueva funcionalidad. Tu trabajo es UNA decisión:

1. Si su pedido se solapa con un módulo del catálogo → llamá 'match_existing' con la key. (Ej: "control de fiados" → cobros NO existe; pero "valor del inventario" → valuacion sí.)
2. Si es algo concreto y construible pero NO está en el catálogo → llamá 'queue_for_team' con un summary de 1-2 oraciones de qué es lo que pidió.
3. Si lo que pidió no se entiende o falta contexto → llamá 'ask_clarification' con UNA pregunta corta.

NO prometas nada que no podés cumplir. Sé directo y voseo guatemalteco. Una sola decisión, no expliques de más.`;

type RouterDecision =
  | { kind: "match"; module_key: string; reason: string }
  | { kind: "queue"; summary: string }
  | { kind: "ask"; question: string };

const ROUTER_TOOLS: Anthropic.Tool[] = [
  {
    name: "match_existing",
    description: "El pedido coincide con un módulo del catálogo. Pasá la key.",
    input_schema: {
      type: "object",
      required: ["module_key", "reason"],
      properties: {
        module_key: {
          type: "string",
          enum: ["valuacion", "lender_view", "cobros", "clientes", "ventas_diarias"],
        },
        reason: { type: "string", description: "Por qué este módulo cubre el pedido." },
      },
    },
  },
  {
    name: "queue_for_team",
    description: "El pedido es válido pero no está en el catálogo todavía. Anotá un summary corto.",
    input_schema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: { type: "string", description: "1-2 oraciones describiendo lo pedido." },
      },
    },
  },
  {
    name: "ask_clarification",
    description: "El pedido es ambiguo. UNA pregunta corta para entender mejor.",
    input_schema: {
      type: "object",
      required: ["question"],
      properties: {
        question: { type: "string" },
      },
    },
  },
];

async function decide(message: string, businessName: string): Promise<{ decision: RouterDecision | null; assistantText: string }> {
  const client = getAnthropic();
  const catalogText = MODULE_CATALOG.map(
    (m) => `- ${m.key}${m.baseline ? " (baseline)" : ""}: ${m.one_liner}`,
  ).join("\n");

  const resp = await client.messages.create({
    model: OPUS,
    max_tokens: 1024,
    system: `${SYSTEM_PROMPT}\n\nNegocio: ${businessName}.\n\nCatálogo actual:\n${catalogText}`,
    tools: ROUTER_TOOLS,
    messages: [{ role: "user", content: message }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  for (const block of resp.content) {
    if (block.type !== "tool_use") continue;
    const input = block.input as Record<string, unknown>;
    if (block.name === "match_existing") {
      return {
        decision: {
          kind: "match",
          module_key: String(input.module_key ?? ""),
          reason: String(input.reason ?? ""),
        },
        assistantText: text,
      };
    }
    if (block.name === "queue_for_team") {
      return {
        decision: { kind: "queue", summary: String(input.summary ?? message.slice(0, 200)) },
        assistantText: text,
      };
    }
    if (block.name === "ask_clarification") {
      return {
        decision: { kind: "ask", question: String(input.question ?? "") },
        assistantText: text,
      };
    }
  }
  return { decision: null, assistantText: text };
}

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

  const businessRows = await sql<Array<{ id: string; name: string; owner_name: string | null }>>`
    select id, name, owner_name from businesses where slug = ${parsed.data.slug}
  `;
  if (!businessRows[0]) {
    return NextResponse.json({ ok: false, error: "business not found" }, { status: 404 });
  }
  const biz = businessRows[0];
  const author = biz.owner_name?.trim() || "tú";

  if (!process.env.ANTHROPIC_API_KEY) {
    const [r] = await sql<Array<{ id: string }>>`
      insert into module_requests (business_id, user_message, agent_reply, status, created_by)
      values (${biz.id}, ${parsed.data.message}, 'No hay ANTHROPIC_API_KEY configurado.', 'queued', ${author})
      returning id
    `;
    return NextResponse.json({ ok: true, request_id: r.id, decision: "queued" });
  }

  const { decision, assistantText } = await decide(parsed.data.message, biz.name);

  let status: "matched" | "queued" | "in_review" = "queued";
  let matchedModuleKey: string | null = null;
  let agentReply = assistantText || "Anoté tu solicitud.";

  if (decision?.kind === "match") {
    const cat = MODULE_CATALOG.find((m) => m.key === decision.module_key);
    if (cat && !cat.baseline) {
      status = "matched";
      matchedModuleKey = decision.module_key;
      agentReply = decision.reason || `Eso lo cubre el módulo "${cat.name}". ¿Te lo activo?`;
    }
  } else if (decision?.kind === "queue") {
    status = "queued";
    agentReply = `Anoté tu solicitud para el equipo: "${decision.summary}". Te aviso cuando esté lista.`;
  } else if (decision?.kind === "ask") {
    status = "in_review";
    agentReply = decision.question || agentReply;
  }

  const [requestRow] = await sql<Array<{ id: string }>>`
    insert into module_requests
      (business_id, user_message, agent_reply, status, matched_module_key, created_by)
    values (
      ${biz.id},
      ${parsed.data.message},
      ${agentReply},
      ${status},
      ${matchedModuleKey},
      ${author}
    )
    returning id
  `;

  // If matched, immediately mark the module 'suggested' (operator confirms via dashboard click).
  if (matchedModuleKey) {
    await setModuleStatus(biz.id, matchedModuleKey, "suggested", "request-router");
  }

  return NextResponse.json({
    ok: true,
    request_id: requestRow.id,
    decision: status,
    matched_module_key: matchedModuleKey,
    agent_reply: agentReply,
  });
}
