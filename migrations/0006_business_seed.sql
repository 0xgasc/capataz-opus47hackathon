-- Backfill the two skeleton/MVP projects under businesses (so they get the new
-- tenant features), then add a third business (Tiendita Doña Marta) with its own
-- project + items so the platform thesis demos with three live verticals.

do $$
declare
  v_construction_proj uuid;
  v_inventory_proj uuid;
  v_construction_biz uuid;
  v_inventory_biz uuid;
  v_tiendita_biz uuid;
  v_tiendita_proj uuid;
begin
  -- Wipe businesses (and any prior tiendita rows) so this migration is idempotent.
  delete from businesses;
  delete from projects where mode = 'tiendita' or name like 'Tiendita Doña Marta%';

  -- Existing two seeded projects become businesses.
  select id into v_construction_proj from projects where mode = 'construction' order by created_at asc limit 1;
  select id into v_inventory_proj    from projects where mode = 'inventory'    order by created_at asc limit 1;

  insert into businesses (slug, name, vertical, owner_name, telegram_chat_id, description) values
    ('villa-nueva',
     'Villa Nueva Fase 2 — Don Beto',
     'construction',
     'Don Beto',
     '12345',
     'Obra residencial fase 2, gerenciada por Inversiones Cardales S.A. Don Beto es el capataz del proyecto.')
  returning id into v_construction_biz;

  insert into businesses (slug, name, vertical, owner_name, telegram_chat_id, description) values
    ('distribuidora-zona-12',
     'Distribuidora Centroamericana — Doña Marta',
     'inventory',
     'Doña Marta',
     '55555',
     'Bodega Zona 12. Inventario actúa como colateral de un préstamo de capital de trabajo.')
  returning id into v_inventory_biz;

  update projects set business_id = v_construction_biz where id = v_construction_proj;
  update projects set business_id = v_inventory_biz   where id = v_inventory_proj;

  -- New tiendita business + project.
  insert into businesses (slug, name, vertical, owner_name, telegram_chat_id, description) values
    ('tiendita-zona-7',
     'Tiendita Doña Marta — Zona 7',
     'tiendita',
     'Doña Marta',
     '77777',
     'Tienda de barrio en Zona 7 de la capital. Doña Marta atiende sola, vende abarrotes y bebidas.')
  returning id into v_tiendita_biz;

  -- Allow the 'tiendita' mode value on projects (extends the check constraint).
  alter table projects drop constraint if exists projects_mode_check;
  -- (no replacement constraint here — vertical is now the source of truth on businesses)

  insert into projects (name, client, total_budget_gtq, start_date, mode, business_id) values
    ('Tiendita Doña Marta — operación diaria', null, 12500.00, '2025-11-15', 'tiendita', v_tiendita_biz)
  returning id into v_tiendita_proj;

  -- Tiendita "budget items" = stock on hand. qty = current count, unit_cost_gtq = cost,
  -- market_unit_cost_gtq stays null (no commodity feed needed for a corner store).
  insert into budget_items
    (project_id, category, description, qty, unit, unit_cost_gtq, spent_gtq) values
    (v_tiendita_proj, 'huevos',     'Huevo mediano (unidad)',                420, 'unidad', 1.50, 0),
    (v_tiendita_proj, 'granos',     'Frijol negro libra a granel',            38, 'libra',  7.00, 0),
    (v_tiendita_proj, 'granos',     'Azúcar blanca libra',                    52, 'libra',  5.50, 0),
    (v_tiendita_proj, 'panaderia',  'Tortilla maíz (paquete 25u)',            18, 'paquete',8.00, 0),
    (v_tiendita_proj, 'bebidas',    'Gaseosa 600ml',                          96, 'unidad', 6.50, 0),
    (v_tiendita_proj, 'bebidas',    'Atol shuco (vaso 350ml)',                24, 'vaso',   3.50, 0),
    (v_tiendita_proj, 'bebidas',    'Cerveza nacional lata',                  72, 'unidad', 8.00, 0),
    (v_tiendita_proj, 'limpieza',   'Detergente bolsa pequeña',               34, 'bolsa',  4.50, 0),
    (v_tiendita_proj, 'snacks',     'Chicharrones bolsa pequeña',             40, 'bolsa',  3.00, 0);

  -- Baseline score for the tiendita.
  insert into project_scores (project_id, score, components, computed_by) values
    (v_tiendita_proj, 85, '{"budget_variance": 24, "market_drift": 25, "anomaly_rate": 25, "activity_freshness": 11}'::jsonb, 'seed');
end $$;
