-- Modules: capabilities a business has installed. Lets the agent grow with the
-- operator instead of dumping a full ERP on day one. The chat + protocolo
-- modules are baseline (always enabled). Everything else (valuacion,
-- lender_view, schedule, etc.) is opt-in: the agent suggests it during chat
-- and the user accepts.

create table if not exists business_modules (
  business_id uuid not null references businesses(id) on delete cascade,
  module_key text not null,
  status text not null default 'enabled' check (status in ('enabled', 'suggested', 'disabled')),
  enabled_at timestamptz,
  enabled_by text,
  config jsonb not null default '{}'::jsonb,
  primary key (business_id, module_key)
);
create index if not exists business_modules_status_idx on business_modules(business_id, status);
