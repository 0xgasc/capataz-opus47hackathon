import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, {
    ssl: url.includes(".railway.internal") ? false : "require",
    prepare: false,
  });
  const tables = [
    "projects",
    "budget_items",
    "suppliers",
    "events",
    "anomalies",
    "agent_runs",
    "market_feeds",
    "price_snapshots",
    "project_scores",
  ];
  for (const t of tables) {
    const [row] = await sql.unsafe(`select count(*)::int as n from ${t}`);
    console.log(`${t}: ${row.n}`);
  }
  const projects = await sql`select name, mode from projects order by created_at`;
  console.log("\nprojects:");
  for (const p of projects) console.log(`  [${p.mode}] ${p.name}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
