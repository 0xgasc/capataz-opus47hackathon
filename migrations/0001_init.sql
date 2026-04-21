-- Capataz skeleton schema. RLS intentionally disabled for skeleton phase.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  total_budget_gtq numeric(14,2) not null default 0,
  start_date date,
  created_at timestamptz not null default now()
);

create table if not exists budget_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  category text,
  description text not null,
  qty numeric(14,2) not null default 0,
  unit text,
  unit_cost_gtq numeric(14,2) not null default 0,
  spent_gtq numeric(14,2) not null default 0
);
create index if not exists budget_items_project_idx on budget_items(project_id);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  telegram_handle text,
  categories text[] not null default '{}'
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  telegram_msg_id text,
  media_url text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists events_project_created_idx on events(project_id, created_at desc);
create index if not exists events_created_idx on events(created_at desc);

create table if not exists anomalies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  kind text not null,
  severity text not null,
  status text not null default 'open',
  agent_message text,
  created_at timestamptz not null default now()
);
create index if not exists anomalies_project_status_idx on anomalies(project_id, status);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  status text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists agent_runs_event_idx on agent_runs(event_id);
