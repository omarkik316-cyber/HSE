-- Run this in Supabase SQL Editor if you already ran schema.sql before.
-- It upgrades due_date from a plain DATE to a DATE+TIME (timestamptz) field.

-- 1. Drop the view FIRST — it depends on due_date's column type, so it
--    must go before the ALTER COLUMN, not after.
drop view if exists overdue_observations;

-- 2. Now the column is free to change type.
alter table observations
  alter column due_date type timestamptz using due_date::timestamptz;

-- 3. Recreate the view with the new time-aware logic.
create view overdue_observations as
select
  o.*,
  extract(day from (now() - o.due_date))::int as days_overdue
from observations o
where o.status in ('open', 'in_progress')
  and o.due_date is not null
  and o.due_date < now();
