-- HITL (human-in-the-loop) requests. When the agent isn't sure how to proceed
-- — ambiguous data, edge case, missing domain knowledge — it can call
-- 'request_human_guidance' instead of guessing. The request surfaces as a
-- special bubble in the operator's chat. The operator answers; the next agent
-- run picks up that answer as context.

create table if not exists agent_hitl_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  event_id uuid references events(id) on delete set null,
  question text not null,
  context_summary text,
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high')),
  status text not null default 'open' check (status in ('open', 'answered', 'dismissed')),
  human_response text,
  asked_by_model text,
  asked_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists agent_hitl_business_status_idx
  on agent_hitl_requests(business_id, status, asked_at desc);
