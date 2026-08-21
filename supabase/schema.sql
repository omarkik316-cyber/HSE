-- =========================================================
-- HSE Observation System — Supabase Schema
-- Run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- =========================================================

-- 1. Extensions
create extension if not exists "uuid-ossp";

-- 2. Roles enum
create type user_role as enum ('safety_officer', 'consultant', 'contractor', 'admin');
create type observation_status as enum ('open', 'in_progress', 'pending_review', 'closed');
create type observation_priority as enum ('low', 'medium', 'high', 'critical');

-- 3. Profiles table (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text not null,
  role user_role not null default 'contractor',
  company text,
  phone text,
  created_at timestamptz not null default now()
);

-- 4. Zones table (loaded from project_zones.geojson, optional but useful
--    to link zones to a responsible contractor)
create table zones (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,           -- e.g. "Phase 3 - E"
  phase text,                          -- e.g. "Phase 3"
  responsible_contractor text,
  geometry jsonb,                      -- GeoJSON polygon geometry
  created_at timestamptz not null default now()
);

-- 5. Observations table (the core entity)
create table observations (
  id uuid primary key default uuid_generate_v4(),
  ticket_no serial,                    -- human-friendly sequential number (#1, #2...)
  title text not null,
  description text,
  category text not null,              -- e.g. "PPE", "Fall Protection", "Housekeeping", "Electrical"
  priority observation_priority not null default 'medium',
  status observation_status not null default 'open',

  latitude double precision not null,
  longitude double precision not null,
  zone_name text,                      -- auto-detected via point-in-polygon on the client

  reported_by uuid references profiles(id) not null,
  assigned_contractor text,

  -- Deadline for the contractor to fix the violation. Stores date + time
  -- (not just a date) so it can default to "right now" and still be edited.
  due_date timestamptz,
  closed_at timestamptz,
  closed_by uuid references profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6. Observation photos (before / after correction)
create table observation_photos (
  id uuid primary key default uuid_generate_v4(),
  observation_id uuid references observations(id) on delete cascade not null,
  photo_url text not null,
  photo_type text not null default 'before', -- 'before' | 'after'
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- 7. Observation activity log / comments (audit trail — replaces WhatsApp thread)
create table observation_comments (
  id uuid primary key default uuid_generate_v4(),
  observation_id uuid references observations(id) on delete cascade not null,
  author_id uuid references profiles(id) not null,
  comment text not null,
  status_change_to observation_status, -- optional: log status transitions here too
  created_at timestamptz not null default now()
);

-- 8. Auto-update `updated_at` on observations
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_observations_updated_at
before update on observations
for each row execute function set_updated_at();

-- 9. Auto-create profile row when a new auth user signs up
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.phone, new.email),
    'contractor',
    new.phone
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- =========================================================
-- Row Level Security
-- =========================================================
alter table profiles enable row level security;
alter table zones enable row level security;
alter table observations enable row level security;
alter table observation_photos enable row level security;
alter table observation_comments enable row level security;

-- Everyone authenticated can read profiles (needed to show names)
create policy "profiles_select_all" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
-- Admins can update ANY profile (needed for the /admin/users role-management page)
create policy "profiles_admin_update_any" on profiles for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Zones: everyone authenticated can read; only admin can write
create policy "zones_select_all" on zones for select using (auth.role() = 'authenticated');
create policy "zones_admin_write" on zones for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Observations:
--   - Everyone signed in (any role) can see every observation — there is
--     no "contractor only sees their own company" restriction.
--   - Safety officers, consultants, managers, and admins can create observations.
--   - Safety officers, contractors, and admins can update/close them
--     (consultants raise observations but don't close them).
create policy "observations_select" on observations for select using (
  auth.role() = 'authenticated'
);

create policy "observations_insert" on observations for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role in ('safety_officer', 'consultant', 'admin', 'manager'))
);

create policy "observations_update" on observations for update using (
  exists (select 1 from profiles where id = auth.uid() and role in ('safety_officer', 'contractor', 'admin'))
);

-- Photos: readable by anyone who can read the parent observation; insert by any authenticated user
create policy "photos_select" on observation_photos for select using (auth.role() = 'authenticated');
create policy "photos_insert" on observation_photos for insert with check (auth.role() = 'authenticated');

-- Comments: same pattern
create policy "comments_select" on observation_comments for select using (auth.role() = 'authenticated');
create policy "comments_insert" on observation_comments for insert with check (auth.role() = 'authenticated');

-- =========================================================
-- Storage bucket for observation photos
-- =========================================================
insert into storage.buckets (id, name, public)
values ('observation-photos', 'observation-photos', true)
on conflict (id) do nothing;

create policy "photos_bucket_read" on storage.objects for select using (bucket_id = 'observation-photos');
create policy "photos_bucket_insert" on storage.objects for insert with check (
  bucket_id = 'observation-photos' and auth.role() = 'authenticated'
);

-- =========================================================
-- Helpful view: overdue observations (open/in_progress past due_date)
-- =========================================================
create view overdue_observations as
select
  o.*,
  extract(day from (now() - o.due_date))::int as days_overdue
from observations o
where o.status in ('open', 'in_progress')
  and o.due_date is not null
  and o.due_date < now();
