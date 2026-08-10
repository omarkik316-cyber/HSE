"use client";

import { useMemo, useState } from "react";
import type { Observation, ObservationPriority } from "@/types";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import { formatDistanceToNow } from "date-fns";

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
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b bg-slate-50 shrink-0">
        <span className="text-xs text-slate-500 font-medium">
          {observations.length} observation{observations.length === 1 ? "" : "s"}
        </span>
        <div>
          <label htmlFor="obs-sort" className="sr-only">Sort by</label>
          <select
            id="obs-sort"
            name="sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs border rounded-lg px-2 py-1 bg-white"
          >
            <option value="priority_high">Priority: High → Low</option>
            <option value="newest">Date: Newest first</option>
            <option value="oldest">Date: Oldest first</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400 px-4 text-center">
          No observations match the current filters.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y">
          {sorted.map((obs) => {
            const isOverdue =
              obs.status !== "closed" && obs.due_date && new Date(obs.due_date) < new Date();
            const isConsultantReport = obs.profiles?.role === "consultant";

            return (
              <button
                key={obs.id}
                onClick={() => onSelect(obs)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition flex flex-col gap-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm text-slate-800">
                    <span className="text-slate-400 font-normal">#{obs.ticket_no}</span> {obs.title}
                  </span>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                    {formatDistanceToNow(new Date(obs.created_at))} ago
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusBadge status={obs.status} />
                  <PriorityBadge priority={obs.priority} />
                  <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-500">
                    {obs.category}
                  </span>
                  {isConsultantReport && (
                    <span className="text-[11px] px-2 py-1 rounded-full bg-blue-600 text-white font-semibold">
                      Consultant
                    </span>
                  )}
                  {isOverdue && (
                    <span className="text-[11px] px-2 py-1 rounded-full bg-red-600 text-white font-semibold">
                      OVERDUE
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                  {obs.zone_name && <span>📍 {obs.zone_name}</span>}
                  {obs.assigned_contractor && <span>👷 {obs.assigned_contractor}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
