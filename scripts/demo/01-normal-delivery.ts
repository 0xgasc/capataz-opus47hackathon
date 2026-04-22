import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function main() {
  const { base, webhookSecret } = parseArgs();
  console.log(`→ posting normal delivery to ${base} (construction)`);
  const { eventId } = await postUpdate({
    base,
    mode: "construction",
    username: "donbeto",
    text: "llegaron 60 sacos de cemento y 400 blocks pómez de Cementos del Valle, la factura dice Q 8,450.00",
    webhookSecret,
  });
  const run = await waitForAgentRun(eventId);
  printRun("1. Normal delivery (construction) — happy path", eventId, run);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
