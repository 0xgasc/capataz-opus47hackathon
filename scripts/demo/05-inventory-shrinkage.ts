import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function main() {
  const { base, webhookSecret } = parseArgs();
  console.log(`→ posting inventory shrinkage event to ${base} (inventory mode)`);
  const { eventId } = await postUpdate({
    base,
    mode: "inventory",
    username: "bodeguero_mario",
    text: "Don Pancho, el conteo de hoy da 180 sacos de cemento menos y 90 blocks pómez menos de lo que teníamos ayer. No hay factura de salida que los respalde. ¿Reviso cámaras?",
    webhookSecret,
  });
  const run = await waitForAgentRun(eventId);
  printRun(
    "5. Inventory shrinkage — stock_out without counterparty; agent should flag shrinkage HIGH",
    eventId,
    run,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
