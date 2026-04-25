-- Per-business recurring task / playbook. Generated during onboarding by Opus,
-- mutated by the agent (complete_task / upsert_task tools), surfaced on the
-- dashboard as the "Protocolo" card. This is the bespoke-per-business artifact —
-- the same UI shape, different content for each tenant because Opus wrote it.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  title text not null,
  detail text,
  cadence text not null check (cadence in ('daily', 'weekly', 'monthly', 'as_needed', 'one_off')),
  category text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'snoozed')),
  last_completed_at timestamptz,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_business_status_idx on tasks(business_id, status);
create index if not exists tasks_business_cadence_idx on tasks(business_id, cadence);
