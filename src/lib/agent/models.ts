// Model tiering. Opus 4.7 is reserved for moments where the user is *building on
// or changing their baseline* — onboarding, protocol rewrites, periodic deep
// reviews. Routine event processing rides on Sonnet 4.6 (~5x cheaper, fast).
// Proactive nudges run on Haiku 4.5 (cheapest, near-zero latency).
//
// This is the explicit pitch line: "Opus is the brain when you're adding
// dimensions; Sonnet is the steady hand for daily ops; Haiku is the nudge."

export const OPUS = "claude-opus-4-7";
export const SONNET = "claude-sonnet-4-6";
export const HAIKU = "claude-haiku-4-5-20251001";

export type Intent =
  | "onboard"          // user is describing/redefining their business — Opus
  | "baseline_change"  // mutate the protocol, add suppliers, etc. — Opus
  | "review"           // weekly deep review across many events — Opus
  | "routine_event"    // normal Telegram event flowing in — Sonnet
  | "nudge";           // proactive cron check-in — Haiku

export function selectModel(intent: Intent): string {
  switch (intent) {
    case "onboard":
    case "baseline_change":
    case "review":
      return OPUS;
    case "routine_event":
      return SONNET;
    case "nudge":
      return HAIKU;
  }
}

export function intentLabel(intent: Intent): string {
  switch (intent) {
    case "onboard": return "onboard · opus";
    case "baseline_change": return "baseline · opus";
    case "review": return "review · opus";
    case "routine_event": return "routine · sonnet";
    case "nudge": return "nudge · haiku";
  }
}
