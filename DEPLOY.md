# Capataz — Deploy notes (skeleton)

Two moving pieces:

1. **Railway** — Postgres (already provisioned). DB lives in Railway project `capataz`.
2. **Vercel** — Next.js app (app + webhook + dashboard) + MCP server stays local for now.

---

## 1. Local smoke test

```bash
# one-time
pnpm install
# run migrations against Railway Postgres (reads DATABASE_URL from .env.local)
pnpm db:migrate
# verify seed
npx tsx scripts/verify.ts
# boot Next dev
pnpm dev
```

Visit http://localhost:3000 — it redirects to `/dashboard`.

Simulate a Telegram update (no bot token needed, reply will fail gracefully):

```bash
curl -sS -X POST http://localhost:3000/api/webhooks/telegram \
  -H 'content-type: application/json' \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "chat": {"id": 12345},
      "from": {"username": "donbeto"},
      "text": "prueba desde curl"
    }
  }'
```

Refresh the dashboard within 5s — the event should appear.

---

## 2. Create the Telegram bot

1. In Telegram, message `@BotFather`.
2. `/newbot` → pick a name (`Capataz`) and a username (e.g. `capataz_opus47_bot`).
3. BotFather returns a token like `1234567890:AAE...`. This is `TELEGRAM_BOT_TOKEN`.
4. Generate a webhook secret (any random string, 32+ chars):
   ```bash
   openssl rand -hex 32
   ```
   This is `TELEGRAM_WEBHOOK_SECRET`.

---

## 3. Deploy the Next.js app to Vercel

```bash
# one-time: install and log in
pnpm dlx vercel@latest login

# inside the repo
pnpm dlx vercel@latest link          # answer the prompts — creates .vercel/
pnpm dlx vercel@latest env add DATABASE_URL production
pnpm dlx vercel@latest env add ANTHROPIC_API_KEY production
# one of the two is required for voice-note transcription
pnpm dlx vercel@latest env add GROQ_API_KEY production        # free + fast (preferred)
pnpm dlx vercel@latest env add OPENAI_API_KEY production      # fallback
pnpm dlx vercel@latest env add TELEGRAM_BOT_TOKEN production
pnpm dlx vercel@latest env add TELEGRAM_WEBHOOK_SECRET production
pnpm dlx vercel@latest env add TELEGRAM_DEFAULT_CHAT_ID production

# deploy to production
pnpm dlx vercel@latest --prod
```

For `DATABASE_URL` use the **DATABASE_PUBLIC_URL** from Railway (the one with
`shinkansen.proxy.rlwy.net`), not the `.railway.internal` one — Vercel can't reach Railway's
internal network.

After deploy Vercel prints a production URL, e.g. `https://capataz-xxx.vercel.app`.

---

## 4. Register the Telegram webhook

Replace `<TOKEN>`, `<SECRET>`, `<URL>`:

```bash
curl -sS -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H 'content-type: application/json' \
  -d '{
    "url": "<URL>/api/webhooks/telegram",
    "secret_token": "<SECRET>",
    "allowed_updates": ["message", "edited_message"]
  }'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`.

Sanity check the webhook status anytime:

```bash
curl -sS "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

---

## 5. End-to-end validation

1. Send a text message to the bot from Telegram.
2. Bot replies `recibido ✓`.
3. Dashboard at `<URL>/dashboard` shows the event within 5 seconds.
4. Check `events` and `agent_runs` in Railway: `railway connect Postgres` (requires local `psql`).

If step 2 fails but step 3 succeeds, the bot token is wrong / the webhook secret mismatches.
If step 3 fails, check Vercel function logs: `pnpm dlx vercel@latest logs <URL>`.
