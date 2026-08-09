-- Run in Supabase SQL Editor.
--
-- Makes a closed (archived) observation truly immutable at the database
-- level — not just hidden in the UI. Once status = 'closed':
--   - The observation row itself can no longer be updated by ANYONE,
--     including Admin (no re-editing title/priority/etc, no reopening).
--   - No new free-text notes can be added to its activity log.
--   - No new photos can be attached to it.
-- The one exception is the automatic "status changed to closed" log
-- entry, which is written immediately AFTER the row flips to closed as
-- part of the closing action itself — that one is still allowed through.

drop policy if exists "observations_update" on observations;
drop policy if exists "photos_insert" on observation_photos;
drop policy if exists "comments_insert" on observation_comments;

-- Safety officers, contractors, and admins can update an observation ONLY
-- while it isn't already closed. Closing it (setting status = 'closed')
-- is still allowed — the restriction is on rows that are ALREADY closed.
create policy "observations_update" on observations for update using (
  status <> 'closed'
  and exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('safety_officer', 'contractor', 'admin')
  )
) with check (
  exists (
    select 1 from profiles
    where id = auth.uid()
    and role in ('safety_officer', 'contractor', 'admin')
  )
);

-- Photos can't be attached to an already-closed observation. The normal
-- "close with an after-photo" flow uploads the photo BEFORE the status
-- update runs, so it's still unaffected by this.
create policy "photos_insert" on observation_photos for insert with check (
  auth.role() = 'authenticated'
  and exists (
    select 1 from observations o
    where o.id = observation_id and o.status <> 'closed'
  )
);

-- Free-text comments/notes are blocked once the parent observation is
-- closed. The system-generated "status changed to closed" entry (which
-- always has status_change_to set) is exempt, since it's part of the
-- closing action itself.
create policy "comments_insert" on observation_comments for insert with check (
  auth.role() = 'authenticated'
  and (
    status_change_to is not null
    or exists (
      select 1 from observations o
      where o.id = observation_id and o.status <> 'closed'
    )
  )
);
