const API = "https://api.telegram.org";

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

export async function sendMessage(chatId: number | string, text: string) {
  const res = await fetch(`${API}/bot${token()}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`telegram sendMessage failed ${res.status}: ${body}`);
  }
  return res.json();
}

export async function getFileUrl(fileId: string): Promise<string> {
  const url = `${API}/bot${token()}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`telegram getFile failed: ${res.status}`);
  const data = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
  if (!data.ok || !data.result?.file_path) {
    throw new Error(`telegram getFile not ok: ${JSON.stringify(data)}`);
  }
  return `${API}/file/bot${token()}/${data.result.file_path}`;
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  // TODO(MVP): fetch the file from Telegram CDN via getFileUrl and upload to persistent storage
  // (Cloudflare R2 or equivalent), then return the bytes or a storage key.
  console.warn(`[telegram.downloadFile] STUB for file_id=${fileId}`);
  return Buffer.alloc(0);
}
