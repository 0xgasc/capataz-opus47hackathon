// Dry-run: Cross-vertical flip — same platform, different vocabularies
// Seeds events on all 3 demo verticals back-to-back.
// Good for verifying the landing page shows 3 alive tenants with scores.
//
//   pnpm demo:10

import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { base, webhookSecret } = parseArgs();

  // ── Tiendita ───────────────────────────────────────────────────────────────
  console.log("\n[1/3] tiendita — Doña Marta zona 7");
  const { eventId: t } = await postUpdate({
    base,
    mode: "tiendita",
    username: "donia_marta",
    text: "Vendí 3 Pepsis y 1 bolsa de papitas Margarita a Q5 cada una. Todo al contado.",
    webhookSecret,
  });
  const rt = await waitForAgentRun(t, 90000);
  printRun("10a. Tiendita — venta al contado", t, rt);

  await sleep(2000);

  // ── Construction ──────────────────────────────────────────────────────────
  console.log("\n[2/3] construcción — Villa Nueva Fase 2");
  const { eventId: c } = await postUpdate({
    base,
    mode: "construction",
    username: "beto_jefe",
    text: "Llegaron 200 blocks y 10 quintales de cemento de Cementos Progreso. Todo completo, sin daños. La cuadrilla arrancó devuelta.",
    webhookSecret,
  });
  const rc = await waitForAgentRun(c, 90000);
  printRun("10b. Construcción — entrega normal", c, rc);

  await sleep(2000);

  // ── General (Doña Rosa household) ─────────────────────────────────────────
  console.log("\n[3/3] hogar — Casa de Doña Rosa");
  const { eventId: g } = await postUpdate({
    base,
    mode: "general",
    username: "sofia_mixco",
    text: "Mamá durmió bien, tomó todas las pastillas. El doctor llamó y dice que está muy bien, próxima cita en 3 semanas.",
    webhookSecret,
  });
  const rg = await waitForAgentRun(g, 90000);
  printRun("10c. Hogar — reporte del doctor", g, rg);

  console.log(`\nDone. Open ${base} to see 3 alive tenants on the landing page.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
