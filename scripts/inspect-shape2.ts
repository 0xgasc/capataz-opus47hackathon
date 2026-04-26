import postgres from "postgres";
async function main() {
  const url = process.env.DATABASE_URL!;
  const s = postgres(url, {ssl: url.includes(".railway.internal") ? false : "require", prepare:false});
  const r = await s`
    select ar.input, ar.output, ar.started_at, e.payload
    from agent_runs ar
    join events e on e.id = ar.event_id
    where e.id = 'df06f371-25fc-49de-84a5-eb10f628a7c9'
    order by ar.started_at desc
    limit 1
  `;
  if (!r[0]) { console.log("no row"); await s.end(); return; }
  const inp = typeof r[0].input === "string" ? JSON.parse(r[0].input) : r[0].input;
  const out = typeof r[0].output === "string" ? JSON.parse(r[0].output) : r[0].output;
  console.log("input keys:", Object.keys(inp));
  console.log("input.runner:", inp.runner);
  console.log("input.model:", inp.model);
  console.log("input.intent:", inp.intent);
  console.log("output.model:", out.model);
  console.log("output.intent:", out.intent);
  console.log("output.thinking:", out.thinking ? out.thinking.slice(0, 200) + "..." : "(none)");
  await s.end();
}
main();
