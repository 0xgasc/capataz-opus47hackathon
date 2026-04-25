// Proactive nudges. POST /api/cron/checkins runs the Haiku check-in agent against
// every business (or one if ?slug= is provided). Auth via x-admin-secret header
// when ADMIN_SECRET is set. Wire to Railway cron daily, or hit manually for the demo.

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { runCheckInForBusiness, runCheckInsForAll } from "@/lib/agent/nudge";

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

  const slug = req.nextUrl.searchParams.get("slug");
  if (slug) {
    const rows = await sql<Array<{ id: string }>>`select id from businesses where slug = ${slug}`;
    if (!rows[0]) return NextResponse.json({ ok: false, error: "no such business" }, { status: 404 });
    const result = await runCheckInForBusiness(rows[0].id);
    return NextResponse.json({ ok: true, results: [result] });
  }

  const results = await runCheckInsForAll();
  return NextResponse.json({ ok: true, results });
}
