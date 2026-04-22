import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function main() {
  const { base, webhookSecret } = parseArgs();
  console.log(`→ posting off-hours + unknown-supplier event to ${base} (construction)`);
  const { eventId } = await postUpdate({
    base,
    mode: "construction",
    username: "donbeto",
    text: "Hoy a las 23:47 llegó un camión de Ferretería Los Cipreses con 300 varillas #4 grado 40, cobraron Q 46,500.00",
    webhookSecret,
  });
  const run = await waitForAgentRun(eventId);
  printRun("2. Off-hours + unknown supplier (construction) — should raise 2 anomalies", eventId, run);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
