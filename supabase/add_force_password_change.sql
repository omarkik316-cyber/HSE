-- Run in Supabase SQL Editor.
-- Supports the "admin resets a forgotten password" flow:
--   1. Someone forgets their password and contacts an admin.
--   2. The admin hits "Reset password" for that user (admin/users page),
--      which calls the admin-reset-password Edge Function. It sets a
--      random temporary password on the auth user AND flips this flag on.
--   3. The admin reads the temporary password to the user.
--   4. The user signs in with it. Because this flag is true, the app sends
--      them straight to /change-password instead of the dashboard, where
--      they must set their own new password (entered twice to confirm).
--      Successfully doing so flips this flag back off.
--
-- Safe to run more than once.

alter table profiles
  add column if not exists force_password_change boolean not null default false;

-- profiles_update_own (auth.uid() = id, no column restriction) already lets
-- a signed-in user flip their own force_password_change back to false once
-- they've set a new password — no new policy needed for that.
--
-- Setting it TRUE only ever happens from the admin-reset-password Edge
-- Function, which runs with the service-role key and so bypasses RLS
-- entirely — it does not rely on profiles_admin_update_any.
