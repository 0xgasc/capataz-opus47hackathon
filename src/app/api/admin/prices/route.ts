// Manual / CSV-ish commodity price update. For the demo we call this live to
// simulate overnight market movement, then trigger a re-run of the agent on a
// staged event and watch the score react.
//
// Auth: ADMIN_SECRET header. Default is open if ADMIN_SECRET is unset — dev only.
//
// Body shape:
//   { "snapshots": [{ "commodity_key": "cemento_ugc_42_5", "price_gtq": 108.00 }] }
//
// Effect:
//   - inserts a fresh row in price_snapshots for each key
//   - updates budget_items.market_unit_cost_gtq + market_updated_at for all rows
//     linked to that commodity

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  snapshots: z
    .array(
      z.object({
        commodity_key: z.string().min(1),
        price_gtq: z.number().positive(),
        source: z.string().optional(),
      }),
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    const provided = req.headers.get("x-admin-secret");
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "bad body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const results: Array<{
    commodity_key: string;
    price_gtq: number;
    feed_id: string | null;
    snapshot_id: string | null;
    budget_items_updated: number;
  }> = [];

  for (const snap of parsed.data.snapshots) {
    const feeds = await sql<Array<{ id: string }>>`
      select id from market_feeds where commodity_key = ${snap.commodity_key}
    `;
    const feed = feeds[0];
    if (!feed) {
      results.push({
        commodity_key: snap.commodity_key,
        price_gtq: snap.price_gtq,
        feed_id: null,
        snapshot_id: null,
        budget_items_updated: 0,
      });
      continue;
    }

    const [snapshot] = await sql<Array<{ id: string }>>`
      insert into price_snapshots (feed_id, price_gtq, source)
      values (${feed.id}, ${snap.price_gtq}, ${snap.source ?? "admin_api"})
      returning id
    `;

    const updated = await sql<Array<{ id: string }>>`
      update budget_items
      set market_unit_cost_gtq = ${snap.price_gtq},
          market_updated_at = now()
      where commodity_id = ${feed.id}
      returning id
    `;

    results.push({
      commodity_key: snap.commodity_key,
      price_gtq: snap.price_gtq,
      feed_id: feed.id,
      snapshot_id: snapshot.id,
      budget_items_updated: updated.length,
    });
  }

  return NextResponse.json({ ok: true, results });
}
