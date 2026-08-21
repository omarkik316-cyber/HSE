-- Run in Supabase SQL Editor.
-- Makes "manager" a full peer of "admin" everywhere in the database, not
-- just in the app UI. Safe to run any number of times (every policy is
-- dropped before being recreated).
--
-- Run this AFTER add_manager_role_and_delete.sql / add_manager_create_observations.sql
-- (the 'manager' enum value must already exist).

-- =========================================================
-- 1. Manage users / change roles: ADMIN ONLY. Managers must NOT see the
--    /admin/users page or be able to change anyone's role/company — this
--    stays restricted to admin, unlike everything else in this file.
-- =========================================================
drop policy if exists "profiles_admin_update_any" on profiles;
create policy "profiles_admin_update_any" on profiles for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- =========================================================
-- 2. Zones: only admin/manager can create/edit/delete zones.
-- =========================================================
drop policy if exists "zones_admin_write" on zones;
create policy "zones_admin_write" on zones for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

-- =========================================================
-- 3. Observations: managers can update (not just create/delete) an
--    observation, same as admin, as long as it isn't already closed.
-- =========================================================
drop policy if exists "observations_update" on observations;
create policy "observations_update" on observations for update using (
  status <> 'closed'
  and exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('safety_officer', 'contractor', 'admin', 'manager')
  )
) with check (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('safety_officer', 'contractor', 'admin', 'manager')
  )
);

-- =========================================================
-- 4. Reopen a closed observation: managers get the same narrow exception
--    admins have (this is an additional permissive policy, combined with
--    the one above via OR — it doesn't loosen anything for other roles).
-- =========================================================
drop policy if exists "observations_admin_reopen" on observations;
create policy "observations_admin_reopen" on observations for update using (
  status = 'closed'
  and exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin', 'manager')
  )
) with check (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('admin', 'manager')
  )
);

-- =========================================================
-- 5. Admin broadcast templates: managers can create/edit/delete them too.
-- =========================================================
drop policy if exists "notification_templates_write" on notification_templates;
create policy "notification_templates_write" on notification_templates for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
) with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

-- =========================================================
-- Sanity check — look at the output: every row EXCEPT
-- 'profiles_admin_update_any' should mention 'manager' alongside 'admin'.
-- 'profiles_admin_update_any' should show admin only.
-- =========================================================
select tablename, policyname, cmd, qual, with_check
from pg_policies
where policyname in (
  'profiles_admin_update_any',
  'zones_admin_write',
  'observations_update',
  'observations_admin_reopen',
  'notification_templates_write'
);
