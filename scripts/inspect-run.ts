import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes(".railway.internal") ? false : "require", prepare: false });
  const n = Number(process.argv[2] ?? 1);
  const rows = await sql`
    select ar.status, ar.input, ar.output, ar.started_at, ar.ended_at,
           e.type as event_type, e.payload as event_payload
    from agent_runs ar
    join events e on e.id = ar.event_id
    order by ar.started_at desc
    limit ${n}
  `;
  for (const r of rows) {
    const output = typeof r.output === "string" ? JSON.parse(r.output) : r.output;
    const input = typeof r.input === "string" ? JSON.parse(r.input) : r.input;
    console.log("========================================");
    console.log("status:", r.status, "|", r.started_at);
    console.log("runner:", input.runner ?? "messages+tools");
    if (input.session_id) console.log("session_id:", input.session_id);
    if (input.agent_id) console.log("agent_id:", input.agent_id);
    console.log("event:", r.event_type, "→", (r.event_payload as any)?.text?.slice(0, 80) ?? JSON.stringify(r.event_payload).slice(0, 80));
    console.log("summary:", output.summary);
    console.log("stopReason:", output.stopReason);
    console.log("tools:");
    for (const t of output.toolsCalled ?? []) {
      console.log(`  ${t.name}`);
    }
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
