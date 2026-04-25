// End-to-end regression suite. Runs synthetic scenarios against the deployed
// instance (or localhost via CAPATAZ_BASE), asserts expected DB state after
// each one, and reports pass/fail. Designed to be re-runnable without
// destroying existing demo data — uses a per-run tag in payloads so we can
// distinguish test events from real ones.
//
//   pnpm e2e                          # against live Railway prod
//   CAPATAZ_BASE=http://localhost:3000 pnpm e2e

import postgres from "postgres";

const BASE = (process.env.CAPATAZ_BASE ?? "https://capataz-web-production.up.railway.app").replace(/\/$/, "");
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";
const RUN_TAG = `e2e-${Date.now().toString(36)}`;

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: process.env.DATABASE_URL!.includes(".railway.internal") ? false : "require",
  prepare: false,
});

type TestResult = { name: string; ok: boolean; ms: number; note?: string };
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<string | void>) {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t, note: note ?? undefined });
    console.log(`✓ ${name} (${Date.now() - t}ms)${note ? " — " + note : ""}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, ms: Date.now() - t, note: msg });
    console.log(`✗ ${name} (${Date.now() - t}ms) — ${msg}`);
  }
}

async function postJson<T>(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || ("ok" in data && (data as { ok?: boolean }).ok === false)) {
    throw new Error(`${path} → ${res.status}: ${("error" in data && (data as { error?: string }).error) ?? "non-ok response"}`);
  }
  return data;
}

async function waitForRun(eventId: string, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await sql`
      select status from agent_runs where event_id = ${eventId} order by started_at desc limit 1
    `;
    if (rows[0] && rows[0].status !== "stub") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`agent run for ${eventId} did not complete in ${timeoutMs}ms`);
}

const SLUG = "tiendita-zona-7";

async function main() {
  console.log(`▸ Capataz E2E — base=${BASE} run_tag=${RUN_TAG}\n`);

  // 1. Dashboard prompt produces an agent run.
  await test("1. dashboard prompt → agent run + summary", async () => {
    const data = await postJson<{ event_id: string; summary: string; tools: string[] }>(
      "/api/dashboard/prompt",
      { slug: SLUG, message: `[${RUN_TAG}] vendí 1 atol shuco a Don E2E, paga al rato` },
    );
    if (!data.event_id) throw new Error("no event_id");
    if (!data.summary) throw new Error("no summary");
    if (!Array.isArray(data.tools) || data.tools.length === 0) throw new Error("no tools called");
    if (!data.tools.includes("query_project_state")) throw new Error("expected query_project_state");
    return `tools: ${data.tools.join("→")}`;
  });

  // 2. Module request that should match cobros.
  await test("2. module request: 'fiados' → matched cobros", async () => {
    const data = await postJson<{ decision: string; matched_module_key: string | null }>(
      "/api/dashboard/module-request",
      { slug: SLUG, message: `[${RUN_TAG}] necesito llevar control de fiados de mis clientes` },
    );
    if (data.decision !== "matched") throw new Error(`expected matched, got ${data.decision}`);
    if (data.matched_module_key !== "cobros") throw new Error(`expected cobros, got ${data.matched_module_key}`);
  });

  // 3. Module request that should be queued (no catalog match).
  await test("3. module request: novel → queued", async () => {
    const data = await postJson<{ decision: string }>("/api/dashboard/module-request", {
      slug: SLUG,
      message: `[${RUN_TAG}] quiero predicción de demanda con AI por SKU para los próximos 30 días`,
    });
    if (data.decision !== "queued") throw new Error(`expected queued, got ${data.decision}`);
  });

  // 4. Activate cobros via API directly.
  await test("4. install cobros module via API", async () => {
    await postJson("/api/dashboard/modules", {
      slug: SLUG,
      module_key: "cobros",
      action: "enable",
    });
    const rows = await sql`
      select bm.status from business_modules bm
      join businesses b on b.id = bm.business_id
      where b.slug = ${SLUG} and bm.module_key = 'cobros'
    `;
    if (rows[0]?.status !== "enabled") throw new Error(`expected enabled, got ${rows[0]?.status}`);
  });

  // 5. With cobros active, recording a credit sale should hit record_credit_change.
  await test("5. credit sale via chat → record_credit_change tool fires", async () => {
    const data = await postJson<{ event_id: string; tools: string[] }>(
      "/api/dashboard/prompt",
      {
        slug: SLUG,
        message: `[${RUN_TAG}] vendí 2 cervezas a Don E2E ${RUN_TAG} a Q12 cada una, paga el viernes`,
      },
    );
    if (!data.tools.includes("record_credit_change")) {
      throw new Error(`expected record_credit_change, tools=${data.tools.join(",")}`);
    }
    const customer = `Don E2E ${RUN_TAG}`;
    const rows = await sql`
      select balance_gtq from credit_accounts ca
      join businesses b on b.id = ca.business_id
      where b.slug = ${SLUG} and customer_name ilike ${"%" + customer + "%"}
    `;
    if (rows.length === 0) throw new Error("no credit account row found");
    return `balance: Q ${Number(rows[0].balance_gtq).toFixed(2)}`;
  });

  // 6. Task completion via chat.
  await test("6. complete task via chat → complete_task tool fires", async () => {
    const tasks = await sql`
      select t.id, t.title from tasks t
      join businesses b on b.id = t.business_id
      where b.slug = ${SLUG} and t.status = 'pending'
      limit 1
    `;
    if (tasks.length === 0) {
      return "no pending tasks to complete (skipped)";
    }
    const target = tasks[0];
    const data = await postJson<{ tools: string[] }>("/api/dashboard/prompt", {
      slug: SLUG,
      message: `[${RUN_TAG}] marcá hecha la tarea: ${target.title}`,
    });
    if (!data.tools.includes("complete_task")) {
      throw new Error(`expected complete_task, tools=${data.tools.join(",")}`);
    }
    const after = await sql`select status from tasks where id = ${target.id}`;
    if (after[0]?.status !== "done") throw new Error(`task status not 'done', got ${after[0]?.status}`);
    return `closed: ${target.title}`;
  });

  // 7. Task creation via chat.
  await test("7. create task via chat → upsert_task tool fires", async () => {
    const taskTitle = `tarea de prueba ${RUN_TAG}`;
    const data = await postJson<{ tools: string[] }>("/api/dashboard/prompt", {
      slug: SLUG,
      message: `[${RUN_TAG}] agregá una tarea: ${taskTitle}, todos los lunes`,
    });
    if (!data.tools.includes("upsert_task")) {
      throw new Error(`expected upsert_task, tools=${data.tools.join(",")}`);
    }
    const rows = await sql`
      select t.id from tasks t
      join businesses b on b.id = t.business_id
      where b.slug = ${SLUG} and t.title ilike ${"%" + taskTitle + "%"}
    `;
    if (rows.length === 0) throw new Error("new task not found in db");
    return `created: ${taskTitle}`;
  });

  // 8. Cron tick produces agent_check_ins rows.
  await test("8. POST /api/cron/checkins → fires through all businesses", async () => {
    const before = await sql`select count(*)::int as n from agent_check_ins`;
    await postJson(
      "/api/cron/checkins?slug=" + SLUG,
      {},
      ADMIN_SECRET ? { "x-admin-secret": ADMIN_SECRET } : {},
    );
    const after = await sql`select count(*)::int as n from agent_check_ins`;
    if (after[0].n <= before[0].n) throw new Error("check_in count did not increase");
    return `check_ins: ${before[0].n} → ${after[0].n}`;
  });

  // 9. Token usage is recorded on agent_runs.
  await test("9. agent_runs.output.usage contains token counts", async () => {
    const rows = await sql`
      select output from agent_runs ar
      join events e on e.id = ar.event_id
      join projects p on p.id = e.project_id
      join businesses b on b.id = p.business_id
      where b.slug = ${SLUG}
      order by ar.started_at desc limit 5
    `;
    let withTokens = 0;
    for (const r of rows) {
      const out = typeof r.output === "string" ? JSON.parse(r.output) : r.output;
      if (out?.usage?.input_tokens > 0) withTokens++;
    }
    if (withTokens === 0) throw new Error("no recent runs have token usage recorded");
    return `${withTokens}/${rows.length} recent runs have usage`;
  });

  // 10. Memory: agent references prior event when contextually relevant.
  await test("10. memory — second turn references first via query_project_state", async () => {
    const first = await postJson<{ event_id: string }>("/api/dashboard/prompt", {
      slug: SLUG,
      message: `[${RUN_TAG}] llegaron 60 huevos del proveedor Granja Test, factura Q 90`,
    });
    if (!first.event_id) throw new Error("first event missing");
    await new Promise((r) => setTimeout(r, 2000));
    const second = await postJson<{ summary: string; tools: string[] }>(
      "/api/dashboard/prompt",
      { slug: SLUG, message: `[${RUN_TAG}] oye, ¿llegó algo de huevos hoy? no me acuerdo` },
    );
    if (!second.tools.includes("query_project_state")) {
      throw new Error("did not query project state for memory");
    }
    if (!/granja test|60 huevos|q\s*90/i.test(second.summary)) {
      throw new Error(`summary doesn't mention prior event: ${second.summary.slice(0, 200)}`);
    }
    return "recalled prior event";
  });

  // Summary
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const ok = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`Summary: ${ok}/${total} passed`);
  for (const r of results.filter((r) => !r.ok)) {
    console.log(`  ✗ ${r.name}: ${r.note}`);
  }
  await sql.end();
  if (ok < total) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
