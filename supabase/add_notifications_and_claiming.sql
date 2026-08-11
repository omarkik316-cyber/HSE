-- Run in Supabase SQL Editor.
-- Adds: (1) an in-app notification feed — new observations, status
-- changes, and admin broadcasts (walkthroughs, meetings, etc. — with
-- reusable templates); (2) "claiming" so once one person starts working
-- an observation, nobody else can also pick it up.

-- =========================================================
-- 1. Claiming — lock an observation to whoever starts working it
-- =========================================================
alter table observations add column if not exists claimed_by uuid references profiles(id);
alter table observations add column if not exists claimed_at timestamptz;

-- =========================================================
-- 2. Notifications feed
-- =========================================================
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('observation_created', 'status_changed', 'admin_broadcast')),
  title text not null,
  message text not null,
  zone_name text,
  observation_id uuid references observations(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Per-user read state (a notification is "unread" for a user until a row
-- exists here) — this is what drives the badge count on the bell icon.
create table if not exists notification_reads (
  notification_id uuid references notifications(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- =========================================================
-- 3. Reusable admin broadcast templates (walkthrough, meeting, etc.)
--    Admins can add/edit/delete their own templates freely.
-- =========================================================
create table if not exists notification_templates (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  message text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- A handful of starter templates so the admin isn't starting from a blank
-- list. Safe to edit or delete afterwards.
insert into notification_templates (title, message)
select * from (values
  ('Site Walkthrough', 'There will be a site walkthrough today. Please make sure your area is ready for inspection.'),
  ('Safety Meeting', 'A safety meeting has been scheduled. Please attend on time.'),
  ('Toolbox Talk', 'A toolbox talk will be held before work starts today. Attendance is mandatory.')
) as t(title, message)
where not exists (select 1 from notification_templates);

-- =========================================================
-- Row Level Security
-- =========================================================
alter table notifications enable row level security;
alter table notification_reads enable row level security;
alter table notification_templates enable row level security;

-- Notifications: everyone signed in can read every notification (it's a
-- broadcast feed); only authenticated users can create them (the app
-- itself decides who is allowed to trigger which type from the UI).
create policy "notifications_select" on notifications for select using (
  auth.role() = 'authenticated'
);
create policy "notifications_insert" on notifications for insert with check (
  auth.role() = 'authenticated'
);

-- Read state: everyone manages only their own read markers. Upsert (used
-- by the client to mark something read) needs INSERT *and* UPDATE — the
-- on-conflict branch is an UPDATE under the hood.
create policy "notification_reads_select" on notification_reads for select using (
  auth.uid() = user_id
);
create policy "notification_reads_insert" on notification_reads for insert with check (
  auth.uid() = user_id
);
create policy "notification_reads_update" on notification_reads for update using (
  auth.uid() = user_id
);

-- Templates: everyone can read them (so any admin sees the shared list),
-- but only admins can create/update/delete.
create policy "notification_templates_select" on notification_templates for select using (
  auth.role() = 'authenticated'
);
create policy "notification_templates_write" on notification_templates for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
