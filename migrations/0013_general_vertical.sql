-- Broaden 'vertical' to include 'general' — for households, churches, clubs,
-- families, personal projects, anything with a routine that isn't a business.

alter table businesses drop constraint if exists businesses_vertical_check;
alter table businesses add constraint businesses_vertical_check
  check (vertical in ('construction', 'inventory', 'tiendita', 'general'));
