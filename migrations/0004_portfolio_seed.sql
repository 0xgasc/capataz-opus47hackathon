-- Capataz MVP seed: commodity feeds, initial price snapshots ~5-8% above the
-- construction project's budget unit costs (so market drift shows something for
-- the demo), a second project in inventory mode reusing the same feeds, and
-- initial composite scores.

do $$
declare
  v_construction_id uuid;
  v_inventory_id    uuid;
  v_cemento_id uuid;
  v_varilla4_id uuid;
  v_block_id   uuid;
  v_arena_id   uuid;
  v_piedrin_id uuid;
begin
  -- Idempotent reset of seeded portfolio-layer rows only.
  delete from project_scores;
  delete from price_snapshots;
  delete from market_feeds;
  delete from anomalies;
  delete from agent_runs;
  delete from events;
  delete from budget_items;
  delete from suppliers;
  delete from projects;

  -- ---- Market feeds ----------------------------------------------------------
  insert into market_feeds (commodity_key, display_name, unit, currency, source) values
    ('cemento_ugc_42_5',      'Cemento gris UGC 42.5 (saco 42.5kg)', 'saco',    'GTQ', 'manual'),
    ('varilla_4_g40',         'Varilla corrugada #4 grado 40',       'varilla', 'GTQ', 'manual'),
    ('block_pomez_15_20_40',  'Block pómez 15x20x40',                'unidad',  'GTQ', 'manual'),
    ('arena_amarilla',        'Arena amarilla lavada',               'm3',      'GTQ', 'manual'),
    ('piedrin_3_4',           'Piedrín 3/4"',                        'm3',      'GTQ', 'manual');

  select id into v_cemento_id   from market_feeds where commodity_key = 'cemento_ugc_42_5';
  select id into v_varilla4_id  from market_feeds where commodity_key = 'varilla_4_g40';
  select id into v_block_id     from market_feeds where commodity_key = 'block_pomez_15_20_40';
  select id into v_arena_id     from market_feeds where commodity_key = 'arena_amarilla';
  select id into v_piedrin_id   from market_feeds where commodity_key = 'piedrin_3_4';

  -- Initial snapshots. Prices drift 5-10% above skeleton budget unit costs so the
  -- demo can point at positive drift out of the gate. A second, earlier snapshot
  -- lets us show a timeline in POLISH.
  insert into price_snapshots (feed_id, price_gtq, snapshot_at, source) values
    (v_cemento_id,  100.00, now() - interval '7 days', 'manual'),
    (v_cemento_id,  102.50, now() - interval '1 day',  'manual'),
    (v_varilla4_id, 152.00, now() - interval '7 days', 'manual'),
    (v_varilla4_id, 155.00, now() - interval '1 day',  'manual'),
    (v_block_id,      7.10, now() - interval '7 days', 'manual'),
    (v_block_id,      7.25, now() - interval '1 day',  'manual'),
    (v_arena_id,    192.00, now() - interval '7 days', 'manual'),
    (v_arena_id,    195.00, now() - interval '1 day',  'manual'),
    (v_piedrin_id,  232.00, now() - interval '7 days', 'manual'),
    (v_piedrin_id,  238.00, now() - interval '1 day',  'manual');

  -- ---- Suppliers (shared across both modes) ---------------------------------
  insert into suppliers (name, telegram_handle, categories) values
    ('Cementos del Valle',        '@cementosdelvalle',  array['cemento','mortero']),
    ('Ferretería La Escuadra',    '@laescuadragt',      array['acero','herramienta','ferreteria']),
    ('Materiales San Cristóbal',  '@materialessancris', array['agregados','mamposteria','acabados']);

  -- ===========================================================================
  -- PROJECT 1: construction — "Villa Nueva Fase 2"
  -- ===========================================================================
  insert into projects (name, client, total_budget_gtq, start_date, mode)
  values ('Construcción Residencial Villa Nueva Fase 2', 'Inversiones Cardales S.A.', 1850000.00, '2026-02-10', 'construction')
  returning id into v_construction_id;

  insert into budget_items
    (project_id, category, description, qty, unit, unit_cost_gtq, spent_gtq, commodity_id, market_unit_cost_gtq, market_updated_at) values
    (v_construction_id, 'cemento',     'Cemento gris UGC 42.5 saco 42.5kg',     1200, 'saco',     95.00,  0, v_cemento_id,  102.50, now()),
    (v_construction_id, 'acero',       'Varilla corrugada #4 grado 40',          850, 'varilla', 145.00,  0, v_varilla4_id, 155.00, now()),
    (v_construction_id, 'acero',       'Varilla corrugada #3 grado 40',          620, 'varilla',  95.00,  0, null,            null, null),
    (v_construction_id, 'mamposteria', 'Block pómez 15x20x40',                 15000, 'unidad',    6.75,  0, v_block_id,      7.25, now()),
    (v_construction_id, 'agregados',   'Arena amarilla lavada',                   80, 'm3',      180.00,  0, v_arena_id,    195.00, now()),
    (v_construction_id, 'agregados',   'Piedrín 3/4"',                            65, 'm3',      220.00,  0, v_piedrin_id,  238.00, now()),
    (v_construction_id, 'agregados',   'Selecto compactado',                      90, 'm3',      145.00,  0, null,            null, null),
    (v_construction_id, 'acabados',    'Mezcla fina repello saco 40kg',          400, 'saco',     68.00,  0, null,            null, null),
    (v_construction_id, 'acabados',    'Piso cerámico 45x45 antideslizante',     520, 'm2',       85.00,  0, null,            null, null),
    (v_construction_id, 'mano_obra',   'Jornal albañil maestro',                 180, 'jornal',  250.00,  0, null,            null, null),
    (v_construction_id, 'mano_obra',   'Jornal ayudante',                        320, 'jornal',  125.00,  0, null,            null, null);

  -- ===========================================================================
  -- PROJECT 2: inventory — "Distribuidora Centroamericana, Bodega Zona 12"
  -- Positions in the same commodity feeds, different qty + avg cost basis.
  -- ===========================================================================
  insert into projects (name, client, total_budget_gtq, start_date, mode)
  values ('Distribuidora Centroamericana — Bodega Zona 12', null, 850000.00, '2025-09-01', 'inventory')
  returning id into v_inventory_id;

  insert into budget_items
    (project_id, category, description, qty, unit, unit_cost_gtq, spent_gtq, commodity_id, market_unit_cost_gtq, market_updated_at) values
    (v_inventory_id, 'cemento',     'Cemento gris UGC 42.5 saco 42.5kg',      850, 'saco',     92.00,  0, v_cemento_id,  102.50, now()),
    (v_inventory_id, 'acero',       'Varilla corrugada #4 grado 40',          320, 'varilla', 140.00,  0, v_varilla4_id, 155.00, now()),
    (v_inventory_id, 'acero',       'Varilla corrugada #3 grado 40',          280, 'varilla',  92.00,  0, null,            null, null),
    (v_inventory_id, 'mamposteria', 'Block pómez 15x20x40',                 22000, 'unidad',    6.50,  0, v_block_id,      7.25, now()),
    (v_inventory_id, 'agregados',   'Arena amarilla lavada',                   45, 'm3',      170.00,  0, v_arena_id,    195.00, now()),
    (v_inventory_id, 'agregados',   'Piedrín 3/4"',                            38, 'm3',      210.00,  0, v_piedrin_id,  238.00, now()),
    (v_inventory_id, 'acabados',    'Alambre de amarre recocido rollo 18kg',   120, 'rollo',  185.00,  0, null,            null, null),
    (v_inventory_id, 'acabados',    'Clavo de acero 2" caja 25lb',              60, 'caja',    260.00,  0, null,            null, null);

  -- Seed one baseline score per project (the runner will keep appending).
  insert into project_scores (project_id, score, components, computed_by) values
    (v_construction_id, 82, '{"budget_variance": 22, "market_drift": 24, "anomaly_rate": 24, "activity_freshness": 12}'::jsonb, 'seed'),
    (v_inventory_id,    88, '{"budget_variance": 25, "market_drift": 25, "anomaly_rate": 24, "activity_freshness": 14}'::jsonb, 'seed');
end $$;
