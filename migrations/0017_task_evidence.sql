alter table tasks
  add column if not exists evidence_required text check (evidence_required in ('photo','note','any'));
