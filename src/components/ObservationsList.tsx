"use client";

import { useMemo, useState } from "react";
import type { Observation, ObservationPriority } from "@/types";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { isObservationOverdue } from "@/lib/overdue";
import { useT, categoryLabel } from "@/lib/i18n";
import { useDateLocale } from "@/lib/dateLocale";

interface ObservationsListProps {
  observations: Observation[];
  onSelect: (observation: Observation) => void;
}

type SortMode = "priority_high" | "newest" | "oldest";

const PRIORITY_RANK: Record<ObservationPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export default function ObservationsList({ observations, onSelect }: ObservationsListProps) {
  const { t } = useT();
  const dateLocale = useDateLocale();
  const [sortMode, setSortMode] = useState<SortMode>("priority_high");

  const sorted = useMemo(() => {
    const copy = [...observations];
    if (sortMode === "priority_high") {
      copy.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
    } else if (sortMode === "newest") {
      copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      copy.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return copy;
  }, [observations, sortMode]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {observations.length === 1
            ? t("list.countOne", { n: observations.length })
            : t("list.count", { n: observations.length })}
        </span>
        <div>
          <label htmlFor="obs-sort" className="sr-only">{t("list.sortLabel")}</label>
          <select
            id="obs-sort"
            name="sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-800"
          >
            <option value="priority_high">{t("list.sortPriority")}</option>
            <option value="newest">{t("list.sortNewest")}</option>
            <option value="oldest">{t("list.sortOldest")}</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400 px-4 text-center">
          {t("list.noMatches")}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {sorted.map((obs) => {
            const isOverdue = isObservationOverdue(obs);
            const isConsultantReport = obs.profiles?.role === "consultant";

            return (
              <button
                key={obs.id}
                onClick={() => onSelect(obs)}
                className="tap w-full text-left px-4 py-3.5 active:bg-slate-50 dark:active:bg-slate-800/70 flex items-center gap-2"
              >
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate">
                      <span className="text-slate-400 dark:text-slate-500 font-normal">#{obs.ticket_no}</span>{" "}
                      {obs.title}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(obs.created_at), { locale: dateLocale, addSuffix: true })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge status={obs.status} />
                    <PriorityBadge priority={obs.priority} />
                    <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                      {categoryLabel(t, obs.category)}
                    </span>
                    {isConsultantReport && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-blue-600 text-white font-semibold">
                        {t("list.consultant")}
                      </span>
                    )}
                    {obs.claimed_by_profile && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        🔒 {obs.claimed_by_profile.full_name}
                      </span>
                    )}
                    {isOverdue && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-red-600 text-white font-semibold">
                        {t("list.overdue")}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3">
                    {obs.zone_name && <span>📍 {obs.zone_name}</span>}
                    {obs.assigned_contractor && <span>👷 {obs.assigned_contractor}</span>}
                  </div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-slate-300 dark:text-slate-600">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
