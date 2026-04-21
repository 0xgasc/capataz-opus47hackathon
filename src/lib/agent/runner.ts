// TODO(MVP): replace this entire module with a real Claude Managed Agents session.
// Target shape: create a session with model "claude-opus-4-7", beta header
// "managed-agents-2026-04-01", attach the MCP server (log_event, query_project_state,
// flag_anomaly, reply_in_chat), feed the event + relevant project state as the user
// turn, let Opus reason and call tools, then persist the final output. Skeleton just
// writes a stub agent_runs row and returns a fake structured result.

import { sql } from "@/lib/db";
import { asObject } from "@/lib/json";

export interface AgentInput {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdBy: string | null;
}

export interface AgentOutput {
  stub: boolean;
  message: string;
  anomaliesFlagged?: number;
  toolsCalled?: string[];
}

export async function runAgentOnEvent(eventId: string): Promise<AgentOutput> {
  const rows = await sql<
    Array<{ id: string; type: string; payload: unknown; created_by: string | null }>
  >`
    select id, type, payload, created_by
    from events
    where id = ${eventId}
  `;
  const event = rows[0];
  if (!event) throw new Error(`event ${eventId} not found`);

  const input: AgentInput = {
    eventId: event.id,
    eventType: event.type,
    payload: asObject(event.payload),
    createdBy: event.created_by,
  };

  const output: AgentOutput = {
    stub: true,
    message: "skeleton mode — Opus not yet wired",
  };

  await sql`
    insert into agent_runs (event_id, status, input, output, started_at, ended_at)
    values (
      ${eventId},
      'stub',
      ${JSON.stringify(input)}::jsonb,
      ${JSON.stringify(output)}::jsonb,
      now(),
      now()
    )
  `;

  console.log(`[agent] stub run recorded for event ${eventId}`);
  return output;
}
