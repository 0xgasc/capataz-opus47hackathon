# Capataz

**Built with Opus 4.7 — hackathon submission.**

Capataz is a Claude-powered ambient agent that lives inside a Telegram group used by a
construction project team in Guatemala. It ingests voice notes and receipt photos from
foremen, reconstructs structured project state, and surfaces anomalies to the project
manager through a bilingual (ES/EN) web dashboard.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) on **Vercel** — scaffold picked up
  16.2.x; behavior is compatible with the 15-era patterns in the spec.
- **Postgres on Railway** (project: `capataz`, service: `Postgres`).
- **postgres.js** as the DB client — no ORM, raw SQL in tagged templates.
- **Telegram Bot API** for foreman ingress / PM replies.
- **Anthropic SDK** (`claude-opus-4-7`) — wired in MVP, stubbed now.
- **Claude Managed Agents** (beta header `managed-agents-2026-04-01`) — wired in MVP.
- **MCP server** over stdio — 4 tools registered as stubs (`log_event`,
  `query_project_state`, `flag_anomaly`, `reply_in_chat`).

## Phases

- **SKELETON** (current) — every layer wired, everything smart is a stub or TODO.
- **MVP** — real transcription, vision, Managed Agents session, MCP-backed tool calls,
  anomaly logic.
- **POLISH** — UI polish, realtime, auth, demo script.

## Layout

```
src/
  app/
    api/webhooks/telegram/route.ts   # inbound Telegram updates
    dashboard/page.tsx               # PM dashboard (server component)
    dashboard/refresh.tsx            # client-side 5s router.refresh()
    page.tsx                         # redirects to /dashboard
  lib/
    db.ts                            # postgres.js singleton
    telegram.ts                      # sendMessage, getFileUrl, downloadFile (stub)
    format.ts                        # GTQ + datetime formatters
    json.ts                          # asObject() helper (jsonb → JS)
    agent/runner.ts                  # runAgentOnEvent — stub, to be replaced by Managed Agents
  mcp-server/index.ts                # MCP stdio server with 4 stub tools
migrations/
  0001_init.sql                      # schema
  0002_seed.sql                      # 1 project, 11 budget items, 3 suppliers
scripts/
  migrate.ts                         # applies migrations in order
  verify.ts                          # prints row counts
```

## Quickstart

```bash
pnpm install
# copy .env.example → .env.local and fill DATABASE_URL (Railway public URL)
pnpm db:migrate                      # apply schema + seed
pnpm dev                             # http://localhost:3000
pnpm mcp:dev                         # MCP server on stdio (separate terminal)
```

Full deploy steps (Vercel + Telegram webhook registration): see [DEPLOY.md](./DEPLOY.md).

## Env

```
DATABASE_URL              Railway Postgres (use public proxy URL for Vercel)
ANTHROPIC_API_KEY         required for MVP, unused in skeleton
TELEGRAM_BOT_TOKEN        from @BotFather
TELEGRAM_WEBHOOK_SECRET   any 32+ char random string, matches Telegram header
TELEGRAM_DEFAULT_CHAT_ID  reserved for MVP broadcasts
```

## Skeleton sanity-check checklist

After deploy, these should all pass:

- [ ] Send a text message to the bot → row appears in `events` with `type='text_message'`
- [ ] Bot replies `recibido ✓` in the Telegram chat
- [ ] Dashboard (`/dashboard`) shows the event within 5 seconds (auto-refresh is on)
- [ ] An `agent_runs` row exists for every event with `output = { stub: true, ... }`
- [ ] Send a voice note → row with `type='voice_note'` and `payload.file_id` populated
- [ ] Send a photo → row with `type='photo'` and `payload.file_id` + optional `caption`

## What's stubbed

Greppable: `TODO(MVP)`. Concretely:

- `src/lib/agent/runner.ts` — writes a fake `agent_runs` row; no Opus call yet.
- `src/lib/telegram.ts#downloadFile` — returns `Buffer.alloc(0)`.
- `src/mcp-server/index.ts` — every tool returns `{ stub: true, tool, input }`.
- Webhook does not persist media; only stores the `file_id`.

## License

MIT — see [LICENSE](./LICENSE).
