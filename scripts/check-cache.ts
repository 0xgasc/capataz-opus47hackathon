import postgres from "postgres";
async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes(".railway.internal") ? false : "require", prepare: false });
  const rows = await sql<
    Array<{ in: number; out: number; cache_read: number; cache_create: number; n: number }>
  >`
    select
      sum((output->'usage'->>'input_tokens')::int)::int as in,
      sum((output->'usage'->>'output_tokens')::int)::int as out,
      sum(coalesce((output->'usage'->>'cache_read_input_tokens')::int, 0))::int as cache_read,
      sum(coalesce((output->'usage'->>'cache_creation_input_tokens')::int, 0))::int as cache_create,
      count(*)::int as n
    from agent_runs
    where started_at > now() - interval '24 hours'
  `;
  console.log("Last 24h cache stats:");
  console.log(rows[0]);
  if (rows[0]?.cache_read === 0 && rows[0]?.cache_create === 0) {
    console.log("\n⚠ NO caching detected. Need to add cache_control hints.");
  } else {
    const ratio = rows[0].cache_read / Math.max(1, rows[0].cache_read + (rows[0].in ?? 0));
    console.log(`\n✓ Caching active. Cache hit rate ≈ ${(ratio * 100).toFixed(1)}%`);
  }
  await sql.end();
}
main();
