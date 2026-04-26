import Anthropic from "@anthropic-ai/sdk";
async function main() {
  const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const tools: Anthropic.Tool[] = [{ name: "compute", description: "computa", input_schema: { type: "object", properties: { x: { type: "number" } } } }];
  const resp: any = await c.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    ...({ thinking: { type: "adaptive" }, output_config: { effort: "max" } } as any),
    tools,
    messages: [
      { role: "user", content: "decidí cuál de estos 3 negocios prioriza un prestamista: panadería 800/día margen 35%, pizzería 1500/día margen 25%, ferretería 500/día margen 40%." },
    ],
  });
  for (const b of resp.content) {
    console.log("=== block ===");
    console.log("keys:", Object.keys(b));
    console.log("type:", b.type);
    console.log(JSON.stringify(b, null, 2).slice(0, 800));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
