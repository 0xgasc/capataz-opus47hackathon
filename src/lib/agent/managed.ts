// Capataz agent runner — Claude Managed Agents Sessions path.
//
// This is the MVP-7 stretch deliverable. It replaces the Messages+tool_use loop
// with a proper Managed Agents Session (beta: managed-agents-2026-04-01):
//
//   1. Lazily create one Environment (default cloud config) — cached per-process.
//   2. Lazily create one Agent per mode (construction / inventory) — cached per-process.
//      The agent owns the system prompt + custom-tool definitions server-side.
//   3. Per event: open a fresh Session, send a user.message event, stream the
//      agent's session events.
//   4. For every `agent.custom_tool_use` event, run our local handler and send
//      back a `user.custom_tool_result`.
//   5. Terminate when the session reaches `session.status_idle` with
//      `stop_reason.type === 'end_turn'`, or on `session.status_terminated`.
//
// Dispatched via USE_MANAGED_AGENTS=true env var; otherwise the Messages+tools
// runner still wins. Falls back on any failure so the demo path stays bulletproof.

import { sql } from "@/lib/db";
import { asObject } from "@/lib/json";
import { downloadFile } from "@/lib/telegram";
import { transcribeSpanish } from "@/lib/transcribe";
import { getAnthropic, OPUS_MODEL } from "./anthropic";
import { promptForMode } from "./prompt";
import { toolDefinitions, runTool, type ToolContext } from "./tools";
import type { AgentInput, AgentOutput } from "./runner";

const MANAGED_BETA = "managed-agents-2026-04-01";
const MAX_TURNS = 8;

let environmentIdPromise: Promise<string> | null = null;
const agentIdByMode = new Map<string, Promise<string>>();

async function ensureEnvironment(): Promise<string> {
  if (!environmentIdPromise) {
    environmentIdPromise = (async () => {
      const client = getAnthropic();
      const env = await client.beta.environments.create(
        {
          name: "capataz-default",
          description: "Capataz agent session container (cloud default)",
          betas: [MANAGED_BETA],
        },
      );
      return env.id;
    })().catch((err) => {
      environmentIdPromise = null;
      throw err;
    });
  }
  return environmentIdPromise;
}

async function ensureAgentForMode(mode: "construction" | "inventory"): Promise<string> {
  const existing = agentIdByMode.get(mode);
  if (existing) return existing;
  const promise = (async () => {
    const client = getAnthropic();
    const agent = await client.beta.agents.create(
      {
        name: `capataz-${mode}`,
        description: `Capataz ${mode} agent — chapín operator, bilingual dashboard, composite health score.`,
        model: OPUS_MODEL,
        system: promptForMode(mode),
        tools: toolDefinitions.map((t) => ({
          type: "custom" as const,
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as {
            type: "object";
            properties?: Record<string, unknown>;
            required?: string[];
          },
        })),
        betas: [MANAGED_BETA],
      },
    );
    return agent.id;
  })().catch((err) => {
    agentIdByMode.delete(mode);
    throw err;
  });
  agentIdByMode.set(mode, promise);
  return promise;
}

type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
type UserContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: ImageMime; data: string };
    };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function buildUserMessage(
  type: string,
  payload: Record<string, unknown>,
): Promise<{ blocks: UserContentBlock[]; transcription?: AgentOutput["transcription"] }> {
  if (type === "text_message") {
    const text = typeof payload.text === "string" ? payload.text : "(mensaje vacío)";
    return { blocks: [{ type: "text", text: `Mensaje: "${text}"` }] };
  }

  if (type === "voice_note") {
    const fileId = typeof payload.file_id === "string" ? payload.file_id : null;
    if (!fileId) return { blocks: [{ type: "text", text: "Nota de voz sin file_id." }] };
    const file = await downloadFile(fileId);
    const transcription = await transcribeSpanish(file.buffer, file.mime);
    const duration = typeof payload.duration === "number" ? ` (${payload.duration}s)` : "";
    const text = transcription.text || "(voz inaudible)";
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
          { type: "text", text: `Foto demasiado grande (${file.buffer.length} bytes).` },
        ],
      };
    }
    const caption = typeof payload.caption === "string" ? payload.caption : "";
    return {
      blocks: [
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
      ],
    };
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

export async function runAgentOnEventManaged(eventId: string): Promise<AgentOutput> {
  const rows = await sql<
    Array<{
      id: string;
      project_id: string | null;
      project_mode: string | null;
      type: string;
      payload: unknown;
      created_by: string | null;
      created_at: Date | string;
    }>
  >`
    select e.id, e.project_id, p.mode as project_mode, e.type, e.payload, e.created_by, e.created_at
    from events e
    left join projects p on p.id = e.project_id
    where e.id = ${eventId}
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

  const mode: "construction" | "inventory" =
    event.project_mode === "inventory" ? "inventory" : "construction";

  const ctx: ToolContext = {
    projectId: event.project_id,
    projectMode: mode,
    eventId: event.id,
    chatId:
      typeof payload.chat_id === "number" || typeof payload.chat_id === "string"
        ? payload.chat_id
        : null,
  };

  const { blocks, transcription } = await buildUserMessage(event.type, payload);
  const metaPrefix: UserContentBlock = {
    type: "text",
    text: `Evento ${event.id}, tipo: ${event.type}, por ${event.created_by ?? "desconocido"}.`,
  };
  const userContent = [metaPrefix, ...blocks];

  const client = getAnthropic();
  const [environmentId, agentId] = await Promise.all([
    ensureEnvironment(),
    ensureAgentForMode(mode),
  ]);

  const session = await client.beta.sessions.create(
    {
      agent: agentId,
      environment_id: environmentId,
      title: `capataz · ${mode} · ${event.id.slice(0, 8)}`,
      metadata: { event_id: event.id, project_id: event.project_id, mode },
      betas: [MANAGED_BETA],
    },
  );
  const sessionId = session.id;

  await client.beta.sessions.events.send(
    sessionId,
    {
      events: [
        {
          type: "user.message",
          // SDK typing is narrow; cast because our union already covers the wire format.
          content: userContent as unknown as Array<{ type: "text"; text: string }>,
        },
      ],
      betas: [MANAGED_BETA],
    },
  );

  const toolsCalled: AgentOutput["toolsCalled"] = [];
  let finalText = "";
  let stopReason: string | null = null;
  let turnsObserved = 0;

  const stream = await client.beta.sessions.events.stream(
    sessionId,
    { betas: [MANAGED_BETA] },
  );

  const pendingResults: Array<{
    custom_tool_use_id: string;
    content: Array<{ type: "text"; text: string }>;
    is_error: boolean;
  }> = [];

  outer: for await (const ev of stream) {
    const type = (ev as { type: string }).type;

    if (type === "agent.message") {
      const blocksOut = (ev as unknown as { content: Array<{ text: string }> }).content;
      const text = blocksOut.map((b) => b.text).join("\n").trim();
      if (text) finalText = text;
      continue;
    }

    if (type === "agent.custom_tool_use") {
      const { id, name, input: toolInput } = ev as unknown as {
        id: string;
        name: string;
        input: Record<string, unknown>;
      };
      const result = await runTool(name, toolInput, ctx);
      toolsCalled.push({ name, input: toolInput, result: result.result });
      pendingResults.push({
        custom_tool_use_id: id,
        content: [
          {
            type: "text",
            text: JSON.stringify(result.result).slice(0, 8000),
          },
        ],
        is_error: !result.ok,
      });
      continue;
    }

    if (type === "session.status_idle") {
      turnsObserved++;
      const stop = (ev as unknown as { stop_reason: { type: string } }).stop_reason;
      stopReason = stop?.type ?? null;

      if (stop?.type === "requires_action" && pendingResults.length > 0) {
        await client.beta.sessions.events.send(
          sessionId,
          {
            events: pendingResults.map((r) => ({
              type: "user.custom_tool_result" as const,
              custom_tool_use_id: r.custom_tool_use_id,
              content: r.content,
              is_error: r.is_error,
            })),
            betas: [MANAGED_BETA],
          },
        );
        pendingResults.length = 0;
        if (turnsObserved >= MAX_TURNS) break outer;
        continue;
      }

      if (stop?.type === "end_turn") break outer;
      if (stop?.type === "retries_exhausted") break outer;
    }

    if (type === "session.status_terminated" || type === "session.deleted") {
      break outer;
    }
  }

  const output: AgentOutput = {
    status: "ok",
    summary: finalText || "(sin resumen)",
    transcription,
    toolsCalled,
    stopReason,
    messageId: sessionId,
  };

  await sql`
    insert into agent_runs (event_id, status, input, output, started_at, ended_at)
    values (
      ${eventId},
      'ok',
      ${JSON.stringify({ ...input, runner: "managed_sessions", session_id: sessionId, agent_id: agentId })}::jsonb,
      ${JSON.stringify(output)}::jsonb,
      now(),
      now()
    )
  `;

  return output;
}
