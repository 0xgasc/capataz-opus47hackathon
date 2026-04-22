# Capataz — tonight's test plan

Live: https://capataz-web-production.up.railway.app
Source: this repo, `main` branch.
Dashboards: `/dashboard/construction` · `/dashboard/inventory`.

## Pre-flight (30 seconds)

```bash
cd /Users/gs/Desktop/capataz-opus47hackathon
git pull                                  # grab any polish commits I push
set -a && . ./.env.local && set +a        # loads DATABASE_URL, ANTHROPIC_API_KEY, GROQ_API_KEY
export CAPATAZ_BASE=https://capataz-web-production.up.railway.app
export ADMIN_SECRET=9eaa6d97d9a93c3bf002a9db27ad3112f282fda83ed7628e
```

If you want to run everything against localhost instead:

```bash
pnpm dev &                                # terminal 1
export CAPATAZ_BASE=http://localhost:3000  # terminal 2
```

## Core journeys

Mark each box as you finish. Anything you hit that looks off: note the event_id printed by the
demo script, I can trace it from there.

### A — Construction mode, happy path

- [ ] A1. Open `$CAPATAZ_BASE/dashboard/construction`. Verify header shows
      *"Construcción Residencial Villa Nueva Fase 2"* with a Project Health score, a
      presupuesto card with positive drift, and a portfolio chip row.
- [ ] A2. `pnpm demo:reset && pnpm demo:1`. Printed `score: 100/100`, tools
      `query_project_state → log_event → recompute_score`.
- [ ] A3. Refresh the dashboard within ~5s. The new event card shows:
      - `texto` + `opus: ok` badges
      - your cURL-sent text
      - emerald summary line with supplier / amount / movement_type parsed
      - `herramientas: query_project_state · log_event · recompute_score`
- [ ] A4. Click the event card (if the `/runs/:id` inspector is shipped) → see the full tool
      trace with inputs/results.
- [ ] A5. Anomalies column still empty. Budget portfolio chips unchanged.

### B — Construction, anomaly detection

- [ ] B1. `pnpm demo:2`. Expect `score: 79–90`, 2 anomalies, tool trace including
      `flag_anomaly × 2 → recompute_score → reply_in_chat`.
- [ ] B2. Dashboard shows two amber anomaly cards: `off_hours` and `unknown_supplier`
      with Spanish messages.
- [ ] B3. Score tile dropped below 100.
- [ ] B4. Agent's Spanish summary is visible and calls out *both* issues.

### C — Market shock (admin API)

- [ ] C1. `pnpm demo:3`. Check the printed `admin/prices →` result — two snapshots
      inserted, `budget_items_updated: 2` each.
- [ ] C2. Refresh dashboard: portfolio chips for `cemento` and `acero` turn greener
      (market above cost basis); overall drift grows in the presupuesto card.
- [ ] C3. The follow-up event's summary reflects that Opus saw new prices
      (`query_project_state` returns them).

### D — Mode switch, inventory dashboard

- [ ] D1. Click **Inventario** pill in the header. URL becomes `/dashboard/inventory`.
- [ ] D2. Header label reads *Collateral Readiness*, portfolio heading reads
      *"Portafolio (mercado vs. costo base)"*, timeline heading reads *"Movimientos de bodega"*.
- [ ] D3. Project name: *Distribuidora Centroamericana — Bodega Zona 12*.
- [ ] D4. `pnpm demo:4` (inventory sale). Event logged as `movement_type: stock_out`,
      `counterparty: Constructora Progreso`, score stays ~100.
- [ ] D5. `pnpm demo:5` (shrinkage). HIGH anomaly shows up with Spanish copy calling out
      GTQ value at cost basis. Score drops.

### E.1 — Landing page + navigation

- [ ] Open `$CAPATAZ_BASE/` — landing page renders with two mode cards (Construcción
      + Inventarios). Each card click-throughs to the matching dashboard.
- [ ] Browser tab title says *"Capataz"*, not "Create Next App".
- [ ] `html lang` is `es` (view source).

### E.2 — Run inspector

- [ ] From any dashboard, click an event card. URL goes to `/runs/<event_id>`.
- [ ] Page shows event payload, reporter, time, raw payload toggle.
- [ ] If agent has run: see the Spanish summary, runner badge (`managed_sessions` in
      prod), `sesn_*` Session ID, `agent_*` Agent ID, stop reason, token usage.
- [ ] Every tool call is listed with its full input JSON and result JSON.
- [ ] Anomalies section shows severity + Spanish message if any.
- [ ] Breadcrumb "← volver al panel" returns to the correct mode dashboard.

### E.3 — Score trend

- [ ] Run `pnpm demo:1` then `pnpm demo:2` back-to-back.
- [ ] Score card shows the big number, and next to it a small `▲` or `▼` with the
      delta vs. the previous score (e.g. `▼ 14` after the anomaly run).

### E — Audit trail / agent replay

- [ ] E1. `pnpm exec tsx scripts/inspect-run.ts 5`. Expect the last 5 runs printed with:
      - `runner: managed_sessions` (since `USE_MANAGED_AGENTS=true` is set in prod)
      - real `session_id` like `sesn_011...`
      - real `agent_id` like `agent_011...`
      - ordered tool trace
- [ ] E2. Copy any session_id and paste at Anthropic console
      `https://platform.claude.com/workspaces/default/sessions/<id>` — it should resolve to
      the real session you just ran.

### F — Voice note path (optional, needs you to record one)

Skip if you're not demoing voice. Otherwise:

- [ ] F1. From your phone, send a Spanish voice note to the bot. (Requires
      `TELEGRAM_BOT_TOKEN` set in prod — currently empty, so skip unless you wire it.)
- [ ] F2. Alternative: drop a small OGG voice file into a manual curl payload. Watch
      the agent_run log show a `transcription` block with Groq-Whisper text.

## Regression traps to watch

- **Degraded status**: if any agent_run shows `status: degraded`, prod lost its
  `ANTHROPIC_API_KEY`. Fix with `railway variables --service capataz-web --set 'ANTHROPIC_API_KEY=...'`.
- **Empty summary**: could mean the stream ended on `retries_exhausted`. Re-run once;
  if it persists, flip `USE_MANAGED_AGENTS=false` and it'll fall back to the messages+tools
  runner automatically.
- **Stale cache on Managed Agents**: Environment/Agent IDs are cached per-process. If
  you make changes to `toolDefinitions` or the system prompt, force a redeploy so
  prod re-creates them.
- **Dashboard stuck**: it auto-refreshes every 5s. If a page shows "cargando…" forever,
  reload once — likely a Railway cold start.

## Reset / clean slate

```bash
pnpm demo:reset                           # wipes events + runs + anomalies + non-seed prices
# (keeps projects, budget_items, suppliers, market_feeds, baseline scores)
```

## If something breaks

Paste the event_id and the failing screen/output into a message. I'll trace through
`agent_runs.input` (full payload + session_id) and `agent_runs.output` (full tool trace)
to diagnose. Everything is in Railway Postgres, nothing is ephemeral.
