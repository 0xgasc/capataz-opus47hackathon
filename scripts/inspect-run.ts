import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes(".railway.internal") ? false : "require", prepare: false });
  const n = Number(process.argv[2] ?? 1);
  const rows = await sql`
    select ar.status, ar.output, ar.started_at, ar.ended_at,
           e.type as event_type, e.payload as event_payload
    from agent_runs ar
    join events e on e.id = ar.event_id
    order by ar.started_at desc
    limit ${n}
  `;
  for (const r of rows) {
    const output = typeof r.output === "string" ? JSON.parse(r.output) : r.output;
    console.log("========================================");
    console.log("status:", r.status, "|", r.started_at);
    console.log("event:", r.event_type, "→", (r.event_payload as any)?.text?.slice(0, 80) ?? JSON.stringify(r.event_payload).slice(0, 80));
    console.log("summary:", output.summary);
    console.log("usage:", output.usage);
    console.log("tools:");
    for (const t of output.toolsCalled ?? []) {
      console.log(`  ${t.name}:`, JSON.stringify(t.input).slice(0, 180));
    }
  }
  const anomalies = await sql`select kind, severity, agent_message from anomalies order by created_at desc limit 10`;
  console.log("\n========= anomalies =========");
  for (const a of anomalies) {
    console.log(`[${a.severity}] ${a.kind}: ${a.agent_message}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
