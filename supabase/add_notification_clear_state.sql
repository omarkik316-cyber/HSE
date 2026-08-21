-- Run in Supabase SQL Editor.
-- Splits "read" and "cleared" into two separate states for a user's
-- notification feed:
--   - read    (existing `notification_reads` table): the item was opened —
--              it now shows highlighted green in the bell list, but STAYS
--              in the list.
--   - cleared (this new `notification_clears` table): the user explicitly
--              hit "Clear all" — the item is hidden from their feed for
--              good. Previously, opening a notification did both at once
--              (removed it from the feed on tap) — this migration lets the
--              app separate the two so tapping no longer deletes it.

create table if not exists notification_clears (
  notification_id uuid references notifications(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  cleared_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table notification_clears enable row level security;

create policy "notification_clears_select" on notification_clears for select using (
  auth.uid() = user_id
);
create policy "notification_clears_insert" on notification_clears for insert with check (
  auth.uid() = user_id
);
