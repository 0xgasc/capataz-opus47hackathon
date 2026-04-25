-- Capataz extended vision: tenant model. A `business` owns one or more projects,
-- has its own Anthropic Agent + Session for memory continuity, and is the unit of
-- onboarding (the /onboard chat creates one) and proactive check-ins (cron loops
-- over businesses).

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  vertical text not null check (vertical in ('construction', 'inventory', 'tiendita')),
  owner_name text,
  owner_email text,
  telegram_chat_id text,
  description text,
  -- Cached Anthropic Managed Agents identifiers. The runner lazy-creates them.
  anthropic_agent_id text,
  anthropic_session_id text,
  created_at timestamptz not null default now()
);

alter table projects
  add column if not exists business_id uuid references businesses(id) on delete cascade;
create index if not exists projects_business_idx on projects(business_id);

-- Append-only log of proactive nudges fired by the cron worker. Each row corresponds
-- to one Haiku-driven check-in run; status moves pending -> sent | skipped | error.
create table if not exists agent_check_ins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  intent text not null default 'nudge',
  status text not null default 'pending',
  message text,
  output jsonb,
  scheduled_for timestamptz not null default now(),
  fired_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_check_ins_business_idx on agent_check_ins(business_id, created_at desc);
