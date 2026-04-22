import { parseArgs, postPrices, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function main() {
  const { base, adminSecret, webhookSecret } = parseArgs();

  console.log(`→ simulating overnight market shock (Venezuelan demand pushes rebar +12%)`);
  const priceRes = await postPrices({
    base,
    adminSecret,
    snapshots: [
      { commodity_key: "varilla_4_g40",   price_gtq: 175.00, source: "demo_price_shock" },
      { commodity_key: "cemento_ugc_42_5", price_gtq: 115.00, source: "demo_price_shock" },
    ],
  });
  console.log("  admin/prices →", JSON.stringify(priceRes.results));

  console.log(`\n→ posting event so the agent sees new prices and updates the score`);
  const { eventId } = await postUpdate({
    base,
    mode: "construction",
    username: "donbeto",
    text: "Patrón, fíjese que los proveedores avisan que subieron los precios del acero y cemento, ¿compramos hoy o esperamos?",
    webhookSecret,
  });
  const run = await waitForAgentRun(eventId);
  printRun(
    "3. Price shock (construction) — admin pushes new prices, agent reacts via query_project_state",
    eventId,
    run,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
