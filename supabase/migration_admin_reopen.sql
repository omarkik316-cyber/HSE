-- Run in Supabase SQL Editor (after migration_lock_closed_observations.sql).
--
-- Adds the one deliberate exception to "closed = frozen": an Admin can
-- reopen a closed observation from the app's new "🔓 Reopen" button. This
-- is a separate PERMISSIVE policy — Postgres combines multiple permissive
-- policies for the same command with OR — so it only ADDS a narrow path
-- for admins on already-closed rows; it doesn't loosen the existing lock
-- for any other role, and non-admins still have no update path into a
-- closed row at all.

create policy "observations_admin_reopen" on observations for update using (
  status = 'closed'
  and exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'admin'
  )
) with check (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role = 'admin'
  )
);
