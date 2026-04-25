// One-click module accept/decline from the dashboard suggestion card.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { setModuleStatus, MODULE_CATALOG } from "@/lib/modules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  slug: z.string().min(1).max(80),
  module_key: z.string().min(1).max(40),
  action: z.enum(["enable", "decline"]),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }
  const { slug, module_key, action } = parsed.data;
  const exists = MODULE_CATALOG.find((m) => m.key === module_key);
  if (!exists || exists.baseline) {
    return NextResponse.json({ ok: false, error: "invalid module" }, { status: 400 });
  }

  const rows = await sql<Array<{ id: string }>>`
    select id from businesses where slug = ${slug}
  `;
  if (!rows[0]) return NextResponse.json({ ok: false, error: "business not found" }, { status: 404 });

  await setModuleStatus(
    rows[0].id,
    module_key,
    action === "enable" ? "enabled" : "disabled",
    "user-click",
  );

  return NextResponse.json({ ok: true, module_key, status: action === "enable" ? "enabled" : "disabled" });
}
