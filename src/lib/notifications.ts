import { supabase } from "@/lib/supabaseClient";
import type { NotificationRecord, NotificationTemplate, ObservationStatus } from "@/types";

const RECENT_LIMIT = 60;

/**
 * Loads the most recent notifications and stamps each one with whether the
 * given user has already read it. Two queries (not a join) because
 * `notification_reads` only has a row once someone reads something, and we
 * need "unread" to be the default for everyone else.
 */
export async function fetchNotificationsForUser(userId: string): Promise<NotificationRecord[]> {
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*, profiles(full_name, role)")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  if (error) {
    console.error("Failed to load notifications:", error.message);
    return [];
  }

  const { data: reads } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("user_id", userId);

  const readIds = new Set((reads ?? []).map((r) => r.notification_id));

  return (notifications ?? []).map((n) => ({ ...n, read: readIds.has(n.id) }));
}

export async function markNotificationRead(notificationId: string, userId: string) {
  // Composite primary key (notification_id, user_id) makes this safe to
  // call repeatedly without creating duplicate rows.
  const { error } = await supabase
    .from("notification_reads")
    .upsert({ notification_id: notificationId, user_id: userId }, { onConflict: "notification_id,user_id" });
  if (error) console.error("Failed to mark notification read:", error.message);
}

export async function markAllNotificationsRead(notificationIds: string[], userId: string) {
  if (notificationIds.length === 0) return;
  const rows = notificationIds.map((id) => ({ notification_id: id, user_id: userId }));
  const { error } = await supabase
    .from("notification_reads")
    .upsert(rows, { onConflict: "notification_id,user_id" });
  if (error) console.error("Failed to mark all notifications read:", error.message);
}

export async function notifyObservationCreated(params: {
  title: string;
  zoneName: string | null;
  observationId: string;
  createdBy: string;
}) {
  const zonePart = params.zoneName ? ` in ${params.zoneName}` : "";
  const { error } = await supabase.from("notifications").insert({
    type: "observation_created",
    title: "New Observation",
    message: `A new observation was added${zonePart}: ${params.title}`,
    zone_name: params.zoneName,
    observation_id: params.observationId,
    created_by: params.createdBy,
  });
  if (error) console.error("Failed to send observation-created notification:", error.message);
}

const STATUS_NOTIFICATION_TEXT: Record<ObservationStatus, string> = {
  open: "was reopened",
  in_progress: "is now being worked on",
  pending_review: "was submitted for review",
  closed: "was approved and closed",
};

export async function notifyStatusChanged(params: {
  title: string;
  zoneName: string | null;
  observationId: string;
  newStatus: ObservationStatus;
  actorId: string;
}) {
  const zonePart = params.zoneName ? ` in ${params.zoneName}` : "";
  const { error } = await supabase.from("notifications").insert({
    type: "status_changed",
    title: "Observation Update",
    message: `"${params.title}"${zonePart} ${STATUS_NOTIFICATION_TEXT[params.newStatus]}.`,
    zone_name: params.zoneName,
    observation_id: params.observationId,
    created_by: params.actorId,
  });
  if (error) console.error("Failed to send status-changed notification:", error.message);
}

export async function sendAdminBroadcast(params: { title: string; message: string; createdBy: string }) {
  const { error } = await supabase.from("notifications").insert({
    type: "admin_broadcast",
    title: params.title,
    message: params.message,
    created_by: params.createdBy,
  });
  if (error) throw error;
}

export async function fetchTemplates(): Promise<NotificationTemplate[]> {
  const { data, error } = await supabase
    .from("notification_templates")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load templates:", error.message);
    return [];
  }
  return data ?? [];
}

export async function createTemplate(title: string, message: string, createdBy: string) {
  const { error } = await supabase
    .from("notification_templates")
    .insert({ title, message, created_by: createdBy });
  if (error) throw error;
}

export async function updateTemplate(id: string, title: string, message: string) {
  const { error } = await supabase.from("notification_templates").update({ title, message }).eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from("notification_templates").delete().eq("id", id);
  if (error) throw error;
}
