import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes(".railway.internal") ? false : "require", prepare: false });
  const rows = await sql`
    select id, slug, vertical, name, owner_name, created_at
    from businesses
    order by created_at desc
    limit 10
  `;
  console.log("=== businesses (latest 10) ===");
  for (const r of rows) {
    console.log(`${r.created_at.toISOString?.() ?? r.created_at}  [${r.vertical}]  ${r.slug}  (${r.owner_name ?? "—"})  ${r.name}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
