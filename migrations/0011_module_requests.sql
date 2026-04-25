-- Free-form module / capability requests from operators. Opus reads each one,
-- decides if it matches an existing catalog entry (then suggests installing it),
-- or logs the request as 'queued' for the platform team. Visible on the
-- dashboard so the user knows their ask was registered.

create table if not exists module_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_message text not null,
  agent_reply text,
  status text not null default 'queued' check (status in ('queued', 'matched', 'installed', 'declined', 'in_review', 'shipped')),
  matched_module_key text,
  created_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists module_requests_business_status_idx
  on module_requests(business_id, status, created_at desc);
