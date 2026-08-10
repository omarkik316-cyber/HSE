import type { Observation } from "@/types";

export default function StatsBar({ observations }: { observations: Observation[] }) {
  const open = observations.filter((o) => o.status === "open").length;
  const inProgress = observations.filter((o) => o.status === "in_progress").length;
  const pendingReview = observations.filter((o) => o.status === "pending_review").length;
  const closed = observations.filter((o) => o.status === "closed").length;
  const overdue = observations.filter(
    (o) => o.status !== "closed" && o.due_date && new Date(o.due_date) < new Date()
  ).length;
  const critical = observations.filter(
    (o) => o.status !== "closed" && o.priority === "critical"
  ).length;

  const stats = [
    { label: "Open", value: open, color: "text-red-600" },
    { label: "In Progress", value: inProgress, color: "text-amber-600" },
    { label: "Pending Review", value: pendingReview, color: "text-cyan-600" },
    { label: "Closed", value: closed, color: "text-green-600" },
    { label: "Overdue", value: overdue, color: "text-red-700" },
    { label: "Critical (active)", value: critical, color: "text-red-800" },
    { label: "Total", value: observations.length, color: "text-slate-700" },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-7 gap-2 p-3 bg-white border-b">
      {stats.map((s) => (
        <div key={s.label} className="text-center px-2 py-1">
          <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
          <div className="text-[11px] text-gray-500">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
