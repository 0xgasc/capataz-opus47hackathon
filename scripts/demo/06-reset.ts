// Wipe transient data (events, agent_runs, anomalies, price_snapshots from admin
// pushes, score history beyond seeds) so you can re-run scenarios cleanly.
// Keeps projects, budget_items, suppliers, market_feeds, and the two baseline
// seeded price_snapshots + score rows.

import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, {
    ssl: url.includes(".railway.internal") ? false : "require",
    prepare: false,
  });
  try {
    await sql.begin(async (tx) => {
      await tx`delete from anomalies`;
      await tx`delete from agent_runs`;
      await tx`delete from events`;
      await tx`delete from project_scores where computed_by <> 'seed'`;
      await tx`delete from price_snapshots where source <> 'manual'`;
      // reset cached market prices on budget_items to their original manual seed
      await tx`
        update budget_items bi
        set market_unit_cost_gtq = (
          select ps.price_gtq from price_snapshots ps
          where ps.feed_id = bi.commodity_id
          order by ps.snapshot_at desc limit 1
        ),
        market_updated_at = now()
        where bi.commodity_id is not null
      `;
    });
    console.log("reset complete — demo scenarios can be re-run clean");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
