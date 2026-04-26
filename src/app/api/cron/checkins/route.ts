// Daily cron: (1) reset recurring tasks whose cadence period has elapsed back to
// 'pending' so they reappear in the protocol, then (2) run Haiku nudge agents.
// POST /api/cron/checkins — auth via x-admin-secret header when ADMIN_SECRET is set.

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { runCheckInForBusiness, runCheckInsForAll } from "@/lib/agent/nudge";

async function resetStaleTasks(): Promise<number> {
  const result = await sql`
    update tasks
    set status = 'pending', updated_at = now()
    where status = 'done'
      and cadence != 'one_off'
      and (
        (cadence = 'daily'   and last_completed_at < now() - interval '20 hours') or
        (cadence = 'weekly'  and last_completed_at < now() - interval '6 days')   or
        (cadence = 'monthly' and last_completed_at < now() - interval '28 days')
      )
  `;
  return result.count ?? 0;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    const provided = req.headers.get("x-admin-secret");
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  // Always reset stale recurring tasks first, regardless of slug filter.
  const resetCount = await resetStaleTasks();

  const slug = req.nextUrl.searchParams.get("slug");
  if (slug) {
    const rows = await sql<Array<{ id: string }>>`select id from businesses where slug = ${slug}`;
    if (!rows[0]) return NextResponse.json({ ok: false, error: "no such business" }, { status: 404 });
    const result = await runCheckInForBusiness(rows[0].id);
    return NextResponse.json({ ok: true, reset: resetCount, results: [result] });
  }

  const results = await runCheckInsForAll();
  return NextResponse.json({ ok: true, reset: resetCount, results });
}
