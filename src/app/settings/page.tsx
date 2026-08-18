"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useSettings, type BasemapMode, type TextSizeMode, type ThemeMode } from "@/lib/settings";
import BottomNav from "@/components/BottomNav";
import PendingUploads from "@/components/PendingUploads";
import type { Profile } from "@/types";
import { ROLE_LABELS } from "@/types";
import type { Session } from "@supabase/supabase-js";
import {
  estimateOfflineDownload,
  downloadOfflineMap,
  getOfflineCacheInfo,
  clearOfflineMap,
  type OfflineDownloadProgress,
} from "@/lib/offlineMap";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { cacheProfile, getCachedProfile } from "@/lib/localCache";

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`tap flex-1 text-xs font-medium py-2 rounded-lg transition-colors ${
            value === opt.value
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SettingsGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {title && (
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase px-1">{title}</p>
      )}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-card">
        {children}
      </div>
    </div>
  );
}

function SettingsRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3.5 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</p>
        {description && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0 w-40">{control}</div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme, basemap, setBasemap, textSize, setTextSize } = useSettings();
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [cachedTiles, setCachedTiles] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<{ tileCount: number; approxMB: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function refreshCacheInfo() {
    getOfflineCacheInfo().then((info) => setCachedTiles(info?.tileCount ?? null));
  }

  useEffect(() => {
    refreshCacheInfo();
    estimateOfflineDownload().then(setEstimate);
  }, []);

  async function handleDownload() {
    if (!isOnline) return;
    setDownloading(true);
    setDownloadError(null);
    setProgress({ done: 0, total: estimate?.tileCount ?? 0, failed: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await downloadOfflineMap((p) => setProgress(p), controller.signal);
      refreshCacheInfo();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
      abortRef.current = null;
    }
  }

  function handleCancelDownload() {
    abortRef.current?.abort();
    setDownloading(false);
  }

  async function handleClearOffline() {
    await clearOfflineMap();
    refreshCacheInfo();
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    const userId = session.user.id;
    (async () => {
      try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
        if (error) throw error;
        setProfile(data);
        cacheProfile(data);
      } catch {
        const cached = getCachedProfile(userId);
        if (cached) setProfile(cached);
      }
    })();
  }, [session]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!session) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">Please sign in</p>
          <a href="/login" className="text-blue-600 dark:text-blue-400 underline">Go to login page</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 bg-slate-900 dark:bg-black text-white px-4 pt-safe pb-3 pt-3">
        <h1 className="font-semibold text-[15px]">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <PendingUploads />

        {profile && (
          <SettingsGroup title="Account">
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-base shrink-0">
                {profile.full_name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {profile.full_name}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {ROLE_LABELS[profile.role]}
                  {profile.company ? ` · ${profile.company}` : ""}
                </p>
              </div>
            </div>
          </SettingsGroup>
        )}

        <SettingsGroup title="Appearance">
          <SettingsRow
            label="Theme"
            description="Match your device or pick one"
            control={
              <SegmentedControl<ThemeMode>
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "Auto" },
                ]}
              />
            }
          />
          <SettingsRow
            label="Text Size"
            description="Larger text across the app"
            control={
              <SegmentedControl<TextSizeMode>
                value={textSize}
                onChange={setTextSize}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "large", label: "Large" },
                ]}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Map">
          <SettingsRow
            label="Default Basemap"
            description="Imagery or street map style"
            control={
              <SegmentedControl<BasemapMode>
                value={basemap}
                onChange={setBasemap}
                options={[
                  { value: "satellite", label: "Satellite" },
                  { value: "streets", label: "Streets" },
                ]}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title="Offline Map">
          <div className="px-4 py-3.5 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                Download project area for offline use
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {cachedTiles && cachedTiles > 0
                  ? `${cachedTiles.toLocaleString()} map tiles saved on this device — the map keeps working with zero signal.`
                  : "Not downloaded yet — download once on Wi-Fi, then the map works fully offline from then on."}
              </p>
              {estimate && !downloading && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  ~{estimate.tileCount.toLocaleString()} tiles, approx. {estimate.approxMB} MB. Use Wi-Fi.
                </p>
              )}
            </div>

            {downloading && progress && (
              <div className="space-y-1.5">
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {progress.done.toLocaleString()} / {progress.total.toLocaleString()} tiles
                  {progress.failed > 0 ? ` · ${progress.failed} failed (will retry next time)` : ""}
                </p>
              </div>
            )}

            {downloadError && <p className="text-xs text-red-600 dark:text-red-400">{downloadError}</p>}

            <div className="flex gap-2">
              {downloading ? (
                <button
                  onClick={handleCancelDownload}
                  className="tap flex-1 text-xs font-semibold py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={handleDownload}
                  disabled={!isOnline}
                  className="tap flex-1 text-xs font-semibold py-2.5 rounded-xl bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white"
                >
                  {cachedTiles && cachedTiles > 0 ? "Re-download / Update" : "Download for offline"}
                </button>
              )}
              {!downloading && cachedTiles !== null && cachedTiles > 0 && (
                <button
                  onClick={handleClearOffline}
                  className="tap text-xs font-semibold py-2.5 px-3 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400"
                >
                  Clear
                </button>
              )}
            </div>

            {/* This is the one moment offline genuinely blocks something —
                there's no map data to fetch yet. Everywhere else (creating
                observations, browsing an already-downloaded map) keeps
                working with no connection at all, which is exactly the
                point of this feature. */}
            {!isOnline && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                يحتاج التحميل الأول اتصال بالنت — وصّلها بشبكة قوية وحمّل الخريطة قبل ما تنزل الموقع.
              </p>
            )}
          </div>
        </SettingsGroup>

        <SettingsGroup>
          <button onClick={handleSignOut} className="tap w-full px-4 py-3.5 text-sm font-medium text-red-600 dark:text-red-400 text-center">
            Sign Out
          </button>
        </SettingsGroup>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-600 pt-2 pb-4">
          HSE Observation System · v1.0
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
