import postgres from "postgres";
async function main() {
  const url = process.env.DATABASE_URL!;
  const s = postgres(url, {ssl: url.includes(".railway.internal") ? false : "require", prepare:false});
  const r = await s`select output, input from agent_runs order by started_at desc limit 3`;
  for (const row of r) {
    const out = typeof row.output === "string" ? JSON.parse(row.output) : row.output;
    const inp = typeof row.input === "string" ? JSON.parse(row.input) : row.input;
    console.log("output keys:", Object.keys(out));
    console.log("  usage:", JSON.stringify(out.usage));
    console.log("  model:", out.model, "intent:", out.intent);
    console.log("  runner:", inp.runner ?? "messages");
    console.log("---");
  }
  await s.end();
}
main();
