import type { ObservationStatus, ObservationPriority } from "@/types";
import { STATUS_LABELS } from "@/types";

const STATUS_STYLES: Record<ObservationStatus, string> = {
  open: "bg-red-100 text-red-700 border-red-300",
  in_progress: "bg-amber-100 text-amber-700 border-amber-300",
  pending_review: "bg-cyan-100 text-cyan-700 border-cyan-300",
  closed: "bg-green-100 text-green-700 border-green-300",
};

const PRIORITY_STYLES: Record<ObservationPriority, string> = {
  low: "bg-lime-100 text-lime-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: ObservationStatus }) {
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: ObservationPriority }) {
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded-full uppercase ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  );
}
