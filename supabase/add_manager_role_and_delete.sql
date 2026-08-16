-- Run in Supabase SQL Editor.
-- Adds a new "manager" role, and grants both admin and manager the
-- ability to permanently delete an observation (and, via cascade, its
-- photos and comments).

-- =========================================================
-- 1. Add the new role to the enum
-- =========================================================
-- NOTE: run this statement ON ITS OWN first (select it and hit Run by
-- itself), then run the rest below in a second query. Postgres won't let
-- a freshly-added enum value be used later in the very same transaction/
-- script, so splitting it into two steps avoids a
-- "unsafe use of new value of enum type" error.
alter type user_role add value if not exists 'manager';

-- =========================================================
-- 2. Delete policies — admin and manager only.
--    Observations previously had no delete policy at all (only select/
--    insert/update), so nobody could delete one from the app before this.
-- =========================================================
create policy "observations_delete" on observations for delete using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

-- Deleting an observation cascades (on delete cascade) to its photos and
-- comments — but a cascade delete still has to pass RLS on those child
-- tables, so they need their own delete policy too or the whole delete
-- will fail with a permission error.
create policy "photos_delete" on observation_photos for delete using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);

create policy "comments_delete" on observation_comments for delete using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'manager'))
);
