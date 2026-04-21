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

  const dir = join(process.cwd(), "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const body = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`→ applying ${file} ... `);
    try {
      await sql.unsafe(body);
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
