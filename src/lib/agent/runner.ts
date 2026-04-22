// Real Opus 4.7 agent runner. Given a Telegram-sourced event, the runner:
//   1. Materializes the event as a multimodal Messages API user turn
//        - text → text block
//        - photo → image block (base64)
//        - voice → Spanish transcription via Whisper, then text block
//   2. Calls claude-opus-4-7 with the tool set defined in ./tools.ts
//   3. Loops on tool_use responses: executes each tool, returns tool_result, re-prompts
//   4. Persists the full transcript, tool calls, and final summary into agent_runs
//
// Managed Agents Sessions would be a drop-in upgrade: same prompt + tools, but with
// persistent per-project sessions. Leaving that as TODO(POLISH) — the hackathon
// judging cares more about the output than the transport shape, and this path is
// battle-tested.

import type Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { asObject } from "@/lib/json";
import { downloadFile } from "@/lib/telegram";
import { transcribeSpanish } from "@/lib/transcribe";
import { getAnthropic, OPUS_MODEL } from "./anthropic";
import { CAPATAZ_SYSTEM_PROMPT } from "./prompt";
import { toolDefinitions, runTool, type ToolContext } from "./tools";

export interface AgentInput {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdBy: string | null;
}

export interface AgentOutput {
  status: "ok" | "degraded" | "error";
  summary: string;
  transcription?: { provider: string; text: string; durationMs: number };
  toolsCalled: Array<{ name: string; input: unknown; result: unknown }>;
  stopReason: string | null;
  messageId?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: string;
}

type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
type UserBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: ImageMime; data: string };
    };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function runAgentOnEvent(eventId: string): Promise<AgentOutput> {
  const rows = await sql<
    Array<{
      id: string;
      project_id: string | null;
      type: string;
      payload: unknown;
      created_by: string | null;
      created_at: Date | string;
    }>
  >`
    select id, project_id, type, payload, created_by, created_at
    from events
    where id = ${eventId}
  `;
  const event = rows[0];
  if (!event) throw new Error(`event ${eventId} not found`);
  if (!event.project_id) throw new Error(`event ${eventId} has no project_id`);

  const payload = asObject(event.payload);
  const input: AgentInput = {
    eventId: event.id,
    eventType: event.type,
    payload,
    createdBy: event.created_by,
  };

  const ctx: ToolContext = {
    projectId: event.project_id,
    eventId: event.id,
    chatId: typeof payload.chat_id === "number" || typeof payload.chat_id === "string" ? payload.chat_id : null,
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    const output: AgentOutput = {
      status: "degraded",
      summary: "ANTHROPIC_API_KEY ausente — runner en modo stub.",
      toolsCalled: [],
      stopReason: null,
    };
    await persistRun(eventId, input, output, "degraded");
    return output;
  }

  try {
    const { blocks, transcription } = await buildUserMessage(event.type, payload);

    const metaPrefix: UserBlock = {
      type: "text",
      text: [
        `Evento ${event.id}, tipo: ${event.type}.`,
        `Enviado por ${event.created_by ?? "desconocido"} a las ${formatTs(event.created_at)}.`,
      ].join(" "),
    };

    const userBlocks: UserBlock[] = [metaPrefix, ...blocks];
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userBlocks },
    ];

    const toolsCalled: AgentOutput["toolsCalled"] = [];
    let finalText = "";
    let stopReason: string | null = null;
    let messageId: string | undefined;
    let usage: AgentOutput["usage"];

    const anthropic = getAnthropic();
    for (let turn = 0; turn < 6; turn++) {
      const resp = await anthropic.messages.create({
        model: OPUS_MODEL,
        max_tokens: 1024,
        system: CAPATAZ_SYSTEM_PROMPT,
        tools: toolDefinitions as unknown as Anthropic.Tool[],
        messages,
      });
      messageId = resp.id;
      stopReason = resp.stop_reason;
      usage = { input_tokens: resp.usage?.input_tokens, output_tokens: resp.usage?.output_tokens };

      messages.push({ role: "assistant", content: resp.content });

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const textBlocks = resp.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (textBlocks.length) {
        finalText = textBlocks.map((t) => t.text).join("\n").trim();
      }

      if (resp.stop_reason !== "tool_use" || toolUses.length === 0) break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await runTool(tu.name, tu.input as Record<string, unknown>, ctx);
        toolsCalled.push({ name: tu.name, input: tu.input, result: result.result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result.result).slice(0, 8000),
          is_error: !result.ok,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    const output: AgentOutput = {
      status: "ok",
      summary: finalText || "(sin resumen)",
      transcription,
      toolsCalled,
      stopReason,
      messageId,
      usage,
    };
    await persistRun(eventId, input, output, "ok");
    return output;
  } catch (err) {
    const output: AgentOutput = {
      status: "error",
      summary: "El agente falló — revisar logs.",
      toolsCalled: [],
      stopReason: null,
      error: err instanceof Error ? err.message : String(err),
    };
    await persistRun(eventId, input, output, "error");
    console.error("[agent] run failed", err);
    return output;
  }
}

async function buildUserMessage(
  type: string,
  payload: Record<string, unknown>,
): Promise<{ blocks: UserBlock[]; transcription?: AgentOutput["transcription"] }> {
  if (type === "text_message") {
    const text = typeof payload.text === "string" ? payload.text : "(mensaje vacío)";
    return { blocks: [{ type: "text", text: `Mensaje: "${text}"` }] };
  }

  if (type === "voice_note") {
    const fileId = typeof payload.file_id === "string" ? payload.file_id : null;
    if (!fileId) return { blocks: [{ type: "text", text: "Nota de voz sin file_id." }] };
    const file = await downloadFile(fileId);
    const transcription = await transcribeSpanish(file.buffer, file.mime);
    const text = transcription.text || "(voz inaudible)";
    const duration = typeof payload.duration === "number" ? ` (${payload.duration}s)` : "";
    return {
      blocks: [{ type: "text", text: `Nota de voz${duration}, transcripción: "${text}"` }],
      transcription,
    };
  }

  if (type === "photo") {
    const fileId = typeof payload.file_id === "string" ? payload.file_id : null;
    if (!fileId) return { blocks: [{ type: "text", text: "Foto sin file_id." }] };
    const file = await downloadFile(fileId);
    if (file.buffer.length > MAX_IMAGE_BYTES) {
      return {
        blocks: [
          { type: "text", text: `Foto demasiado grande (${file.buffer.length} bytes) para adjuntar.` },
        ],
      };
    }
    const caption = typeof payload.caption === "string" ? payload.caption : "";
    const blocks: UserBlock[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: normalizeImageMime(file.mime),
          data: file.buffer.toString("base64"),
        },
      },
      {
        type: "text",
        text: caption ? `Caption adjuntado: "${caption}"` : "Foto enviada sin caption.",
      },
    ];
    return { blocks };
  }

  return {
    blocks: [{ type: "text", text: `Evento tipo '${type}' no reconocido.` }],
  };
}

function normalizeImageMime(mime: string): ImageMime {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("webp")) return "image/webp";
  if (m.includes("gif")) return "image/gif";
  return "image/jpeg";
}

function formatTs(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

async function persistRun(
  eventId: string,
  input: AgentInput,
  output: AgentOutput,
  status: string,
): Promise<void> {
  await sql`
    insert into agent_runs (event_id, status, input, output, started_at, ended_at)
    values (
      ${eventId},
      ${status},
      ${JSON.stringify(input)}::jsonb,
      ${JSON.stringify(output)}::jsonb,
      now(),
      now()
    )
  `;
}
