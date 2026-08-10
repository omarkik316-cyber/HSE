# HSE Observation System

Map-based safety observation tracking for construction projects — replaces the
WhatsApp-photo-and-hope workflow with a proper database, status pipeline, and
zone-aware reporting.

Built for your project's actual boundary data: `public/data/project_zones.geojson`
was generated from your uploaded KML (67 zones across Phase 2, 3, 4, 5).

## Stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind
- **Map:** Leaflet + Esri World Imagery (free satellite tiles, no API key or
  signup required — zone polygons overlaid on top)
- **Database / Auth / Storage:** Supabase, using the modern `@supabase/ssr`
  package (`utils/supabase/client.ts`, `server.ts`, `middleware.ts`) so auth
  sessions stay refreshed and cookie-synced across the App Router
- **Zone detection:** Turf.js point-in-polygon (auto-tags every observation
  with the zone it was clicked in)

## ⚠️ Not build-verified
This project was generated in a sandboxed environment with no internet
access, so `npm install` / `npm run build` could not be run here to catch
every possible typo or version-mismatch error. Please run:

```bash
npm install
npm run dev
```

...and fix anything that surfaces (should be minor — dependency versions or
similar). Everything has been written and reviewed carefully, but treat this
as a strong first build rather than a guaranteed zero-error one.

## Setup

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → New Project.

### 2. Run the database schema
Open **SQL Editor** in your Supabase dashboard → paste the entire contents of
`supabase/schema.sql` → Run.

This creates:
- `profiles` (role: `safety_officer` / `consultant` / `contractor` / `admin`)
- `zones`, `observations`, `observation_photos`, `observation_comments`
- Row Level Security policies (contractors only see their own assigned items;
  safety officers, consultants, admins see everything)
- `observation-photos` storage bucket
- `overdue_observations` view for reporting

### 3. Environment variables
`.env.local` is already filled in with your Supabase project URL and
publishable key (`wcybokoptckrnnmuvjan.supabase.co`). No map API key is
needed — the map uses Esri's free World Imagery satellite tiles.

`.env.local` is git-ignored, so it's safe to keep your real values there.

### 4. Install & run
```bash
npm install
npm run dev
```
Open http://localhost:3000

### 6. Create your first users
- Sign up via `/login` — every new user defaults to role `contractor`.
- To make yourself a Safety Officer or Admin, go to Supabase → Table Editor →
  `profiles` → edit your row → change `role` to `safety_officer` or `admin`.
- Set `company` on contractor accounts so RLS can filter their view to only
  observations assigned to their company.

## How it works

| Role | Can do |
|---|---|
| **Admin / المشرف** | Sees every observation + full stats, manages all users' roles via `/admin/users` |
| **Consultant / الاستشاري** | Raises new observations by clicking the map (flagged for same-day closure via due date), sees everything |
| **Safety Officer / أمن وسلامة الشركة** | Raises new observations, sees everything |
| **Contractor / أمن وسلامة المقاول** | Closes observations (marks in-progress/closed, uploads correction photo), sees everything |

There is **no company-matching restriction** — every signed-in user, regardless
of role, can see every observation on the map and in the stats/filter bar.
The only differences between roles are: who can *create* new observations
(Safety Officer, Consultant, Admin) and who can *close* them (Safety Officer,
Contractor, Admin).

**Workflow:** Safety officer or consultant taps a location on the map → zone
(e.g. "Phase 3 - E") is auto-detected via point-in-polygon → form opens →
photo + category + priority + assigned contractor + due date (defaults to
right now, editable) → pin appears color-coded by priority → contractor
uploads correction photo and marks closed → full audit trail preserved in
`observation_comments`.

## Regenerating the zones file
If your project boundaries change, re-export KML from AutoCAD/Google Earth
and re-run the conversion script (ask for it — it lives outside this
repo) to regenerate `public/data/project_zones.geojson`. The app reads that
file directly; no rebuild of the database is needed.

## Suggested next steps (not yet built)
- **Email/SMS notifications** for new observations and overdue items — use
  Supabase Edge Functions + a service like Resend or Twilio, triggered by a
  database webhook on `observations` insert/update.
- **PDF/Excel weekly reports** — a scheduled Edge Function querying
  `overdue_observations` and grouping by contractor/zone.
- **Bulk zone import UI** so an admin can re-upload a KML/GeoJSON from the
  browser instead of a script.
- **Mobile home-screen install** — the app is already responsive; add a
  `manifest.json` for "Add to Home Screen" on site.

## Project structure
```
src/
  app/
    page.tsx              # main dashboard (map + panels)
    login/page.tsx         # auth
    layout.tsx, globals.css
  components/
    MapView.tsx             # Mapbox map, zone layers, pins, click handling
    ObservationForm.tsx      # new observation creation
    ObservationDetail.tsx    # status workflow, photos, comments
    StatsBar.tsx             # open/in-progress/closed/overdue counts
    StatusBadge.tsx
  lib/
    supabaseClient.ts
    zoneDetect.ts            # turf.js point-in-polygon zone auto-detect
  types/index.ts
public/data/project_zones.geojson   # your project's 67 zone boundaries
supabase/schema.sql                  # full DB schema + RLS + storage bucket
utils/supabase/
  client.ts                          # browser Supabase client (@supabase/ssr)
  server.ts                          # server component / route handler client
  middleware.ts                      # session refresh logic
middleware.ts                        # root Next.js middleware, runs on every request
```
