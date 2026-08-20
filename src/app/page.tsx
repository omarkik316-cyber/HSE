"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { useSettings } from "@/lib/settings";
import ObservationForm from "@/components/ObservationForm";
import ObservationDetail from "@/components/ObservationDetail";
import ObservationsList from "@/components/ObservationsList";
import ClassicHome from "@/components/ClassicHome";
import ZonePickerSheet from "@/components/ZonePickerSheet";
import StatsBar from "@/components/StatsBar";
import FilterBar, { defaultFilters, applyFilters, type Filters } from "@/components/FilterBar";
import BottomNav from "@/components/BottomNav";
import NotificationBell from "@/components/NotificationBell";
import { startAutoSync, subscribeQueue, getPendingObservations } from "@/lib/offlineQueue";
import { cacheProfile, getCachedProfile, cacheObservations, getCachedObservations } from "@/lib/localCache";
import { loadZones, detectZone, getZoneOptions, type ZoneOption } from "@/lib/zoneDetect";
import { useT } from "@/lib/i18n";
import type { Observation, Profile } from "@/types";
import type { Session } from "@supabase/supabase-js";

// Same project-center fallback MapView uses when it can't compute real
// site bounds — kept here too so a Classic-mode "General / not sure"
// report lands in a sane place instead of (0, 0).
const DEFAULT_CENTER = { lng: 46.745, lat: 24.88 };

// Leaflet touches `window`/`document` at import time, which breaks Next.js's
// server-side render pass. Loading it only on the client (ssr: false) fixes
// the "500 Internal Server Error" / "appendChild of undefined" crash.
function MapLoadingFallback() {
  const { t } = useT();
  return (
    <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
      {t("dashboard.loadingMap")}
    </div>
  );
}

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: MapLoadingFallback,
});

type PendingPin = { lng: number; lat: number; zoneName: string | null } | null;

export default function DashboardPage() {
  const { basemap, uiMode } = useSettings();
  const { t } = useT();
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
  // Count of observations saved locally because the connection was too weak
  // to send them — shown as a small badge on the Settings entry point.
  const [pendingCount, setPendingCount] = useState(0);
  // Classic mode: "Quick Report" resolves a location via GPS before it can
  // open the form (the form requires lat/lng up front, e.g. to stamp the
  // photo). This tracks that resolution step, and the manual zone-picker
  // sheet shown when GPS is denied, times out, or isn't available at all.
  const [locating, setLocating] = useState(false);
  const [zonePicker, setZonePicker] = useState<{
    zones: ZoneOption[];
    reason: "denied" | "unsupported" | "timeout";
  } | null>(null);

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
    const userId = session.user.id;

    (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (error) throw error;
        setProfile(data);
        cacheProfile(data);
      } catch {
        // Offline (or any other transient failure) — without this fallback
        // profileLoading stayed true forever, since nothing else ever set
        // it back to false. That silently blocked tapping the map to
        // create an observation, repeating "Still loading your account"
        // indefinitely even though the person's role/permissions haven't
        // actually changed since the last time this loaded successfully.
        const cached = getCachedProfile(userId);
        if (cached) setProfile(cached);
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [session]);

  const fetchObservations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("observations")
        // observations has TWO foreign keys into profiles (reported_by and
        // closed_by), so the embed must specify which one — otherwise
        // PostgREST can't disambiguate and the whole query silently errors
        // out, returning null (which looked like "0 observations").
        .select(
          "*, profiles!observations_reported_by_fkey(full_name, role, company), closed_by_profile:profiles!observations_closed_by_fkey(full_name, role), claimed_by_profile:profiles!observations_claimed_by_fkey(full_name), observation_photos(*)"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setObservations(data ?? []);
      cacheObservations(data ?? []);
    } catch (err) {
      // Most commonly either RLS hiding rows (role/company mismatch) or,
      // offline, the fetch never reaching the network at all. Either way,
      // falling back to the last successfully loaded list keeps the map,
      // list, and stats showing real (if slightly stale) data instead of
      // going blank the moment the connection drops.
      console.error("Failed to load observations:", err);
      const cached = getCachedObservations();
      if (cached.length > 0) setObservations(cached);
    }
  }, []);

  useEffect(() => {
    if (session) fetchObservations();
  }, [session, fetchObservations]);

  // Auto-retry anything sitting in the offline queue (weak-connection
  // submits) whenever we regain connectivity, plus a periodic sweep. When
  // an item finally sends successfully it disappears from the queue, so a
  // refetch here also pulls it onto the map/list without the person having
  // to do anything.
  useEffect(() => {
    startAutoSync();
    const refresh = () => {
      getPendingObservations().then((items) => setPendingCount(items.length));
      if (session) fetchObservations();
    };
    refresh();
    const unsubscribe = subscribeQueue(refresh);
    return unsubscribe;
  }, [session, fetchObservations]);

  const handleMapClick = useCallback(
    (lng: number, lat: number, zoneName: string | null) => {
      // Profile is still loading — don't make any permission decision yet,
      // and don't silently do nothing either. Tell the person to wait a
      // beat instead of it looking broken.
      if (profileLoading) {
        setToast(t("dashboard.stillLoadingAccount"));
        return;
      }

      // Safety officers, consultants, and admins can raise new observations
      // by clicking the map. Contractors close them but don't create new ones.
      const canCreate =
        profile?.role === "safety_officer" || profile?.role === "consultant" || profile?.role === "admin";
      if (!canCreate) {
        setToast(t("dashboard.roleCannotCreate"));
        return;
      }
      setListOpen(false);
      setSelectedObs(null);
      setPendingPin({ lng, lat, zoneName });
    },
    [profile, profileLoading, t]
  );

  // Shared by both modes: same permission check `handleMapClick` uses, but
  // callable without already having a location in hand.
  const canCreateObservation = useCallback(() => {
    if (profileLoading) {
      setToast(t("dashboard.stillLoadingAccount"));
      return false;
    }
    const allowed =
      profile?.role === "safety_officer" || profile?.role === "consultant" || profile?.role === "admin";
    if (!allowed) {
      setToast(t("dashboard.roleCannotCreate"));
      return false;
    }
    return true;
  }, [profile, profileLoading, t]);

  const openManualZonePicker = useCallback(
    async (reason: "denied" | "unsupported" | "timeout") => {
      let zones: ZoneOption[] = [];
      try {
        zones = getZoneOptions(await loadZones());
      } catch {
        // No zone data available (e.g. fully offline on first-ever load) —
        // the sheet still offers the "General / not sure" option below.
      }
      setLocating(false);
      setZonePicker({ zones, reason });
    },
    []
  );

  // Classic mode's entry point for raising an observation — there's no map
  // to tap, so location comes from the device's GPS instead, with the
  // zone auto-detected the same way a map tap would. If GPS is denied,
  // times out, or isn't available, this falls back to letting the person
  // pick their zone from a list rather than blocking them entirely.
  const handleQuickReport = useCallback(() => {
    if (!canCreateObservation()) return;
    setListOpen(false);
    setSelectedObs(null);
    setZonePicker(null);

    if (!("geolocation" in navigator)) {
      openManualZonePicker("unsupported");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { longitude: lng, latitude: lat } = position.coords;
        let zoneName: string | null = null;
        try {
          zoneName = detectZone(lng, lat, await loadZones());
        } catch {
          // Zone lookup failing shouldn't block the report — it just goes
          // in without a detected zone, same as tapping outside all zones
          // on the map does.
        }
        setLocating(false);
        setPendingPin({ lng, lat, zoneName });
      },
      (err) => {
        openManualZonePicker(err.code === err.TIMEOUT ? "timeout" : "denied");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }, [canCreateObservation, openManualZonePicker]);

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

  // Used by NotificationBell: a notification only carries an observation
  // id, so look it up in the already-loaded list before opening it.
  const handleOpenObservationById = useCallback(
    (observationId: string) => {
      const obs = observations.find((o) => o.id === observationId);
      if (obs) {
        setListOpen(false);
        setPendingPin(null);
        setSelectedObs(obs);
      } else {
        setToast(t("dashboard.observationNotFound"));
      }
    },
    [observations, t]
  );

  if (!session) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">{t("common.pleaseSignIn")}</p>
          <a href="/login" className="text-blue-600 dark:text-blue-400 underline">
            {t("common.goToLogin")}
          </a>
        </div>
      </div>
    );
  }

  const canCreate =
    profile?.role === "safety_officer" || profile?.role === "consultant" || profile?.role === "admin";
  const overlayOpen = !!(pendingPin || selectedObs);

  return (
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Compact app bar — a single line, no wrapping buttons. */}
      <header className="shrink-0 bg-slate-900 dark:bg-black text-white px-4 pt-safe pb-2.5 pt-3 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="font-semibold text-[15px] leading-tight truncate">{t("dashboard.headerTitle")}</h1>
          {profile && (
            <p className="text-[11px] text-slate-400 truncate">{profile.full_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {profile && <NotificationBell profile={profile} onOpenObservation={handleOpenObservationById} />}
          <a
            href="/settings"
            className="tap relative w-8 h-8 rounded-full bg-slate-700/70 flex items-center justify-center text-sm font-semibold shrink-0"
            aria-label={t("dashboard.settings")}
          >
            {profile?.full_name?.[0]?.toUpperCase() ?? "•"}
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                {pendingCount}
              </span>
            )}
          </a>
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
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 max-w-[90vw] bg-slate-900 dark:bg-slate-800 text-white text-xs px-4 py-2.5 rounded-xl shadow-lg text-center animate-fade-in">
            {toast}
          </div>
        )}

        {uiMode === "classic" ? (
          /* Classic mode never mounts MapView at all — no Leaflet init, no
             tile requests. This is a deliberate escape hatch for devices
             (or WebViews) where the map won't render, as well as a
             genuinely faster path to raising a report on any device. */
          <ClassicHome
            observations={filteredObservations}
            canCreate={!!canCreate}
            locating={locating}
            onQuickReport={handleQuickReport}
            onSelect={handlePinClick}
          />
        ) : (
          <>
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
                basemap={basemap}
              />
              {canCreate && !pendingPin && !selectedObs && !listOpen && (
                <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-xs bg-white/95 dark:bg-slate-900/90 backdrop-blur px-3 py-2 rounded-xl shadow text-xs text-slate-600 dark:text-slate-300">
                  {t("dashboard.tapToCreate")}
                </div>
              )}
            </div>

            {/* Floating handle to open the observations list as a bottom sheet. */}
            {!listOpen && !overlayOpen && (
              <button
                onClick={() => {
                  setPendingPin(null);
                  setSelectedObs(null);
                  setListOpen(true);
                }}
                className="tap absolute bottom-4 right-4 z-20 bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg flex items-center gap-1.5"
              >
                📋 {t("dashboard.observationsButton", { n: filteredObservations.length })}
              </button>
            )}

            {/* Bottom sheet: covers the lower half of the screen, map stays
                visible (and unresized) in the upper half. */}
            {listOpen && (
              <div className="absolute inset-x-0 bottom-0 z-20 h-1/2 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shadow-2xl rounded-t-3xl overflow-hidden flex flex-col animate-sheet-up">
                <div className="sheet-handle shrink-0" />
                <div className="flex items-center justify-between px-4 py-1.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t("dashboard.observationsListTitle")}</span>
                  <button
                    onClick={() => setListOpen(false)}
                    className="tap text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-lg leading-none px-2"
                    aria-label={t("dashboard.closeList")}
                  >
                    ▼
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <ObservationsList observations={filteredObservations} onSelect={handlePinClick} />
                </div>
              </div>
            )}
          </>
        )}

        {zonePicker && (
          <ZonePickerSheet
            zones={zonePicker.zones}
            reason={zonePicker.reason}
            defaultCenter={DEFAULT_CENTER}
            onPick={(pin) => {
              setZonePicker(null);
              setPendingPin(pin);
            }}
            onRetryGps={() => {
              setZonePicker(null);
              handleQuickReport();
            }}
            onClose={() => setZonePicker(null)}
          />
        )}

        {/* On mobile this becomes a full-screen overlay so the map never
            gets squeezed into a sliver next to the panel. On larger
            screens (sm+) it reverts to a fixed-width sidebar. */}
        {overlayOpen && (
          <div className="fixed sm:absolute inset-0 sm:inset-y-0 sm:right-0 sm:left-auto z-30 w-full sm:w-[420px] sm:max-w-[90vw] bg-white dark:bg-slate-900 sm:border-l border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden animate-fade-in">
            {pendingPin && profile && (
              <ObservationForm
                lng={pendingPin.lng}
                lat={pendingPin.lat}
                zoneName={pendingPin.zoneName}
                userId={profile.id}
                userName={profile.full_name}
                onCreated={() => {
                  setPendingPin(null);
                  fetchObservations();
                }}
                onCancel={() => setPendingPin(null)}
                onQueued={setToast}
              />
            )}
            {selectedObs && profile && (
              <ObservationDetail
                observation={selectedObs}
                userId={profile.id}
                userName={profile.full_name}
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

      <BottomNav />
    </div>
  );
}
