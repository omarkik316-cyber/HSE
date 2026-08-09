"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import ObservationForm from "@/components/ObservationForm";
import ObservationDetail from "@/components/ObservationDetail";
import ObservationsList from "@/components/ObservationsList";
import StatsBar from "@/components/StatsBar";
import FilterBar, { defaultFilters, applyFilters, type Filters } from "@/components/FilterBar";
import type { Observation, Profile } from "@/types";
import { ROLE_LABELS } from "@/types";
import type { Session } from "@supabase/supabase-js";

// Leaflet touches `window`/`document` at import time, which breaks Next.js's
// server-side render pass. Loading it only on the client (ssr: false) fixes
// the "500 Internal Server Error" / "appendChild of undefined" crash.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
      Loading map...
    </div>
  ),
});

type PendingPin = { lng: number; lat: number; zoneName: string | null } | null;

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [pendingPin, setPendingPin] = useState<PendingPin>(null);
  const [selectedObs, setSelectedObs] = useState<Observation | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters());
  // The map is ALWAYS mounted and visible now — it's never hidden/unmounted,
  // which was the root cause of the "map flashes and disappears" bug. The
  // list is a bottom sheet that overlays the lower half of the screen
  // without touching the map's actual size, so no resize/reflow ever hits
  // the Leaflet instance underneath.
  const [listOpen, setListOpen] = useState(false);
  // Profile loads asynchronously after the session does. If someone taps
  // the map before this finishes, `profile` is still null, so the old code
  // wrongly treated that as "your role can't create observations" even for
  // an admin — the form would only open if you happened to click *after*
  // the profile had already loaded. This flag prevents that false negative.
  const [profileLoading, setProfileLoading] = useState(true);
  // Non-blocking message shown at the bottom of the screen instead of a
  // native alert() — alerts on mobile can get dismissed by a stray tap
  // before they're even read, which looks exactly like "nothing happened".
  const [toast, setToast] = useState<string | null>(null);

  const filteredObservations = useMemo(
    () => applyFilters(observations, filters),
    [observations, filters]
  );

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Load profile once we have a session
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        setProfileLoading(false);
      });
  }, [session]);

  const fetchObservations = useCallback(async () => {
    const { data, error } = await supabase
      .from("observations")
      // observations has TWO foreign keys into profiles (reported_by and
      // closed_by), so the embed must specify which one — otherwise
      // PostgREST can't disambiguate and the whole query silently errors
      // out, returning null (which looked like "0 observations").
      .select("*, profiles!observations_reported_by_fkey(full_name, role, company), observation_photos(*)")
      .order("created_at", { ascending: false });

    if (error) {
      // Most commonly this means Row Level Security is hiding rows because
      // this account's role/company doesn't match — not a network/API bug.
      console.error("Failed to load observations:", error.message);
    }
    setObservations(data ?? []);
  }, []);

  useEffect(() => {
    if (session) fetchObservations();
  }, [session, fetchObservations]);

  const handleMapClick = useCallback(
    (lng: number, lat: number, zoneName: string | null) => {
      // Profile is still loading — don't make any permission decision yet,
      // and don't silently do nothing either. Tell the person to wait a
      // beat instead of it looking broken.
      if (profileLoading) {
        setToast("Still loading your account — try tapping again in a second.");
        return;
      }

      // Safety officers, consultants, and admins can raise new observations
      // by clicking the map. Contractors close them but don't create new ones.
      const canCreate =
        profile?.role === "safety_officer" || profile?.role === "consultant" || profile?.role === "admin";
      if (!canCreate) {
        setToast(
          `Your role (${profile ? ROLE_LABELS[profile.role] : "unknown"}) can't create new observations. Ask an admin to change your role on the "Manage Users" page if this is wrong.`
        );
        return;
      }
      setListOpen(false);
      setSelectedObs(null);
      setPendingPin({ lng, lat, zoneName });
    },
    [profile, profileLoading]
  );

  // Auto-dismiss the toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handlePinClick = useCallback((obs: Observation) => {
    setPendingPin(null);
    setSelectedObs(obs);
  }, []);

  if (!session) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">Please sign in</p>
          <a href="/login" className="text-blue-600 underline">
            Go to login page
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col">
      <header className="bg-slate-900 text-white px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-semibold text-sm sm:text-base">HSE Safety Observation System</h1>
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="text-slate-300 hidden sm:inline">
            {profile?.full_name} · {profile ? ROLE_LABELS[profile.role] : ""}
          </span>
          <a href="/stats" className="bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded-lg whitespace-nowrap">
            Stats
          </a>
          {profile?.role === "admin" && (
            <a href="/admin/users" className="bg-slate-700 hover:bg-slate-600 px-2.5 py-1 rounded-lg whitespace-nowrap">
              Manage Users
            </a>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            className="bg-slate-700 px-2.5 py-1 rounded-lg whitespace-nowrap"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Always shows totals across ALL observations — not affected by the
          filter bar below, so the counts (including Closed) never appear
          to "disappear" just because a filter is narrowing what's shown
          on the map/list. */}
      <StatsBar observations={observations} />
      <FilterBar observations={observations} filters={filters} onChange={setFilters} />

      <div className="flex-1 relative overflow-hidden">
        {/* Non-blocking toast, replaces the old alert() */}
        {toast && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-[90vw] bg-slate-900 text-white text-xs px-4 py-2.5 rounded-lg shadow-lg text-center">
            {toast}
          </div>
        )}

        {/* Map: always mounted, always full-size, never hidden.
            z-0 here is CRITICAL — without an explicit z-index, this div
            doesn't create its own CSS stacking context, so Leaflet's
            internal panes (which use z-index up to 600–700 for markers,
            popups, tooltips) can escape ABOVE our foreground panels
            (z-20/z-30/z-40) regardless of their z-index values. That's
            exactly what caused zone labels to render on top of the
            observation form instead of staying behind it. */}
        <div className="absolute inset-0 z-0">
          <MapView
            observations={filteredObservations}
            onMapClick={handleMapClick}
            onPinClick={handlePinClick}
          />
          {(profile?.role === "safety_officer" || profile?.role === "consultant" || profile?.role === "admin") &&
            !pendingPin &&
            !selectedObs &&
            !listOpen && (
            <div className="absolute bottom-4 left-4 right-24 sm:right-auto bg-white/90 backdrop-blur px-3 py-2 rounded-lg shadow text-xs text-slate-600">
              Tap anywhere on the map to log a new observation
            </div>
          )}
        </div>

        {/* Floating handle to open the observations list as a bottom sheet. */}
        {!listOpen && (
          <button
            onClick={() => {
              setPendingPin(null);
              setSelectedObs(null);
              setListOpen(true);
            }}
            className="absolute bottom-4 right-4 z-20 bg-slate-900 text-white text-xs font-medium px-3 py-2 rounded-full shadow-lg flex items-center gap-1.5"
          >
            📋 Observations ({filteredObservations.length})
          </button>
        )}

        {/* Bottom sheet: covers the lower half of the screen, map stays
            visible (and unresized) in the upper half. */}
        {listOpen && (
          <div className="absolute inset-x-0 bottom-0 z-20 h-1/2 bg-white border-t shadow-2xl rounded-t-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-slate-50 shrink-0">
              <span className="text-xs font-semibold text-slate-600">Observations List</span>
              <button
                onClick={() => setListOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none px-2"
                aria-label="Close list"
              >
                ▼
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ObservationsList observations={filteredObservations} onSelect={handlePinClick} />
            </div>
          </div>
        )}

        {/* On mobile this becomes a full-screen overlay so the map never
            gets squeezed into a sliver next to the panel. On larger
            screens (sm+) it reverts to a fixed-width sidebar. */}
        {(pendingPin || selectedObs) && (
          <div className="fixed sm:absolute inset-0 sm:inset-y-0 sm:right-0 sm:left-auto z-30 w-full sm:w-[420px] sm:max-w-[90vw] bg-white sm:border-l shadow-xl overflow-y-auto">
            {pendingPin && profile && (
              <ObservationForm
                lng={pendingPin.lng}
                lat={pendingPin.lat}
                zoneName={pendingPin.zoneName}
                userId={profile.id}
                onCreated={() => {
                  setPendingPin(null);
                  fetchObservations();
                }}
                onCancel={() => setPendingPin(null)}
              />
            )}
            {selectedObs && profile && (
              <ObservationDetail
                observation={selectedObs}
                userId={profile.id}
                userRole={profile.role}
                onClose={() => setSelectedObs(null)}
                onUpdated={() => {
                  fetchObservations();
                  setSelectedObs(null);
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
