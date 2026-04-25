// One-off: mark all existing .sql files as already-applied so the migrate
// script doesn't re-run destructive seeds the next time.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL!;
  const sql = postgres(url, { ssl: url.includes(".railway.internal") ? false : "require", prepare: false });
  await sql.unsafe(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const dir = join(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    await sql`
      insert into schema_migrations (filename) values (${f})
      on conflict (filename) do nothing
    `;
    console.log(`✓ marked ${f} as applied`);
  }
  await sql.end();
}
main();
