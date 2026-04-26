import Anthropic from "@anthropic-ai/sdk";
async function main() {
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const resp: any = await c.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    ...({ thinking: { type: "adaptive" }, output_config: { effort: "high" } } as any),
    messages: [
      { role: "user", content: "Pensá un poco antes de contestar: ¿cuál es la mejor manera de organizar el día de un panadero pequeño que abre a las 5am?" },
    ],
  });
  console.log("stop_reason:", resp.stop_reason);
  console.log("content blocks:");
  for (const b of resp.content) {
    console.log("  type:", b.type, "keys:", Object.keys(b));
    if (b.type === "thinking") console.log("    thinking[0..200]:", String((b as any).thinking ?? "").slice(0, 200));
    if (b.type === "text") console.log("    text[0..120]:", b.text.slice(0, 120));
  }
  console.log("usage:", resp.usage);
}
main().catch(e => { console.error(e); process.exit(1); });
