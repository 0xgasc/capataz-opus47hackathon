# Capataz

**Built with Opus 4.7 — hackathon submission.**

Capataz is a Claude-powered ambient agent that lives inside a Telegram group used by a
construction project team in Guatemala. It ingests voice notes and receipt photos from
foremen, reconstructs structured project state, and surfaces anomalies to the project
manager through a bilingual (ES/EN) web dashboard.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind) — _project spec called for Next 15;
  `create-next-app@latest` now ships 16.2.x. Behavior is compatible for the skeleton._
- Supabase (Postgres + Storage)
- Telegram Bot API
- Anthropic SDK, model `claude-opus-4-7`
- Claude Managed Agents (beta header `managed-agents-2026-04-01`) — stubbed in skeleton
- MCP server (TypeScript) — stubbed in skeleton
- Deployed on Vercel

## Phases

- **SKELETON** — every wire connected, nothing is smart. Stubs everywhere.
- **MVP** — real transcription, vision, managed agents, MCP tools.
- **POLISH** — UI polish, realtime, RLS, demo script.

We are currently in **SKELETON**.

## Skeleton sanity-check checklist

- [ ] Send a text to the bot → appears in `events` table
- [ ] Bot replies "recibido ✓"
- [ ] Dashboard shows the event within 5s
- [ ] `agent_runs` row exists for the event (with stub output)
- [ ] Send a voice note → logged with type='voice_note' and file_id stored

## License

MIT — see [LICENSE](./LICENSE).
