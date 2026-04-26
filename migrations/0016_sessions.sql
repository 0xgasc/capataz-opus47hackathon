alter table businesses
  add column if not exists session_id text;

create index if not exists businesses_session_id_idx on businesses(session_id);
