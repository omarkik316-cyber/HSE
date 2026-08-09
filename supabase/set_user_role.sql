-- =========================================================
-- Manually set / fix the role for a phone-registered user
-- Run in Supabase SQL Editor
-- =========================================================

-- STEP 1: Find the user's ID from their phone number.
-- Replace the phone number with the real one, in international format
-- (no spaces, starts with +966 for Saudi numbers).
select id, phone, created_at
from auth.users
where phone = '+966512345678';

-- Copy the "id" (a UUID) from the result above, then use it in STEP 2.

-- STEP 2: Create the profile row if it's missing, or update the role if
-- it already exists. Replace both the UUID and the role as needed.
-- Valid roles: 'safety_officer' | 'consultant' | 'contractor' | 'admin'
insert into public.profiles (id, full_name, role, phone)
values (
  'PASTE-THE-UUID-FROM-STEP-1-HERE',
  'Test Safety Officer',   -- display name
  'safety_officer',        -- role
  '+966512345678'
)
on conflict (id) do update
set role = excluded.role,
    full_name = excluded.full_name;

-- STEP 3 (optional): Verify it worked.
select id, full_name, role, phone from public.profiles where phone = '+966512345678';
