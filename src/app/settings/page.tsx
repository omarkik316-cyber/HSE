"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useSettings, type BasemapMode, type TextSizeMode, type ThemeMode } from "@/lib/settings";
import BottomNav from "@/components/BottomNav";
import type { Profile } from "@/types";
import { ROLE_LABELS } from "@/types";
import type { Session } from "@supabase/supabase-js";

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
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

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
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data));
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
