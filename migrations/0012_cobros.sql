-- 'cobros' module: per-customer credit ledger. One row per (business, customer).
-- Balance is the running unpaid amount in GTQ. Append-only history lives in
-- credit_ledger so we can reconstruct.

create table if not exists credit_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_name text not null,
  balance_gtq numeric(14,2) not null default 0,
  last_event_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, customer_name)
);
create index if not exists credit_accounts_business_idx
  on credit_accounts(business_id, balance_gtq desc);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references credit_accounts(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('charge', 'payment', 'adjustment')),
  amount_gtq numeric(14,2) not null,
  note text,
  event_id uuid references events(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_account_idx
  on credit_ledger(account_id, created_at desc);
