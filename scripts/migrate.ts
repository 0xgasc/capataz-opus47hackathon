import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const sql = postgres(url, {
    ssl: url.includes(".railway.internal") ? false : "require",
    prepare: false,
  });

  // Track applied migrations so destructive seed files don't re-run on every deploy.
  await sql.unsafe(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const appliedRows = await sql<Array<{ filename: string }>>`
    select filename from schema_migrations
  `;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const dir = join(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`→ skipping ${file} (already applied)`);
      continue;
    }
    const body = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`→ applying ${file} ... `);
    try {
      await sql.unsafe(body);
      await sql`insert into schema_migrations (filename) values (${file})`;
      console.log("ok");
    } catch (err) {
      console.log("FAILED");
      console.error(err);
      await sql.end();
      process.exit(1);
    }
  }

  await sql.end();
  console.log("migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
