-- Capataz MVP: portfolio + market feeds + composite scores + multi-mode projects.
-- Purely additive. Skeleton rows untouched.

-- 1. Mode on projects. construction = GC / site; inventory = warehouse / distributor.
alter table projects
  add column if not exists mode text not null default 'construction'
    check (mode in ('construction', 'inventory'));

-- 2. Canonical commodity feeds (cement, rebar, aggregates…) reusable across modes.
create table if not exists market_feeds (
  id uuid primary key default gen_random_uuid(),
  commodity_key text not null unique,
  display_name text not null,
  unit text not null,
  currency text not null default 'GTQ',
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

-- 3. Append-only price history for each feed.
create table if not exists price_snapshots (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references market_feeds(id) on delete cascade,
  price_gtq numeric(14,2) not null,
  snapshot_at timestamptz not null default now(),
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists price_snapshots_feed_time_idx
  on price_snapshots(feed_id, snapshot_at desc);

-- 4. Link budget_items to their market feed (nullable — mano_obra et al. have none).
--    Cache the current market unit cost on the row for cheap portfolio rendering.
alter table budget_items
  add column if not exists commodity_id uuid references market_feeds(id) on delete set null,
  add column if not exists market_unit_cost_gtq numeric(14,2),
  add column if not exists market_updated_at timestamptz;
create index if not exists budget_items_commodity_idx on budget_items(commodity_id);

-- 5. Append-only composite score history per project (Project Health / Collateral Readiness).
create table if not exists project_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  components jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  computed_by text not null default 'system'
);
create index if not exists project_scores_project_time_idx
  on project_scores(project_id, computed_at desc);
