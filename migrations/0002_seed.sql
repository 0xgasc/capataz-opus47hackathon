-- Capataz skeleton seed. Fictional data only. GTQ amounts are rough market-adjacent estimates.

do $$
declare
  v_project_id uuid;
begin
  -- wipe any existing skeleton seed
  delete from anomalies;
  delete from agent_runs;
  delete from events;
  delete from budget_items;
  delete from suppliers;
  delete from projects where name = 'Construcción Residencial Villa Nueva Fase 2';

  insert into projects (name, client, total_budget_gtq, start_date)
  values ('Construcción Residencial Villa Nueva Fase 2', 'Inversiones Cardales S.A.', 1850000.00, '2026-02-10')
  returning id into v_project_id;

  insert into budget_items (project_id, category, description, qty, unit, unit_cost_gtq, spent_gtq) values
    (v_project_id, 'cemento',     'Cemento gris UGC 42.5 saco 42.5kg',     1200, 'saco',     95.00,  0),
    (v_project_id, 'acero',       'Varilla corrugada #4 grado 40',          850, 'varilla', 145.00,  0),
    (v_project_id, 'acero',       'Varilla corrugada #3 grado 40',          620, 'varilla',  95.00,  0),
    (v_project_id, 'mamposteria', 'Block pómez 15x20x40',                 15000, 'unidad',    6.75,  0),
    (v_project_id, 'agregados',   'Arena amarilla lavada',                   80, 'm3',      180.00,  0),
    (v_project_id, 'agregados',   'Piedrín 3/4"',                            65, 'm3',      220.00,  0),
    (v_project_id, 'agregados',   'Selecto compactado',                      90, 'm3',      145.00,  0),
    (v_project_id, 'acabados',    'Mezcla fina repello saco 40kg',          400, 'saco',     68.00,  0),
    (v_project_id, 'acabados',    'Piso cerámico 45x45 antideslizante',     520, 'm2',       85.00,  0),
    (v_project_id, 'mano_obra',   'Jornal albañil maestro',                 180, 'jornal',  250.00,  0),
    (v_project_id, 'mano_obra',   'Jornal ayudante',                        320, 'jornal',  125.00,  0);

  insert into suppliers (name, telegram_handle, categories) values
    ('Cementos del Valle',        '@cementosdelvalle',  array['cemento','mortero']),
    ('Ferretería La Escuadra',    '@laescuadragt',      array['acero','herramienta','ferreteria']),
    ('Materiales San Cristóbal',  '@materialessancris', array['agregados','mamposteria','acabados']);
end $$;
