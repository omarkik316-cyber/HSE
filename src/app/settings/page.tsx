"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { clearLoginMark } from "@/lib/sessionExpiry";
import {
  useSettings,
  type BasemapMode,
  type TextSizeMode,
  type ThemeMode,
  type LanguageMode,
  type UiMode,
} from "@/lib/settings";
import BottomNav from "@/components/BottomNav";
import PendingUploads from "@/components/PendingUploads";
import type { Profile } from "@/types";
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
import { useT, roleLabel } from "@/lib/i18n";
import {
  getPushPermission,
  onPushPermissionChange,
  requestPushPermissionOnUserGesture,
} from "@/lib/push/onesignal";
import { isIosSafari, isRunningAsInstalledApp, isIphone } from "@/lib/push/deviceDetect";

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

function AppModeCard({
  selected,
  icon,
  gradient,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  gradient: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`tap relative flex-1 min-w-0 text-left rounded-2xl p-3.5 border-2 transition-colors overflow-hidden ${
        selected
          ? "border-blue-600 bg-blue-50/70 dark:bg-blue-950/40"
          : "border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-2.5 bg-gradient-to-br ${gradient} shadow-sm`}
      >
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">{title}</p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">{description}</p>
      {selected && (
        <div className="absolute top-2.5 right-2.5 w-4.5 h-4.5 rounded-full bg-blue-600 text-white flex items-center justify-center">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M20 6 9 17l-5-5" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
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
  const {
    theme,
    setTheme,
    basemap,
    setBasemap,
    textSize,
    setTextSize,
    language,
    setLanguage,
    uiMode,
    setUiMode,
  } = useSettings();
  const { t } = useT();
  const isOnline = useOnlineStatus();
  const [session, setSession] = useState<Session | null>(null);
  // false until the very first supabase.auth.getSession() resolves — avoids
  // briefly treating "haven't checked yet" as "signed out" (session starts
  // out null either way) and flashing a sign-in redirect for people who are
  // actually signed in.
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [cachedTiles, setCachedTiles] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<{ tileCount: number; approxMB: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // null = still checking. Starts as whatever OneSignal currently reports,
  // then updates live the instant the person answers the native permission
  // dialog — no polling needed.
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);
  const [needsInstallFirst, setNeedsInstallFirst] = useState(false);
  // خانة "تنبيهات البلاغات" مقصورة على آيفون فقط — باقي الأجهزة ما تشوفها.
  const [showPushSetting, setShowPushSetting] = useState(false);

  useEffect(() => {
    setShowPushSetting(isIphone());
    setNeedsInstallFirst(isIosSafari() && !isRunningAsInstalledApp());
    getPushPermission().then(setPushGranted);
    return onPushPermissionChange(setPushGranted);
  }, []);

  function handleEnablePush() {
    // Must be the very first thing that runs in this handler — iOS only
    // shows its native "Allow" dialog when the request happens
    // synchronously inside a real tap.
    requestPushPermissionOnUserGesture();
  }

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
      setDownloadError(err instanceof Error ? err.message : t("settings.downloadFailed"));
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
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // No session once the check is done — go straight to the login page
  // instead of showing a "please sign in" screen the person has to tap
  // through.
  useEffect(() => {
    if (authChecked && !session) router.replace("/login");
  }, [authChecked, session, router]);

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
    clearLoginMark();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!session) {
    // authChecked is true and there's no session, so the redirect effect
    // above is already sending them to /login — this link is just a
    // fallback in case that navigation is ever slow to kick in.
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <a href="/login" className="text-blue-600 dark:text-blue-400 underline text-sm font-medium">
          {t("login.signIn")}
        </a>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 bg-slate-900 dark:bg-black text-white px-4 pt-safe pb-3 pt-3">
        <h1 className="font-semibold text-[15px]">{t("settings.title")}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        <PendingUploads />

        {profile && (
          <SettingsGroup title={t("settings.account")}>
            <div className="px-4 py-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-base shrink-0">
                {profile.full_name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {profile.full_name}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {roleLabel(t, profile.role)}
                  {profile.company ? ` · ${profile.company}` : ""}
                </p>
              </div>
            </div>
          </SettingsGroup>
        )}

        <SettingsGroup title={t("settings.appearance")}>
          <SettingsRow
            label={t("settings.theme")}
            description={t("settings.themeDesc")}
            control={
              <SegmentedControl<ThemeMode>
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: t("settings.light") },
                  { value: "dark", label: t("settings.dark") },
                  { value: "system", label: t("settings.auto") },
                ]}
              />
            }
          />
          <SettingsRow
            label={t("settings.textSize")}
            description={t("settings.textSizeDesc")}
            control={
              <SegmentedControl<TextSizeMode>
                value={textSize}
                onChange={setTextSize}
                options={[
                  { value: "standard", label: t("settings.standard") },
                  { value: "large", label: t("settings.large") },
                ]}
              />
            }
          />
          <SettingsRow
            label={t("settings.language")}
            description={t("settings.languageDesc")}
            control={
              <SegmentedControl<LanguageMode>
                value={language}
                onChange={setLanguage}
                options={[
                  { value: "en", label: "English" },
                  { value: "ar", label: "العربية" },
                  { value: "zh", label: "中文" },
                ]}
              />
            }
          />
        </SettingsGroup>

        {showPushSetting && (
          <SettingsGroup title={t("settings.notifications")}>
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{t("settings.reportAlerts")}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {needsInstallFirst
                    ? t("settings.reportAlertsNeedsInstall")
                    : pushGranted
                    ? t("settings.reportAlertsEnabledDesc")
                    : t("settings.reportAlertsDisabledDesc")}
                </p>
              </div>
              <div className="shrink-0">
                {pushGranted === null ? null : pushGranted ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t("settings.reportAlertsEnabledBadge")}
                  </span>
                ) : (
                  <button
                    onClick={handleEnablePush}
                    disabled={needsInstallFirst}
                    className="tap text-xs font-semibold py-2 px-3.5 rounded-xl bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white whitespace-nowrap"
                  >
                    {t("settings.reportAlertsEnableCta")}
                  </button>
                )}
              </div>
            </div>
          </SettingsGroup>
        )}

        <SettingsGroup title={t("settings.appMode")}>
          <div className="p-3 flex gap-2.5">
            <AppModeCard
              selected={uiMode === "modern"}
              onClick={() => setUiMode("modern")}
              gradient="from-sky-400 to-blue-600"
              icon="🗺️"
              title={t("settings.appModeModernTitle")}
              description={t("settings.appModeModernDesc")}
            />
            <AppModeCard
              selected={uiMode === "classic"}
              onClick={() => setUiMode("classic")}
              gradient="from-amber-400 to-orange-600"
              icon="⚡"
              title={t("settings.appModeClassicTitle")}
              description={t("settings.appModeClassicDesc")}
            />
          </div>
        </SettingsGroup>

        {uiMode === "modern" && (
          <SettingsGroup title={t("settings.map")}>
            <SettingsRow
              label={t("settings.defaultBasemap")}
              description={t("settings.basemapDesc")}
              control={
                <SegmentedControl<BasemapMode>
                  value={basemap}
                  onChange={setBasemap}
                  options={[
                    { value: "satellite", label: t("settings.satellite") },
                    { value: "streets", label: t("settings.streets") },
                  ]}
                />
              }
            />
          </SettingsGroup>
        )}

        {uiMode === "modern" && (
        <SettingsGroup title={t("settings.offlineMap")}>
          <div className="px-4 py-3.5 space-y-3">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {t("settings.downloadTitle")}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {cachedTiles && cachedTiles > 0
                  ? t("settings.downloadDescCached", { n: cachedTiles.toLocaleString() })
                  : t("settings.downloadDescNotCached")}
              </p>
              {estimate && !downloading && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {t("settings.estimateLine", {
                    tiles: estimate.tileCount.toLocaleString(),
                    mb: estimate.approxMB,
                  })}
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
                  {t("settings.progressLine", {
                    done: progress.done.toLocaleString(),
                    total: progress.total.toLocaleString(),
                  })}
                  {progress.failed > 0 ? t("settings.progressFailed", { n: progress.failed }) : ""}
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
                  {t("common.cancel")}
                </button>
              ) : (
                <button
                  onClick={handleDownload}
                  disabled={!isOnline}
                  className="tap flex-1 text-xs font-semibold py-2.5 rounded-xl bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white"
                >
                  {cachedTiles && cachedTiles > 0 ? t("settings.redownload") : t("settings.downloadForOffline")}
                </button>
              )}
              {!downloading && cachedTiles !== null && cachedTiles > 0 && (
                <button
                  onClick={handleClearOffline}
                  className="tap text-xs font-semibold py-2.5 px-3 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400"
                >
                  {t("settings.clear")}
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
                {t("settings.offlineNeedsNet")}
              </p>
            )}
          </div>
        </SettingsGroup>
        )}

        <SettingsGroup>
          <button onClick={handleSignOut} className="tap w-full px-4 py-3.5 text-sm font-medium text-red-600 dark:text-red-400 text-center">
            {t("settings.signOut")}
          </button>
        </SettingsGroup>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-600 pt-2 pb-4">
          {t("settings.footer")}
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
