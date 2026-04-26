import Anthropic from "@anthropic-ai/sdk";
async function main() {
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const tools: Anthropic.Tool[] = [
    {
      name: "compute",
      description: "computa algo",
      input_schema: { type: "object", properties: { x: { type: "number" } } },
    },
  ];
  const resp: any = await c.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    ...({ thinking: { type: "adaptive" }, output_config: { effort: "max" } } as any),
    tools,
    messages: [
      { role: "user", content: "Resolvé este problema con cuidado: tengo 3 negocios (panadería, pizzería, ferretería) y tengo que decidir cuál tiene más riesgo de quiebra en 6 meses. La panadería vende Q800/día con margen 35%. La pizzería vende Q1500/día con margen 25%. La ferretería vende Q500/día con margen 40%. ¿Cuál priorizo?" },
    ],
  });
  console.log("stop_reason:", resp.stop_reason);
  for (const b of resp.content) {
    console.log("type:", b.type);
    if (b.type === "thinking") console.log("  thinking[0..400]:", String((b as any).thinking ?? "").slice(0, 400));
    if (b.type === "text") console.log("  text[0..400]:", b.text.slice(0, 400));
  }
  console.log("usage:", resp.usage);
}
main().catch(e => { console.error(e); process.exit(1); });
