import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function main() {
  const { base, webhookSecret } = parseArgs();
  console.log(`→ posting tiendita event to ${base} (Doña Marta — Tiendita Zona 7)`);
  const { eventId } = await postUpdate({
    base,
    mode: "tiendita",
    username: "donia_marta",
    text: "Don, ya casi se me acabaron los huevos, solo me quedan como 30. Y vendí dos cervezas a Don Chepe que paga el viernes.",
    webhookSecret,
  });
  const run = await waitForAgentRun(eventId);
  printRun("7. Tiendita — agotándose huevos + venta a crédito", eventId, run);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
