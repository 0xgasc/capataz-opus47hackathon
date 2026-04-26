alter table businesses
  add column if not exists magic_token uuid not null default gen_random_uuid();

create unique index if not exists businesses_magic_token_idx on businesses(magic_token);
