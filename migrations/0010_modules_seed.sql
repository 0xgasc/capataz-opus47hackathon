-- Seed the baseline modules for every existing business: chat + protocolo enabled,
-- valuacion + lender_view suggested (the agent will offer to activate them in chat).

do $$
declare
  b record;
begin
  for b in select id from businesses loop
    insert into business_modules (business_id, module_key, status, enabled_at, enabled_by)
    values
      (b.id, 'chat',       'enabled',   now(), 'seed'),
      (b.id, 'protocolo',  'enabled',   now(), 'seed'),
      (b.id, 'valuacion',  'suggested', null,  null),
      (b.id, 'lender_view','suggested', null,  null)
    on conflict (business_id, module_key) do nothing;
  end loop;
end $$;
