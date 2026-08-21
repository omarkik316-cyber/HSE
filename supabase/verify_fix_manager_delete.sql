-- Run in Supabase SQL Editor.
-- Safe to run any number of times (won't error if things already exist).
-- Confirms/fixes everything needed for the "manager" role to be able to
-- delete any observation, same as admin.

-- =========================================================
-- 1. Make sure 'manager' is actually a valid value on the enum.
--    IMPORTANT: run ONLY this next line first, by itself (select it and
--    hit Run alone), THEN run the rest of the file in a second query.
--    Postgres won't allow a brand-new enum value to be used later in the
--    very same transaction/script.
-- =========================================================
alter type user_role add value if not exists 'manager';

-- =========================================================
-- 2. Recreate the delete policies safely (drop first so re-running this
--    never errors with "policy already exists").
-- =========================================================
drop policy if exists "observations_delete" on observations;
create policy "observations_delete" on observations for delete using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

drop policy if exists "photos_delete" on observation_photos;
create policy "photos_delete" on observation_photos for delete using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

drop policy if exists "comments_delete" on observation_comments;
create policy "comments_delete" on observation_comments for delete using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

-- =========================================================
-- 3. Sanity check — run this last and look at the output:
--    - The enum_range row should list 'manager' among the values.
--    - The policies row should show 3 rows, one per table above.
-- =========================================================
select enum_range(null::user_role) as all_role_values;

select schemaname, tablename, policyname, cmd
from pg_policies
where policyname in ('observations_delete', 'photos_delete', 'comments_delete');
