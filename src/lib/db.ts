import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __capatazSql: ReturnType<typeof postgres> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const isInternal = url.includes(".railway.internal");
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
    ssl: isInternal ? false : "require",
  });
}

export const sql = globalThis.__capatazSql ?? connect();
if (process.env.NODE_ENV !== "production") globalThis.__capatazSql = sql;
