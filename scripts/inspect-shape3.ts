import postgres from "postgres";
async function main() {
  const url = process.env.DATABASE_URL!;
  const s = postgres(url, {ssl: url.includes(".railway.internal") ? false : "require", prepare:false});
  const r = await s`select input, output from agent_runs where event_id = 'e0cb2292-a346-4da3-8db9-e076102ce7bc' limit 1`;
  if (!r[0]) { console.log("no row"); await s.end(); return; }
  const inp = typeof r[0].input === "string" ? JSON.parse(r[0].input) : r[0].input;
  const out = typeof r[0].output === "string" ? JSON.parse(r[0].output) : r[0].output;
  console.log("input.intent:", inp.intent);
  console.log("input.runner:", inp.runner);
  console.log("output.model:", out.model);
  console.log("output.thinking:", out.thinking);
  console.log("output.usage:", JSON.stringify(out.usage));
  await s.end();
}
main();
