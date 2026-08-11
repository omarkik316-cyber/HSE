"use client";

import { useMemo, useState } from "react";
import type { Observation, ObservationStatus, ObservationPriority } from "@/types";
import { STATUS_LABELS, CATEGORIES } from "@/types";

export interface Filters {
  statuses: Set<ObservationStatus>;
  priorities: Set<ObservationPriority>;
  category: string; // "all" or a specific category
  zone: string; // "all" or a specific zone_name
}

export const ALL_STATUSES: ObservationStatus[] = ["open", "in_progress", "pending_review", "closed"];
export const ALL_PRIORITIES: ObservationPriority[] = ["low", "medium", "high", "critical"];

export function defaultFilters(): Filters {
  return {
    statuses: new Set(ALL_STATUSES),
    priorities: new Set(ALL_PRIORITIES),
    category: "all",
    zone: "all",
  };
}

export function applyFilters(observations: Observation[], filters: Filters): Observation[] {
  return observations.filter((o) => {
    if (!filters.statuses.has(o.status)) return false;
    if (!filters.priorities.has(o.priority)) return false;
    if (filters.category !== "all" && o.category !== filters.category) return false;
    if (filters.zone !== "all" && o.zone_name !== filters.zone) return false;
    return true;
  });
}

const STATUS_CHIP_STYLE: Record<ObservationStatus, { active: string; inactive: string }> = {
  open: {
    active: "bg-red-600 text-white border-red-600",
    inactive: "bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900",
  },
  in_progress: {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900",
  },
  pending_review: {
    active: "bg-cyan-600 text-white border-cyan-600",
    inactive: "bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-900",
  },
  closed: {
    active: "bg-green-600 text-white border-green-600",
    inactive: "bg-white dark:bg-slate-800 text-green-600 dark:text-green-400 border-green-200 dark:border-green-900",
  },
};

const PRIORITY_CHIP_STYLE: Record<ObservationPriority, { active: string; inactive: string }> = {
  low: { active: "bg-lime-600 text-white border-lime-600", inactive: "bg-white dark:bg-slate-800 text-lime-700 dark:text-lime-400 border-lime-200 dark:border-lime-900" },
  medium: {
    active: "bg-amber-600 text-white border-amber-600",
    inactive: "bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900",
  },
  high: {
    active: "bg-orange-600 text-white border-orange-600",
    inactive: "bg-white dark:bg-slate-800 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900",
  },
  critical: { active: "bg-red-700 text-white border-red-700", inactive: "bg-white dark:bg-slate-800 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900" },
};

interface FilterBarProps {
  observations: Observation[]; // full unfiltered list, used to build the zone dropdown
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function FilterBar({ observations, filters, onChange }: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Draft state so the sheet can be dismissed without applying half-made
  // changes, mirroring the "Cancel / Apply" pattern of a native filter sheet.
  const [draft, setDraft] = useState<Filters>(filters);

  const zoneOptions = useMemo(() => {
    const zones = new Set<string>();
    observations.forEach((o) => {
      if (o.zone_name) zones.add(o.zone_name);
    });
    return Array.from(zones).sort();
  }, [observations]);

  function toggleStatus(status: ObservationStatus) {
    const next = new Set(filters.statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    // Never allow an empty set — that would silently hide everything.
    if (next.size === 0) return;
    onChange({ ...filters, statuses: next });
  }

  function toggleDraftPriority(priority: ObservationPriority) {
    setDraft((d) => {
      const next = new Set(d.priorities);
      if (next.has(priority)) next.delete(priority);
      else next.add(priority);
      if (next.size === 0) return d;
      return { ...d, priorities: next };
    });
  }

  const isDefault =
    filters.statuses.size === ALL_STATUSES.length &&
    filters.priorities.size === ALL_PRIORITIES.length &&
    filters.category === "all" &&
    filters.zone === "all";

  const activeExtraCount =
    (ALL_PRIORITIES.length - filters.priorities.size) +
    (filters.category !== "all" ? 1 : 0) +
    (filters.zone !== "all" ? 1 : 0);

  function openSheet() {
    setDraft(filters);
    setSheetOpen(true);
  }

  function applySheet() {
    onChange(draft);
    setSheetOpen(false);
  }

  function resetAll() {
    onChange(defaultFilters());
    setDraft(defaultFilters());
    setSheetOpen(false);
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        {/* Quick status chips — horizontal scroll, never wraps, so nothing
            crowds or overlaps on a narrow phone screen. */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {ALL_STATUSES.map((s) => {
            const active = filters.statuses.has(s);
            const style = STATUS_CHIP_STYLE[s];
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`tap shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium ${
                  active ? style.active : style.inactive
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>

        <button
          onClick={openSheet}
          className="tap shrink-0 relative flex items-center gap-1 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Filters
          {activeExtraCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center font-bold">
              {activeExtraCount}
            </span>
          )}
        </button>

        {!isDefault && (
          <button
            onClick={resetAll}
            className="tap shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500 px-1"
          >
            Reset
          </button>
        )}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setSheetOpen(false)}
          />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl shadow-sheet max-h-[85vh] flex flex-col animate-sheet-up">
            <div className="sheet-handle" />
            <div className="px-5 pb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold">Filters</h3>
              <button onClick={() => setSheetOpen(false)} className="tap text-slate-400 text-lg px-2">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Priority</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_PRIORITIES.map((p) => {
                    const active = draft.priorities.has(p);
                    const style = PRIORITY_CHIP_STYLE[p];
                    return (
                      <button
                        key={p}
                        onClick={() => toggleDraftPriority(p)}
                        className={`tap px-3 py-1.5 rounded-full border text-xs font-semibold uppercase ${
                          active ? style.active : style.inactive
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Category</p>
                <label htmlFor="filter-category" className="sr-only">Filter by category</label>
                <select
                  id="filter-category"
                  name="category_filter"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800"
                >
                  <option value="all">All Categories</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Zone</p>
                <label htmlFor="filter-zone" className="sr-only">Filter by zone</label>
                <select
                  id="filter-zone"
                  name="zone_filter"
                  value={draft.zone}
                  onChange={(e) => setDraft((d) => ({ ...d, zone: e.target.value }))}
                  className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-slate-800"
                >
                  <option value="all">All Zones</option>
                  {zoneOptions.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-5 pt-3 pb-safe border-t border-slate-100 dark:border-slate-800 flex gap-2 mb-4">
              <button
                onClick={resetAll}
                className="tap px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300"
              >
                Reset
              </button>
              <button
                onClick={applySheet}
                className="tap flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
