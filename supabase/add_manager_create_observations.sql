-- Run in Supabase SQL Editor.
-- Adds "manager" to the observations_insert policy — previously only
-- safety_officer, consultant, and admin could create a new observation,
-- so a manager saw the "+" / map-click UI but every attempt failed with a
-- permission error from Supabase (the RLS check on insert rejected it).
-- Safe to run more than once (drops the policy first).

drop policy if exists "observations_insert" on observations;
create policy "observations_insert" on observations for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('safety_officer', 'consultant', 'admin', 'manager'))
);

-- Sanity check — should show 4 roles including manager.
select polname, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polname = 'observations_insert';
