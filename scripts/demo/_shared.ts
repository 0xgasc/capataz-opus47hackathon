// Shared helpers for demo scenario scripts. Each scenario is one tsx file that
// posts a Telegram-shaped payload to the webhook (and/or calls /api/admin/prices),
// then prints the event id + agent run summary once Opus finishes.

import postgres from "postgres";

export type Mode = "construction" | "inventory" | "tiendita" | "general" | "delegacion";

export function parseArgs() {
  const args = process.argv.slice(2);
  let base = process.env.CAPATAZ_BASE ?? "http://localhost:3000";
  let adminSecret = process.env.ADMIN_SECRET ?? "";
  let webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--base" || a === "-b") base = args[++i];
    else if (a === "--admin-secret") adminSecret = args[++i];
    else if (a === "--webhook-secret") webhookSecret = args[++i];
  }
  return { base: base.replace(/\/$/, ""), adminSecret, webhookSecret };
}

export async function postUpdate(opts: {
  base: string;
  mode: Mode;
  username: string;
  text?: string;
  voice?: { file_id: string; duration: number };
  photo?: { file_id: string; caption?: string };
  webhookSecret?: string;
}) {
  const msgId = Math.floor(Date.now() / 1000);
  const chatId =
    opts.mode === "inventory" ? 55555 : opts.mode === "tiendita" ? 77777 : 12345;
  const message: Record<string, unknown> = {
    message_id: msgId,
    chat: { id: chatId },
    from: { id: 777, username: opts.username },
  };
  if (opts.text) message.text = opts.text;
  if (opts.voice) message.voice = opts.voice;
  if (opts.photo) {
    message.photo = [{ file_id: opts.photo.file_id, width: 1280, height: 960 }];
    if (opts.photo.caption) message.caption = opts.photo.caption;
  }
  const body = JSON.stringify({ update_id: msgId, message });
  const url = `${opts.base}/api/webhooks/telegram?mode=${opts.mode}`;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.webhookSecret) headers["x-telegram-bot-api-secret-token"] = opts.webhookSecret;
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text()}`);
  return (await res.json()) as { ok: boolean; eventId: string };
}

export async function postPrices(opts: {
  base: string;
  adminSecret?: string;
  snapshots: Array<{ commodity_key: string; price_gtq: number; source?: string }>;
}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.adminSecret) headers["x-admin-secret"] = opts.adminSecret;
  const res = await fetch(`${opts.base}/api/admin/prices`, {
    method: "POST",
    headers,
    body: JSON.stringify({ snapshots: opts.snapshots }),
  });
  if (!res.ok) throw new Error(`admin prices ${res.status}: ${await res.text()}`);
  return await res.json();
}

export async function waitForAgentRun(eventId: string, timeoutMs = 120000): Promise<{
  status: string;
  summary: string;
  tools: Array<{ name: string; input: unknown }>;
  score?: number | null;
  anomalies: Array<{ kind: string; severity: string; message: string | null }>;
}> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, {
    ssl: url.includes(".railway.internal") ? false : "require",
    prepare: false,
  });
  try {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const rows = await sql`
        select status, output from agent_runs
        where event_id = ${eventId}
        order by started_at desc limit 1
      `;
      const row = rows[0];
      if (row && row.status !== "stub") {
        const output =
          typeof row.output === "string" ? JSON.parse(row.output) : (row.output as any);
        const tools = (output.toolsCalled ?? []).map((t: any) => ({
          name: t.name,
          input: t.input,
        }));
        const scoreTool = (output.toolsCalled ?? []).find(
          (t: any) => t.name === "recompute_score",
        );
        const score = scoreTool?.result?.score ?? null;
        const anoms = await sql<
          Array<{ kind: string; severity: string; agent_message: string | null }>
        >`
          select kind, severity, agent_message from anomalies
          where event_id = ${eventId}
          order by created_at desc
        `;
        return {
          status: row.status,
          summary: output.summary ?? "",
          tools,
          score,
          anomalies: anoms.map((a) => ({
            kind: a.kind,
            severity: a.severity,
            message: a.agent_message,
          })),
        };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`agent run for event ${eventId} did not complete in ${timeoutMs}ms`);
  } finally {
    await sql.end();
  }
}

export function printRun(label: string, eventId: string, run: Awaited<ReturnType<typeof waitForAgentRun>>) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`▸ ${label}`);
  console.log(`  event_id: ${eventId}`);
  console.log(`  opus status: ${run.status}`);
  if (run.score != null) console.log(`  score: ${run.score}/100`);
  console.log(`  tools: ${run.tools.map((t) => t.name).join(" → ")}`);
  if (run.anomalies.length) {
    console.log(`  anomalies:`);
    for (const a of run.anomalies) {
      console.log(`    [${a.severity.toUpperCase()}] ${a.kind}: ${a.message}`);
    }
  }
  console.log(`\n  summary:`);
  console.log(`    ${run.summary}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}
