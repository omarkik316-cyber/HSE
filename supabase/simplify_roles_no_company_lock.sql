-- Run in Supabase SQL Editor.
-- Simplifies the permission model to match how the team actually works:
--   - Everyone (any signed-in role) can SEE every observation. No more
--     "contractor only sees their own company" restriction.
--   - Safety Officers, Consultants, and Admins can all CREATE observations.
--   - Safety Officers, Contractors, and Admins can all UPDATE/close them.
--     (Consultants raise observations but don't close them.)

drop policy if exists "observations_select" on observations;
drop policy if exists "observations_insert" on observations;
drop policy if exists "observations_update" on observations;

-- Anyone signed in with a profile can see every observation.
create policy "observations_select" on observations for select using (
  auth.role() = 'authenticated'
);

-- Safety officers, consultants, and admins can raise new observations.
create policy "observations_insert" on observations for insert with check (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('safety_officer', 'consultant', 'admin')
  )
);

-- Safety officers, contractors, and admins can update status / close them.
create policy "observations_update" on observations for update using (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('safety_officer', 'contractor', 'admin')
  )
);
