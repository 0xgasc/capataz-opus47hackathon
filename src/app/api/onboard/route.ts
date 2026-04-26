import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runOnboardTurn } from "@/lib/agent/onboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  message: z.string().min(0).max(2000),
  attachment_url: z.string().url().optional(),
  attachment_type: z.enum(["image", "pdf", "document"]).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(40)
    .optional(),
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
    return NextResponse.json(
      { ok: false, error: "bad body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY not set" },
      { status: 503 },
    );
  }

  // Read or generate session — this ties the new business to the browser that onboarded it
  const sessionId = req.cookies.get("cap_session")?.value ?? crypto.randomUUID();

  try {
    const result = await runOnboardTurn({
      message: parsed.data.message,
      attachmentUrl: parsed.data.attachment_url,
      attachmentType: parsed.data.attachment_type,
      history: parsed.data.history ?? [],
      sessionId,
    });
    const res = NextResponse.json({ ok: true, ...result });
    // Reinforce the cookie (middleware may have already set it, but set again to be safe)
    res.cookies.set("cap_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 90,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("[/api/onboard] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
