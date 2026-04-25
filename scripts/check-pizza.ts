import postgres from "postgres";
async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes(".railway.internal") ? false : "require", prepare: false });
  console.log("=== businesses ===");
  console.log(await sql`select id, slug, vertical, name from businesses order by created_at desc limit 5`);
  console.log("=== projects ===");
  console.log(await sql`select id, business_id, mode, name from projects order by created_at desc limit 5`);
  console.log("=== join via slug ===");
  console.log(await sql`
    select p.id as project_id, p.name as project_name, p.mode, b.slug, b.name as business_name
    from projects p
    join businesses b on b.id = p.business_id
    where b.slug = 'pizza-123'
  `);
  await sql.end();
}
main();
