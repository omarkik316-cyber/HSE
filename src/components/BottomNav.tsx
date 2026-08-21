"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useT } from "@/lib/i18n";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import type { Profile } from "@/types";

interface TabDef {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  match: (path: string) => boolean;
  requiresOnline?: boolean;
}

function MapIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4.5 3.5 6.7v13l5.5-2.2 6 2.2 5.5-2.2v-13L14.5 6.7 9 4.5Z"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
      <path d="M9 4.5v13M15 6.7v13" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="12" width="4" height="8" rx="1" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
      <rect x="10" y="8" width="4" height="12" rx="1" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
      <rect x="16" y="4" width="4" height="16" rx="1" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
    </svg>
  );
}

function PeopleIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
      <path d="M15.5 19c0-2.3 1.6-4.2 4-4.6" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
    </svg>
  );
}

function GearIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
      <path
        d="M19.4 13.5c.04-.33.06-.66.06-1s-.02-.67-.06-1l1.9-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1L14.9 4h-3.8l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4 1.9 1.5c-.04.33-.06.66-.06 1s.02.67.06 1l-1.9 1.5 2 3.4 2.3-.9c.5.44 1.08.78 1.7 1l.4 2.5h3.8l.4-2.5c.62-.22 1.2-.56 1.7-1l2.3.9 2-3.4-1.9-1.5Z"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();
  const isOnline = useOnlineStatus();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) return;
      supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .single()
        .then(({ data: p }) => {
          if (!cancelled) setProfile(p);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const tabs: TabDef[] = [
    { href: "/", label: t("nav.map"), icon: (a) => <MapIcon active={a} />, match: (p) => p === "/" },
    { href: "/stats", label: t("nav.stats"), icon: (a) => <ChartIcon active={a} />, match: (p) => p.startsWith("/stats"), requiresOnline: true },
  ];

  if (profile?.role === "admin") {
    tabs.push({
      href: "/admin/users",
      label: t("nav.users"),
      icon: (a) => <PeopleIcon active={a} />,
      match: (p) => p.startsWith("/admin"),
    });
  }

  tabs.push({
    href: "/settings",
    label: t("nav.settings"),
    icon: (a) => <GearIcon active={a} />,
    match: (p) => p.startsWith("/settings"),
  });

  return (
    <nav
      className="shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe"
      role="navigation"
      aria-label={t("nav.primary")}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = tab.match(pathname ?? "");
          const disabled = !!tab.requiresOnline && !isOnline;
          return (
            <button
              key={tab.href}
              onClick={() => {
                if (disabled) return;
                router.push(tab.href);
              }}
              disabled={disabled}
              aria-disabled={disabled}
              title={disabled ? t("nav.requiresInternet") : undefined}
              className={`tap flex flex-col items-center justify-center gap-0.5 py-2 pt-2.5 ${
                disabled
                  ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                  : active
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {tab.icon(active && !disabled)}
              <span className={`text-[10px] ${active && !disabled ? "font-semibold" : "font-medium"}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
