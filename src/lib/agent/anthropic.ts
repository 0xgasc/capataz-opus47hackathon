import Anthropic from "@anthropic-ai/sdk";

export const OPUS_MODEL = "claude-opus-4-7";

declare global {
  // eslint-disable-next-line no-var
  var __capatazAnthropic: Anthropic | undefined;
}

export function getAnthropic(): Anthropic {
  if (globalThis.__capatazAnthropic) return globalThis.__capatazAnthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey: key });
  if (process.env.NODE_ENV !== "production") globalThis.__capatazAnthropic = client;
  return client;
}
