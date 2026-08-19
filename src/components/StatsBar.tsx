"use client";

import type { Observation } from "@/types";
import { isObservationOverdue } from "@/lib/overdue";
import { useT } from "@/lib/i18n";

export default function StatsBar({ observations }: { observations: Observation[] }) {
  const { t } = useT();
  const open = observations.filter((o) => o.status === "open").length;
  const inProgress = observations.filter((o) => o.status === "in_progress").length;
  const pendingReview = observations.filter((o) => o.status === "pending_review").length;
  const closed = observations.filter((o) => o.status === "closed").length;
  const overdue = observations.filter(isObservationOverdue).length;
  const critical = observations.filter(
    (o) => o.status !== "closed" && o.priority === "critical"
  ).length;

  const stats = [
    { label: t("statsBar.open"), value: open, color: "text-red-600 dark:text-red-400" },
    { label: t("statsBar.inProgress"), value: inProgress, color: "text-amber-600 dark:text-amber-400" },
    { label: t("statsBar.pendingReview"), value: pendingReview, color: "text-cyan-600 dark:text-cyan-400" },
    { label: t("statsBar.overdue"), value: overdue, color: "text-red-700 dark:text-red-400" },
    { label: t("statsBar.critical"), value: critical, color: "text-red-800 dark:text-red-300" },
    { label: t("statsBar.closed"), value: closed, color: "text-green-600 dark:text-green-400" },
    { label: t("statsBar.total"), value: observations.length, color: "text-slate-700 dark:text-slate-200" },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
      <div className="flex gap-2 overflow-x-auto no-scrollbar px-3 py-2.5 snap-x snap-mandatory">
        {stats.map((s) => (
          <div
            key={s.label}
            className="snap-start shrink-0 min-w-[84px] bg-slate-50 dark:bg-slate-800/70 rounded-2xl px-3 py-2 text-center"
          >
            <div className={`text-lg font-bold leading-tight ${s.color}`}>{s.value}</div>
            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-tight whitespace-nowrap">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
