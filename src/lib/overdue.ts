import type { Observation } from "@/types";

// An observation only counts as "overdue" once a full day has passed
// since its due date — a due date that just slipped by an hour ago isn't
// worth flagging yet, and this avoids the badge flickering on the moment
// the deadline ticks over.
const OVERDUE_GRACE_MS = 24 * 60 * 60 * 1000;

export function isObservationOverdue(obs: Observation): boolean {
  if (obs.status === "closed" || !obs.due_date) return false;
  const dueTime = new Date(obs.due_date).getTime();
  return Date.now() - dueTime > OVERDUE_GRACE_MS;
}
