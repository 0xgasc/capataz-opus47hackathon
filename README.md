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
ANTHROPIC_API_KEY         Opus 4.7 agent — required; runner falls back to 'degraded' without it
GROQ_API_KEY              optional, voice-note transcription (whisper-large-v3, free tier, Spanish)
TELEGRAM_BOT_TOKEN        from @BotFather
TELEGRAM_WEBHOOK_SECRET   any 32+ char random string, matches Telegram header
TELEGRAM_DEFAULT_CHAT_ID  reserved for future broadcast features
```

Without `GROQ_API_KEY`, voice notes still flow through — they get a `[sin transcripción]`
placeholder and the agent can still react. Text + photo paths are unaffected.

## Skeleton sanity-check checklist

After deploy, these should all pass:

- [ ] Send a text message to the bot → row appears in `events` with `type='text_message'`
- [ ] Bot replies `recibido ✓` in the Telegram chat
- [ ] Dashboard (`/dashboard`) shows the event within 5 seconds (auto-refresh is on)
- [ ] An `agent_runs` row exists for every event with `output = { stub: true, ... }`
- [ ] Send a voice note → row with `type='voice_note'` and `payload.file_id` populated
- [ ] Send a photo → row with `type='photo'` and `payload.file_id` + optional `caption`

## Two modes, one substrate

Capataz is the first vertical of a platform thesis: **an agent-oracle for physical
operations.** Same schema, same agent, same substrate — flipped by
`projects.mode`:

| Mode | Lens | Top-line score |
|---|---|---|
| `construction` | PM watching an active site | **Project Health** |
| `inventory` | Distributor / warehouse, collateral for a lender | **Collateral Readiness** |

The dashboard lives at `/dashboard/construction` and `/dashboard/inventory`. Switch
between them with the pill toggle in the header. Each mode has its own system prompt
(`src/lib/agent/prompt.ts`), same tool surface, same Opus 4.7 model.

The webhook also honors mode routing: `POST /api/webhooks/telegram?mode=inventory`
drops events into the inventory project. Default (no query param) → construction.

## Composite score

`src/lib/scoring.ts` computes a 0–100 score from four 0–25 components:

- **budget_variance** — spent / committed; 25 if under budget, 0 at 30% over.
- **market_drift** — `(market_value − committed) / committed`; 25 if flat or positive, 0 at 20% below.
- **anomaly_rate** — severity-weighted open anomalies (critical=15, high=7, medium=3, low=1).
- **activity_freshness** — 25 if last event ≤12h ago, 0 at 7d+.

Transparent and dumb by design — what makes the number valuable is that it's
auditable from the `agent_runs.output` trace, not that the formula is sophisticated.

## Commodity price feeds

Five market feeds seeded at migration: `cemento_ugc_42_5`, `varilla_4_g40`,
`block_pomez_15_20_40`, `arena_amarilla`, `piedrin_3_4`. Each seeded with two
snapshots (7 days old + 1 day old) so the timeline isn't empty.

Live-update prices (for demo-day market-movement scenarios) via:

```bash
curl -sS -X POST https://<your-host>/api/admin/prices \
  -H 'content-type: application/json' \
  -H 'x-admin-secret: <ADMIN_SECRET>' \
  -d '{"snapshots":[{"commodity_key":"varilla_4_g40","price_gtq":172.00}]}'
```

This inserts a fresh `price_snapshots` row and caches the new price on every
`budget_items` row linked to that feed. Next time the agent runs, `query_project_state`
sees the new market value and the score reflects it.

## MVP agent loop

On every Telegram event:

1. Webhook inserts an `events` row and immediately replies `recibido ✓`.
2. `next/server.after()` kicks `runAgentOnEvent(id)` into the background.
3. Runner assembles a multimodal user message — text goes as text, photos as base64
   image blocks, voice notes are transcribed via Whisper (Groq preferred) and passed as
   text.
4. `claude-opus-4-7` is called with `CAPATAZ_SYSTEM_PROMPT` (Spanish/chapín-aware) and
   four tools: `query_project_state`, `log_event`, `flag_anomaly`, `reply_in_chat`.
5. A tool-use loop runs up to 6 turns. Tool handlers are plain TS in
   [src/lib/agent/tools.ts](src/lib/agent/tools.ts) that hit the DB directly.
6. The full trace (transcription, tool calls, final summary, usage) is persisted to
   `agent_runs.output`.
7. Dashboard auto-refreshes every 5s and renders the summary, anomalies, and
   budget-by-category under each event.

## MCP scaffold

The MCP server at [src/mcp-server/index.ts](src/mcp-server/index.ts) mirrors the runtime
tool surface over stdio. It's not wired into the agent for MVP — the runner calls the
same handlers directly because MCP-over-HTTP on Vercel serverless is a trap for a 3-day
sprint. The scaffold is here so the tools can be externalized in POLISH.

## License

MIT — see [LICENSE](./LICENSE).
