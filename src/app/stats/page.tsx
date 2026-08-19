"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { cacheProfile, getCachedProfile, cacheObservations, getCachedObservations } from "@/lib/localCache";
import type { Observation, Profile, ObservationPriority } from "@/types";
import type { Session } from "@supabase/supabase-js";
import BottomNav from "@/components/BottomNav";
import { useT, roleLabel, priorityLabel } from "@/lib/i18n";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

interface WeekWindow {
  start: Date;
  end: Date; // exclusive
}

function getWeekWindows(): { thisWeek: WeekWindow; lastWeek: WeekWindow } {
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const thisWeekStart = startOfDay(new Date(todayEnd));
  thisWeekStart.setDate(thisWeekStart.getDate() - 6); // rolling 7-day window including today

  const lastWeekEnd = new Date(thisWeekStart);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  return {
    thisWeek: { start: thisWeekStart, end: new Date(todayEnd.getTime() + 1) },
    lastWeek: { start: lastWeekStart, end: lastWeekEnd },
  };
}

interface WeekStats {
  created: number;
  closed: number;
  critical: number;
  avgCloseHours: number | null;
}

function computeStats(observations: Observation[], window: WeekWindow): WeekStats {
  const inWindow = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= window.start.getTime() && t < window.end.getTime();
  };

  const created = observations.filter((o) => inWindow(o.created_at));
  const closed = observations.filter((o) => inWindow(o.closed_at));
  const critical = created.filter((o) => o.priority === "critical");

  const closeTimes = closed
    .filter((o) => o.closed_at)
    .map((o) => (new Date(o.closed_at as string).getTime() - new Date(o.created_at).getTime()) / 3600000)
    .filter((h) => h >= 0);

  const avgCloseHours =
    closeTimes.length > 0 ? closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length : null;

  return { created: created.length, closed: closed.length, critical: critical.length, avgCloseHours };
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const { t } = useT();
  if (previous === 0 && current === 0) {
    return <span className="text-xs text-slate-400">{t("stats.noChange")}</span>;
  }
  if (previous === 0) {
    return <span className="text-xs text-green-600 font-medium">{t("stats.newBadge")}</span>;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs text-slate-400">{t("stats.noChange")}</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs font-medium ${up ? "text-red-600" : "text-green-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% {t("stats.vsLastWeek")}
    </span>
  );
}

const PRIORITIES: ObservationPriority[] = ["critical", "high", "medium", "low"];
const PRIORITY_COLORS: Record<ObservationPriority, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
  low: "#65a30d",
};

export default function StatsPage() {
  const { t } = useT();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
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

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("observations")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setObservations(data ?? []);
        cacheObservations(data ?? []);
      } catch (err) {
        // Offline, most likely — this used to leave the page stuck on
        // "Loading..." forever, since nothing ever called setLoading(false)
        // if the fetch itself failed rather than resolving with an error.
        // Falling back to the last cached observations means the charts
        // still render (from slightly stale data) with zero signal.
        console.error("Failed to load observations for stats:", err);
        const cached = getCachedObservations();
        if (cached.length > 0) setObservations(cached);
      } finally {
        setLoading(false);
      }
    })();
  }, [session]);

  const { thisWeek, lastWeek } = useMemo(() => getWeekWindows(), []);
  const thisWeekStats = useMemo(() => computeStats(observations, thisWeek), [observations, thisWeek]);
  const lastWeekStats = useMemo(() => computeStats(observations, lastWeek), [observations, lastWeek]);

  const thisWeekLabel = t("stats.thisWeek");
  const lastWeekLabel = t("stats.lastWeek");

  // Grouped bar chart data: This Week vs Last Week, for New/Closed/Critical.
  // The object keys stay in English (they're just data-series keys recharts
  // uses internally) — display text comes from the translated `name` prop
  // on each <Bar>, not from these keys.
  const comparisonChartData = useMemo(
    () => [
      { metric: t("stats.metricNew"), thisWeek: thisWeekStats.created, lastWeek: lastWeekStats.created },
      { metric: t("stats.metricClosed"), thisWeek: thisWeekStats.closed, lastWeek: lastWeekStats.closed },
      { metric: t("stats.metricCritical"), thisWeek: thisWeekStats.critical, lastWeek: lastWeekStats.critical },
    ],
    [thisWeekStats, lastWeekStats, t]
  );

  // Priority breakdown chart data
  const priorityChartData = useMemo(() => {
    return PRIORITIES.map((p) => {
      const inThis = observations.filter(
        (o) =>
          o.priority === p &&
          new Date(o.created_at) >= thisWeek.start &&
          new Date(o.created_at) < thisWeek.end
      ).length;
      const inLast = observations.filter(
        (o) =>
          o.priority === p &&
          new Date(o.created_at) >= lastWeek.start &&
          new Date(o.created_at) < lastWeek.end
      ).length;
      return { priorityRaw: p, priority: priorityLabel(t, p), thisWeek: inThis, lastWeek: inLast };
    });
  }, [observations, thisWeek, lastWeek, t]);

  // 14-day daily trend: bar per day, colored by which week it falls in
  const dailyTrendData = useMemo(() => {
    const days: { date: string; label: string; count: number; isThisWeek: boolean }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = startOfDay(new Date());
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const count = observations.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length;

      days.push({
        date: dayStart.toISOString(),
        label: dayStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        count,
        isThisWeek: i < 7,
      });
    }
    return days;
  }, [observations]);

  const totals = useMemo(() => {
    const open = observations.filter((o) => o.status === "open").length;
    const inProgress = observations.filter((o) => o.status === "in_progress").length;
    const closed = observations.filter((o) => o.status === "closed").length;
    return { open, inProgress, closed, total: observations.length };
  }, [observations]);

  if (!session) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">{t("common.pleaseSignIn")}</p>
          <a href="/login" className="text-blue-600 dark:text-blue-400 underline">{t("common.goToLogin")}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 bg-slate-900 dark:bg-black text-white px-4 pt-safe pb-3 pt-3">
        <h1 className="font-semibold text-[15px]">{t("stats.header")}</h1>
        {profile && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            {profile.full_name} · {roleLabel(t, profile.role)}
          </p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto max-w-4xl w-full mx-auto p-4 space-y-6 pb-8">
        {loading ? (
          <div className="text-center text-slate-400 py-12">{t("common.loading")}</div>
        ) : (
          <>
            {/* All-time totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: t("stats.open"), value: totals.open, color: "text-red-600" },
                { label: t("stats.inProgress"), value: totals.inProgress, color: "text-amber-600" },
                { label: t("stats.closed"), value: totals.closed, color: "text-green-600" },
                { label: t("stats.totalAllTime"), value: totals.total, color: "text-slate-700" },
              ].map((s) => (
                <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* 14-day daily trend chart */}
            <div>
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">{t("stats.dailyTrend")}</h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval={1} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: number) => [value, t("stats.newObservations")]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {dailyTrendData.map((d, i) => (
                        <Cell key={i} fill={d.isThisWeek ? "#2563eb" : "#cbd5e1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 text-xs text-slate-500 justify-center mt-1">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> {thisWeekLabel}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> {lastWeekLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* This week vs last week comparison chart + numbers */}
            <div>
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">{t("stats.thisWeekVsLastWeek")}</h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={comparisonChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="metric" tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="thisWeek" name={thisWeekLabel} fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lastWeek" name={lastWeekLabel} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-3">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 space-y-3">
                  <div className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">{t("stats.thisWeekDetail")}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xl font-bold text-slate-800">{thisWeekStats.created}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.newObservations")}</div>
                      <Delta current={thisWeekStats.created} previous={lastWeekStats.created} />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-green-700">{thisWeekStats.closed}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.closed")}</div>
                      <Delta current={thisWeekStats.closed} previous={lastWeekStats.closed} />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-red-700">{thisWeekStats.critical}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.criticalRaised")}</div>
                      <Delta current={thisWeekStats.critical} previous={lastWeekStats.critical} />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-slate-800">
                        {thisWeekStats.avgCloseHours !== null ? `${thisWeekStats.avgCloseHours.toFixed(1)}h` : "—"}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.avgTimeToClose")}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 space-y-3">
                  <div className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">{t("stats.lastWeekDetail")}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xl font-bold text-slate-500">{lastWeekStats.created}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.newObservations")}</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-slate-500">{lastWeekStats.closed}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.closed")}</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-slate-500">{lastWeekStats.critical}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.criticalRaised")}</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-slate-500">
                        {lastWeekStats.avgCloseHours !== null ? `${lastWeekStats.avgCloseHours.toFixed(1)}h` : "—"}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{t("stats.avgTimeToClose")}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Priority breakdown chart */}
            <div>
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-2">{t("stats.priorityBreakdown")}</h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={priorityChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="priority" tick={{ fontSize: 12, fill: "#64748b" }} className="capitalize" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="thisWeek" name={thisWeekLabel} radius={[4, 4, 0, 0]}>
                      {priorityChartData.map((row, i) => (
                        <Cell key={i} fill={PRIORITY_COLORS[row.priorityRaw]} />
                      ))}
                    </Bar>
                    <Bar dataKey="lastWeek" name={lastWeekLabel} fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
