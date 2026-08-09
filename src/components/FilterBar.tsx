"use client";

import { useMemo } from "react";
import type { Observation, ObservationStatus, ObservationPriority } from "@/types";
import { STATUS_LABELS, CATEGORIES } from "@/types";

export interface Filters {
  statuses: Set<ObservationStatus>;
  priorities: Set<ObservationPriority>;
  category: string; // "all" or a specific category
  zone: string; // "all" or a specific zone_name
}

export const ALL_STATUSES: ObservationStatus[] = ["open", "in_progress", "closed"];
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
  open: { active: "bg-red-600 text-white border-red-600", inactive: "bg-white text-red-600 border-red-300" },
  in_progress: {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "bg-white text-amber-600 border-amber-300",
  },
  closed: {
    active: "bg-green-600 text-white border-green-600",
    inactive: "bg-white text-green-600 border-green-300",
  },
};

const PRIORITY_CHIP_STYLE: Record<ObservationPriority, { active: string; inactive: string }> = {
  low: { active: "bg-lime-600 text-white border-lime-600", inactive: "bg-white text-lime-700 border-lime-300" },
  medium: {
    active: "bg-amber-600 text-white border-amber-600",
    inactive: "bg-white text-amber-700 border-amber-300",
  },
  high: {
    active: "bg-orange-600 text-white border-orange-600",
    inactive: "bg-white text-orange-700 border-orange-300",
  },
  critical: { active: "bg-red-700 text-white border-red-700", inactive: "bg-white text-red-700 border-red-300" },
};

interface FilterBarProps {
  observations: Observation[]; // full unfiltered list, used to build the zone dropdown
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function FilterBar({ observations, filters, onChange }: FilterBarProps) {
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

  function togglePriority(priority: ObservationPriority) {
    const next = new Set(filters.priorities);
    if (next.has(priority)) next.delete(priority);
    else next.add(priority);
    if (next.size === 0) return;
    onChange({ ...filters, priorities: next });
  }

  const isDefault =
    filters.statuses.size === ALL_STATUSES.length &&
    filters.priorities.size === ALL_PRIORITIES.length &&
    filters.category === "all" &&
    filters.zone === "all";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-white border-b text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 font-medium mr-0.5">Status</span>
        {ALL_STATUSES.map((s) => {
          const active = filters.statuses.has(s);
          const style = STATUS_CHIP_STYLE[s];
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-2.5 py-1 rounded-full border font-medium transition ${
                active ? style.active : style.inactive
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>

      <div className="w-px h-5 bg-slate-200 hidden sm:block" />

      <div className="flex items-center gap-1.5">
        <span className="text-slate-400 font-medium mr-0.5">Priority</span>
        {ALL_PRIORITIES.map((p) => {
          const active = filters.priorities.has(p);
          const style = PRIORITY_CHIP_STYLE[p];
          return (
            <button
              key={p}
              onClick={() => togglePriority(p)}
              className={`px-2.5 py-1 rounded-full border font-semibold uppercase transition ${
                active ? style.active : style.inactive
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      <div className="w-px h-5 bg-slate-200 hidden sm:block" />

      <label htmlFor="filter-category" className="sr-only">Filter by category</label>
      <select
        id="filter-category"
        name="category_filter"
        value={filters.category}
        onChange={(e) => onChange({ ...filters, category: e.target.value })}
        className="border rounded-full px-2.5 py-1 text-xs bg-white"
      >
        <option value="all">All Categories</option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <label htmlFor="filter-zone" className="sr-only">Filter by zone</label>
      <select
        id="filter-zone"
        name="zone_filter"
        value={filters.zone}
        onChange={(e) => onChange({ ...filters, zone: e.target.value })}
        className="border rounded-full px-2.5 py-1 text-xs bg-white"
      >
        <option value="all">All Zones</option>
        {zoneOptions.map((z) => (
          <option key={z} value={z}>{z}</option>
        ))}
      </select>

      {!isDefault && (
        <button
          onClick={() => onChange(defaultFilters())}
          className="px-2.5 py-1 rounded-full border border-slate-300 text-slate-500 hover:bg-slate-50 font-medium"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}
