// Approximate pricing (USD per 1M tokens) for Anthropic models — public list-pricing
// estimates as of 2026. Update if Anthropic publishes new rates. These are USED ONLY
// for cost-estimation display on /agents — agent_runs.output keeps the raw token
// counts as source of truth, so re-pricing is just a math change.

export type Pricing = {
  input_per_million: number;
  output_per_million: number;
  cache_read_per_million?: number;
  cache_write_per_million?: number;
};

const PRICING: Record<string, Pricing> = {
  "claude-opus-4-7": {
    input_per_million: 15,
    output_per_million: 75,
    cache_read_per_million: 1.5,
    cache_write_per_million: 18.75,
  },
  "claude-sonnet-4-6": {
    input_per_million: 3,
    output_per_million: 15,
    cache_read_per_million: 0.3,
    cache_write_per_million: 3.75,
  },
  "claude-haiku-4-5-20251001": {
    input_per_million: 1,
    output_per_million: 5,
    cache_read_per_million: 0.1,
    cache_write_per_million: 1.25,
  },
};

export function priceFor(model: string | null | undefined): Pricing {
  if (!model) return { input_per_million: 0, output_per_million: 0 };
  return (
    PRICING[model] ?? {
      input_per_million: 5,
      output_per_million: 25,
    }
  );
}

export function estimateCostUsd(
  model: string | null | undefined,
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  } | null,
): number {
  if (!usage) return 0;
  const p = priceFor(model);
  const cached = usage.cache_read_input_tokens ?? 0;
  const created = usage.cache_creation_input_tokens ?? 0;
  const fresh = Math.max(0, (usage.input_tokens ?? 0) - cached - created);
  return (
    (fresh / 1_000_000) * p.input_per_million +
    (cached / 1_000_000) * (p.cache_read_per_million ?? p.input_per_million) +
    (created / 1_000_000) * (p.cache_write_per_million ?? p.input_per_million) +
    ((usage.output_tokens ?? 0) / 1_000_000) * p.output_per_million
  );
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.0000";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
