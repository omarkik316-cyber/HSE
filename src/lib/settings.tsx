"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type BasemapMode = "satellite" | "streets";
export type TextSizeMode = "standard" | "large";

interface Settings {
  theme: ThemeMode;
  basemap: BasemapMode;
  textSize: TextSizeMode;
}

interface SettingsContextValue extends Settings {
  setTheme: (theme: ThemeMode) => void;
  setBasemap: (basemap: BasemapMode) => void;
  setTextSize: (size: TextSizeMode) => void;
}

const DEFAULTS: Settings = { theme: "system", basemap: "satellite", textSize: "standard" };
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

  const value = useMemo(
    () => ({ ...settings, setTheme, setBasemap, setTextSize }),
    [settings, setTheme, setBasemap, setTextSize]
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
    };
  }
  return ctx;
}
