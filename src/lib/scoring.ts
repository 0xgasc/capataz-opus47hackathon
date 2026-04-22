// Composite Project Health / Collateral Readiness score (0-100).
//
// Four transparent components, each 0-25:
//   1. budget_variance     — how close spent is to committed (penalty if > 1.0x)
//   2. market_drift        — unrealized gain/loss on commodity-backed items
//   3. anomaly_rate        — open anomalies weighted by severity
//   4. activity_freshness  — days since last event
//
// Deliberately dumb math — the product value is that the number is auditable, not
// that it's sophisticated. POLISH phase can swap in a real model.

import { sql } from "@/lib/db";

export type ScoreComponents = {
  budget_variance: number;
  market_drift: number;
  anomaly_rate: number;
  activity_freshness: number;
};

export type ScoreResult = {
  score: number;
  components: ScoreComponents;
  evidence: {
    committed_gtq: number;
    spent_gtq: number;
    market_value_gtq: number;
    market_drift_gtq: number;
    open_anomalies: number;
    hours_since_last_event: number | null;
  };
};

const SEVERITY_WEIGHT: Record<string, number> = {
  low: 1,
  medium: 3,
  high: 7,
  critical: 15,
};

export async function computeScore(projectId: string): Promise<ScoreResult> {
  const [budgetRow] = await sql<Array<{ committed: string; spent: string; market: string }>>`
    select
      coalesce(sum(qty * unit_cost_gtq), 0)::text as committed,
      coalesce(sum(spent_gtq), 0)::text as spent,
      coalesce(sum(qty * coalesce(market_unit_cost_gtq, unit_cost_gtq)), 0)::text as market
    from budget_items
    where project_id = ${projectId}
  `;
  const committed = Number(budgetRow?.committed ?? 0);
  const spent = Number(budgetRow?.spent ?? 0);
  const marketValue = Number(budgetRow?.market ?? 0);

  const anomalies = await sql<Array<{ severity: string }>>`
    select severity from anomalies
    where project_id = ${projectId} and status = 'open'
  `;

  const [eventRow] = await sql<Array<{ hours: string | null }>>`
    select extract(epoch from (now() - max(created_at))) / 3600 as hours
    from events
    where project_id = ${projectId}
  `;
  const hoursSince = eventRow?.hours == null ? null : Number(eventRow.hours);

  const components: ScoreComponents = {
    budget_variance: scoreBudgetVariance(spent, committed),
    market_drift: scoreMarketDrift(marketValue, committed),
    anomaly_rate: scoreAnomalyRate(anomalies.map((a) => a.severity)),
    activity_freshness: scoreActivityFreshness(hoursSince),
  };

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        components.budget_variance +
          components.market_drift +
          components.anomaly_rate +
          components.activity_freshness,
      ),
    ),
  );

  return {
    score,
    components,
    evidence: {
      committed_gtq: committed,
      spent_gtq: spent,
      market_value_gtq: marketValue,
      market_drift_gtq: marketValue - committed,
      open_anomalies: anomalies.length,
      hours_since_last_event: hoursSince,
    },
  };
}

function scoreBudgetVariance(spent: number, committed: number): number {
  if (committed <= 0) return 25;
  const ratio = spent / committed;
  if (ratio <= 1.0) return 25;
  if (ratio >= 1.3) return 0;
  return Math.round(25 * (1 - (ratio - 1) / 0.3));
}

function scoreMarketDrift(marketValue: number, committed: number): number {
  if (committed <= 0) return 25;
  const drift = (marketValue - committed) / committed;
  if (drift >= 0) return 25;
  if (drift <= -0.2) return 0;
  return Math.round(25 * (1 + drift / 0.2));
}

function scoreAnomalyRate(severities: string[]): number {
  const weight = severities.reduce((acc, s) => acc + (SEVERITY_WEIGHT[s] ?? 2), 0);
  if (weight === 0) return 25;
  if (weight >= 25) return 0;
  return Math.max(0, 25 - weight);
}

function scoreActivityFreshness(hoursSinceLastEvent: number | null): number {
  if (hoursSinceLastEvent == null) return 12;
  if (hoursSinceLastEvent <= 12) return 25;
  if (hoursSinceLastEvent >= 168) return 0;
  return Math.round(25 * (1 - (hoursSinceLastEvent - 12) / 156));
}

export async function persistScore(
  projectId: string,
  result: ScoreResult,
  computedBy: "agent" | "system" | "admin",
): Promise<{ id: string }> {
  const rows = await sql<Array<{ id: string }>>`
    insert into project_scores (project_id, score, components, computed_by)
    values (
      ${projectId},
      ${result.score},
      ${JSON.stringify({ ...result.components, _evidence: result.evidence })}::jsonb,
      ${computedBy}
    )
    returning id
  `;
  return rows[0];
}

export async function latestScore(projectId: string): Promise<{
  score: number;
  components: ScoreComponents;
  computed_at: Date | string;
} | null> {
  const rows = await sql<
    Array<{ score: number; components: unknown; computed_at: Date | string }>
  >`
    select score, components, computed_at
    from project_scores
    where project_id = ${projectId}
    order by computed_at desc
    limit 1
  `;
  if (!rows[0]) return null;
  const parsed =
    typeof rows[0].components === "string"
      ? (JSON.parse(rows[0].components) as ScoreComponents)
      : (rows[0].components as ScoreComponents);
  return {
    score: rows[0].score,
    components: parsed,
    computed_at: rows[0].computed_at,
  };
}
