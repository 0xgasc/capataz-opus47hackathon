import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, {
    ssl: url.includes(".railway.internal") ? false : "require",
    prepare: false,
  });
  const tables = ["projects", "budget_items", "suppliers", "events", "anomalies", "agent_runs"];
  for (const t of tables) {
    const [row] = await sql.unsafe(`select count(*)::int as n from ${t}`);
    console.log(`${t}: ${row.n}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
