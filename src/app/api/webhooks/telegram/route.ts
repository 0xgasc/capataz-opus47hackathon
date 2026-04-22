import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { runAgentOnEvent } from "@/lib/agent/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FromSchema = z
  .object({
    id: z.number(),
    username: z.string().optional(),
    first_name: z.string().optional(),
  })
  .partial()
  .passthrough();

const PhotoSchema = z
  .object({ file_id: z.string(), width: z.number().optional(), height: z.number().optional() })
  .passthrough();

const MessageSchema = z
  .object({
    message_id: z.number(),
    chat: z.object({ id: z.number() }).passthrough(),
    from: FromSchema.optional(),
    text: z.string().optional(),
    caption: z.string().optional(),
    voice: z.object({ file_id: z.string(), duration: z.number().optional() }).passthrough().optional(),
    photo: z.array(PhotoSchema).optional(),
  })
  .passthrough();

const UpdateSchema = z
  .object({
    update_id: z.number(),
    message: MessageSchema.optional(),
    edited_message: MessageSchema.optional(),
    channel_post: MessageSchema.optional(),
  })
  .passthrough();

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn("[webhook] could not parse update", parsed.error.flatten());
    return NextResponse.json({ ok: true, ignored: true });
  }

  const msg = parsed.data.message ?? parsed.data.edited_message ?? parsed.data.channel_post;
  if (!msg) return NextResponse.json({ ok: true });

  const createdBy = msg.from?.username
    ? `@${msg.from.username}`
    : msg.from?.first_name ?? "unknown";

  let type: string;
  let payload: Record<string, unknown>;
  if (msg.text) {
    type = "text_message";
    payload = { text: msg.text, chat_id: msg.chat.id };
  } else if (msg.voice) {
    type = "voice_note";
    payload = {
      file_id: msg.voice.file_id,
      duration: msg.voice.duration,
      chat_id: msg.chat.id,
    };
  } else if (msg.photo && msg.photo.length > 0) {
    type = "photo";
    const best = msg.photo[msg.photo.length - 1];
    payload = {
      file_id: best.file_id,
      caption: msg.caption,
      chat_id: msg.chat.id,
    };
  } else {
    type = "unknown";
    payload = { chat_id: msg.chat.id, raw: msg };
  }

  const inserted = await sql<Array<{ id: string }>>`
    insert into events (project_id, type, payload, telegram_msg_id, created_by)
    values (
      (select id from projects order by created_at asc limit 1),
      ${type},
      ${JSON.stringify(payload)}::jsonb,
      ${String(msg.message_id)},
      ${createdBy}
    )
    returning id
  `;
  const eventId = inserted[0].id;

  // Reply fast so Telegram doesn't retry; run Opus in the background.
  try {
    await sendMessage(msg.chat.id, "recibido ✓");
  } catch (err) {
    console.error("[webhook] reply failed", err);
  }

  after(async () => {
    try {
      await runAgentOnEvent(eventId);
    } catch (err) {
      console.error("[webhook] agent runner failed", err);
    }
  });

  return NextResponse.json({ ok: true, eventId });
}
