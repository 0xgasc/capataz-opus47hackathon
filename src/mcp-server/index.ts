// Capataz MCP server — SKELETON.
// Exposes the tool surface that Claude Opus 4.7 (running in a Managed Agents session)
// will call to read and mutate project state during agent runs. Every tool is a stub:
// it returns { stub: true, tool, input } so we can prove end-to-end wiring before
// implementing real logic in MVP.
//
// Run locally:
//   pnpm mcp:dev
//
// Connect from a Managed Agents session by pointing its MCP config at this process
// over stdio, or at a hosted URL once we wrap it in an HTTP transport (post-skeleton).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "capataz-mcp",
  version: "0.0.1-skeleton",
});

type StubResult = { stub: true; tool: string; input: unknown };

function stubReply(tool: string, input: unknown) {
  const body: StubResult = { stub: true, tool, input };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
  };
}

server.registerTool(
  "log_event",
  {
    description:
      "Record an atomic site event (delivery, incident, observation) into the project timeline.",
    inputSchema: {
      projectId: z.string().uuid().optional(),
      type: z.string(),
      summary: z.string(),
      payload: z.record(z.string(), z.unknown()).optional(),
    },
  },
  async (input) => stubReply("log_event", input),
);

server.registerTool(
  "query_project_state",
  {
    description:
      "Read current project snapshot: budget items, recent events, open anomalies, supplier list.",
    inputSchema: {
      projectId: z.string().uuid().optional(),
      include: z
        .array(z.enum(["budget", "events", "anomalies", "suppliers"]))
        .optional(),
      limit: z.number().int().positive().optional(),
    },
  },
  async (input) => stubReply("query_project_state", input),
);

server.registerTool(
  "flag_anomaly",
  {
    description:
      "Raise an anomaly for the PM: overspend, duplicate charge, missing delivery, off-hours activity.",
    inputSchema: {
      projectId: z.string().uuid().optional(),
      eventId: z.string().uuid().optional(),
      kind: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      message: z.string(),
    },
  },
  async (input) => stubReply("flag_anomaly", input),
);

server.registerTool(
  "reply_in_chat",
  {
    description: "Send a Telegram message back to the originating chat (Spanish by default).",
    inputSchema: {
      chatId: z.union([z.number(), z.string()]),
      text: z.string(),
    },
  },
  async (input) => stubReply("reply_in_chat", input),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] capataz-mcp skeleton ready on stdio");
}

main().catch((err) => {
  console.error("[mcp] fatal", err);
  process.exit(1);
});
