"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type BasemapMode = "satellite" | "streets";
export type TextSizeMode = "standard" | "large";
export type LanguageMode = "en" | "ar" | "zh";
// "modern" is the full interactive-map experience. "classic" never loads
// Leaflet or any map tiles at all — it's a map-free, list-first layout
// built for raising a report as fast as possible, and it doubles as an
// escape hatch on devices/WebViews where the map itself won't render.
export type UiMode = "modern" | "classic";

interface Settings {
  theme: ThemeMode;
  basemap: BasemapMode;
  textSize: TextSizeMode;
  language: LanguageMode;
  uiMode: UiMode;
}

interface SettingsContextValue extends Settings {
  setTheme: (theme: ThemeMode) => void;
  setBasemap: (basemap: BasemapMode) => void;
  setTextSize: (size: TextSizeMode) => void;
  setLanguage: (language: LanguageMode) => void;
  setUiMode: (mode: UiMode) => void;
}

// English is the app's default/base language now — Arabic and Chinese are
// opt-in from Settings rather than the starting language, since most of
// this deployment's day-to-day users work in English.
const DEFAULTS: Settings = {
  theme: "system",
  basemap: "satellite",
  textSize: "standard",
  language: "en",
  uiMode: "modern",
};
const STORAGE_KEY = "hse-app-settings";

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readStoredSettings(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function applyThemeToDocument(theme: ThemeMode) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", !!isDark);
}

function applyTextSizeToDocument(size: TextSizeMode) {
  document.documentElement.style.fontSize = size === "large" ? "18px" : "16px";
}

// Arabic is the only one of the three that reads right-to-left — this is
// what actually flips the whole layout (nav order, alignment, icon
// mirroring) via the browser's native `dir` handling, not per-component
// CSS.
function applyLanguageToDocument(language: LanguageMode) {
  const root = document.documentElement;
  root.lang = language;
  root.dir = language === "ar" ? "rtl" : "ltr";
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredSettings();
    setSettings(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyThemeToDocument(settings.theme);
    applyTextSizeToDocument(settings.textSize);
    applyLanguageToDocument(settings.language);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  // React to OS-level theme changes when the user picked "system".
  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyThemeToDocument("system");
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [settings.theme]);

  const setTheme = useCallback((theme: ThemeMode) => setSettings((s) => ({ ...s, theme })), []);
  const setBasemap = useCallback((basemap: BasemapMode) => setSettings((s) => ({ ...s, basemap })), []);
  const setTextSize = useCallback((textSize: TextSizeMode) => setSettings((s) => ({ ...s, textSize })), []);
  const setLanguage = useCallback((language: LanguageMode) => setSettings((s) => ({ ...s, language })), []);
  const setUiMode = useCallback((uiMode: UiMode) => setSettings((s) => ({ ...s, uiMode })), []);

  const value = useMemo(
    () => ({ ...settings, setTheme, setBasemap, setTextSize, setLanguage, setUiMode }),
    [settings, setTheme, setBasemap, setTextSize, setLanguage, setUiMode]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    // Fail soft with defaults instead of throwing, so a stray usage outside
    // the provider never crashes the whole page.
    return {
      ...DEFAULTS,
      setTheme: () => {},
      setBasemap: () => {},
      setTextSize: () => {},
      setLanguage: () => {},
      setUiMode: () => {},
    };
  }
  return ctx;
}
