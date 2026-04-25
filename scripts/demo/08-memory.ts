import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function main() {
  const { base, webhookSecret } = parseArgs();
  console.log(`→ STEP 1: foreman reports a delivery`);
  const first = await postUpdate({
    base,
    mode: "construction",
    username: "donbeto",
    text: "Patrón, llegaron 60 sacos de cemento de Cementos del Valle, Q 8,450 de factura, los recibimos a las 10 de la mañana.",
    webhookSecret,
  });
  const firstRun = await waitForAgentRun(first.eventId);
  printRun("8a. First event — delivery logged", first.eventId, firstRun);

  await new Promise((r) => setTimeout(r, 4000));

  console.log(`→ STEP 2 (90s later in spirit): warehouse manager asks if anything came in`);
  const second = await postUpdate({
    base,
    mode: "construction",
    username: "donia_marta",
    text: "Oye, estoy revisando bodega. ¿Llegó algo de cemento hoy? No me acuerdo cuánto.",
    webhookSecret,
  });
  const secondRun = await waitForAgentRun(second.eventId);
  printRun(
    "8b. Memory moment — agent should recall Don Beto's earlier delivery WITHOUT vector DB",
    second.eventId,
    secondRun,
  );

  console.log("\n✓ If the second summary mentions Don Beto's 60 sacos / Cementos del Valle / Q 8,450, memory is working.");
  console.log("  This is the 'fridge moment' equivalent — recall powered by query_project_state, not vector DB.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
