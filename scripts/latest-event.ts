import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes(".railway.internal") ? false : "require", prepare: false });
  const [row] = await sql`select id from events order by created_at desc limit 1`;
  if (row) process.stdout.write(row.id);
  await sql.end();
}
main();
