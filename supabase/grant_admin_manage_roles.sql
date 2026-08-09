-- Run in Supabase SQL Editor.
-- Without this, only a user can edit their OWN profile row — an admin has
-- no way to change someone else's role, which is exactly what the new
-- /admin/users page needs to do.

create policy "profiles_admin_update_any" on profiles
for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
