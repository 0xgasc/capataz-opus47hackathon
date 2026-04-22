import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function main() {
  const { base, webhookSecret } = parseArgs();
  console.log(`→ posting normal inventory stock_out to ${base} (inventory mode)`);
  const { eventId } = await postUpdate({
    base,
    mode: "inventory",
    username: "bodeguero_mario",
    text: "Salieron 200 sacos de cemento UGC 42.5 a Constructora Progreso, factura 4231, valor Q 20,500.00, entregados con el camión azul",
    webhookSecret,
  });
  const run = await waitForAgentRun(eventId);
  printRun("4. Inventory sale — stock_out with known counterparty, movement_type=stock_out", eventId, run);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
