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

export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; mime: string; path: string }> {
  const url = await getFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`telegram file fetch failed: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const mime = res.headers.get("content-type") ?? inferMimeFromPath(url);
  const path = new URL(url).pathname;
  return { buffer, mime, path };
}

function inferMimeFromPath(urlOrPath: string): string {
  const p = urlOrPath.toLowerCase();
  if (p.endsWith(".oga") || p.endsWith(".ogg")) return "audio/ogg";
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".m4a")) return "audio/mp4";
  if (p.endsWith(".wav")) return "audio/wav";
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}
