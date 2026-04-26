// Dry-run: Casa de Doña Rosa — morning routine fill-out
// Drives the 3 key video beats after the Opus onboard:
//   Beat A: daily log → agent closes task + scores
//   Beat B: "necesito cobros" → module match
//   Beat C: "llegó una caja rara" → HITL instead of guessing
//
// Run against prod:
//   pnpm demo:9
// Run against localhost:
//   CAPATAZ_BASE=http://localhost:3000 pnpm demo:9

import { parseArgs, postUpdate, printRun, waitForAgentRun } from "./_shared";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { base, webhookSecret } = parseArgs();

  // ── Beat A: morning log ────────────────────────────────────────────────────
  console.log("\n[1/3] morning log — pastillas + bitácora");
  const { eventId: e1 } = await postUpdate({
    base,
    mode: "general",
    username: "sofia_mixco",
    text: "Ya le di las pastillas de la mañana a mamá. Tomó la presión bien, 118/75. Durmió toda la noche sin levantarse. Está de buen ánimo.",
    webhookSecret,
  });
  const r1 = await waitForAgentRun(e1, 90000);
  printRun("9a. Doña Rosa — pastillas de la mañana", e1, r1);

  await sleep(3000);

  // ── Beat B: module request — cobros ────────────────────────────────────────
  console.log("\n[2/3] módulo cobros vía conversación");
  const { eventId: e2 } = await postUpdate({
    base,
    mode: "general",
    username: "sofia_mixco",
    text: "Ay, se me olvidó — mi tía Lupe me prestó Q150 para los pañales la semana pasada, necesito llevar control de eso.",
    webhookSecret,
  });
  const r2 = await waitForAgentRun(e2, 90000);
  printRun("9b. Doña Rosa — pide módulo cobros implícitamente", e2, r2);

  await sleep(3000);

  // ── Beat C: HITL — unknown item ────────────────────────────────────────────
  console.log("\n[3/3] HITL — caja desconocida (agent should pause + ask)");
  const { eventId: e3 } = await postUpdate({
    base,
    mode: "general",
    username: "sofia_mixco",
    text: "Llegó una caja a la casa, no sé qué hay adentro ni de quién es. ¿Qué hago?",
    webhookSecret,
  });
  const r3 = await waitForAgentRun(e3, 90000);
  printRun("9c. Doña Rosa — caja desconocida (esperamos HITL)", e3, r3);

  const hitlFired = r3.tools.some((t) => t.name === "request_human_guidance");
  console.log(
    hitlFired
      ? "✓ HITL confirmado — agente pausó en vez de adivinar"
      : "⚠ HITL no se disparó — revisar prompt o intent router",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
