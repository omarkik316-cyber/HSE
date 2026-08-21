import { supabase } from "@/lib/supabaseClient";
import type { NotificationRecord, NotificationTemplate, ObservationStatus } from "@/types";

const RECENT_LIMIT = 60;

/**
 * Android notification channel to use for a given push, so each event type
 * on the phone plays its own distinct sound (set up in the Android app's
 * HSEApplication.kt — createNotificationChannels()). Must match one of
 * those channel IDs exactly, or OneSignal falls back to its default channel
 * and the default sound. Keep this list in sync with the Android app.
 */
export type PushChannel =
  | "new_observation"
  | "observation_in_progress"
  | "observation_closed"
  | "supervisor_approved"
  | "supervisor_rejected"
  | "meeting"
  | "site_walk";

/**
 * Fires the real push notification (shows up in the phone's notification
 * tray, even with the app closed) via the send-push Edge Function. This is
 * best-effort and never throws — a push failure should never block the
 * in-app notification from being saved, since the bell already covers
 * anyone with the app open.
 */
async function triggerPush(
  title: string,
  message: string,
  observationId?: string,
  channel?: PushChannel
) {
  try {
    await supabase.functions.invoke("send-push", { body: { title, message, observationId, channel } });
  } catch (err) {
    console.error("Push notification failed to send:", err);
  }
}

/**
 * Loads the most recent notifications and stamps each one with whether the
 * given user has already read it. Three queries (not joins) because
 * `notification_reads`/`notification_clears` only have a row once someone
 * reads/clears something, and we need "unread"/"not cleared" to be the
 * default for everyone else.
 *
 * Read and cleared are deliberately separate: reading just highlights the
 * item (green, see NotificationBell) and keeps it in the list; clearing
 * (the "Clear all" button) is what actually removes it from this user's
 * feed. The underlying `notifications` row is never touched — it's a
 * shared broadcast other users still need to see.
 */
export async function fetchNotificationsForUser(userId: string): Promise<NotificationRecord[]> {
  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*, profiles!notifications_created_by_fkey(full_name, role)")
    .order("created_at", { ascending: false })
    .limit(RECENT_LIMIT);

  if (error) {
    console.error("Failed to load notifications:", error.message);
    return [];
  }

  const [{ data: reads }, { data: clears }] = await Promise.all([
    supabase.from("notification_reads").select("notification_id").eq("user_id", userId),
    supabase.from("notification_clears").select("notification_id").eq("user_id", userId),
  ]);

  const readIds = new Set((reads ?? []).map((r) => r.notification_id));
  const clearedIds = new Set((clears ?? []).map((c) => c.notification_id));

  return (notifications ?? [])
    .filter((n) => !clearedIds.has(n.id))
    .map((n) => ({ ...n, read: readIds.has(n.id) }));
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

/**
 * "Clear all" — hides the given notifications from this user's feed for
 * good (separate from read state; see fetchNotificationsForUser above).
 */
export async function clearAllNotifications(notificationIds: string[], userId: string) {
  if (notificationIds.length === 0) return;
  const rows = notificationIds.map((id) => ({ notification_id: id, user_id: userId }));
  const { error } = await supabase
    .from("notification_clears")
    .upsert(rows, { onConflict: "notification_id,user_id" });
  if (error) console.error("Failed to clear notifications:", error.message);
}

export async function notifyObservationCreated(params: {
  title: string;
  zoneName: string | null;
  observationId: string;
  createdBy: string;
}) {
  const zonePart = params.zoneName ? ` in ${params.zoneName}` : "";
  const message = `A new observation was added${zonePart}: ${params.title}`;
  const { error } = await supabase.from("notifications").insert({
    type: "observation_created",
    title: "New Observation",
    message,
    zone_name: params.zoneName,
    observation_id: params.observationId,
    created_by: params.createdBy,
  });
  if (error) {
    console.error("Failed to send observation-created notification:", error.message);
    return;
  }
  triggerPush("New Observation", message, params.observationId, "new_observation");
}

const STATUS_NOTIFICATION_TEXT: Record<ObservationStatus, string> = {
  open: "was reopened",
  in_progress: "is now being worked on",
  pending_review: "was submitted for review",
  closed: "was approved and closed",
};

// Default channel per resulting status. "in_progress" is deliberately absent
// here — it's reached both by someone claiming a fresh observation (see
// `context: "claimed"` below) and by a supervisor rejecting a submitted fix
// (`context: "rejected"`), and those two need different sounds even though
// they land on the same status value.
const STATUS_CHANNEL: Partial<Record<ObservationStatus, PushChannel>> = {
  closed: "supervisor_approved",
};

export async function notifyStatusChanged(params: {
  title: string;
  zoneName: string | null;
  observationId: string;
  newStatus: ObservationStatus;
  actorId: string;
  // Disambiguates the two real-world events that both set status to
  // "in_progress": a contractor/officer claiming a fresh observation, vs an
  // admin rejecting a submitted fix and sending it back for rework.
  context?: "claimed" | "rejected";
  rejectReason?: string;
}) {
  const zonePart = params.zoneName ? ` in ${params.zoneName}` : "";
  const isRejection = params.context === "rejected";

  const message = isRejection
    ? `"${params.title}"${zonePart} was rejected by the reviewer${
        params.rejectReason ? `: ${params.rejectReason}` : ""
      }`
    : `"${params.title}"${zonePart} ${STATUS_NOTIFICATION_TEXT[params.newStatus]}.`;

  const title = isRejection ? "Fix Rejected" : "Observation Update";

  const { error } = await supabase.from("notifications").insert({
    type: "status_changed",
    title,
    message,
    zone_name: params.zoneName,
    observation_id: params.observationId,
    created_by: params.actorId,
  });
  if (error) {
    console.error("Failed to send status-changed notification:", error.message);
    return;
  }

  const channel: PushChannel | undefined = isRejection
    ? "supervisor_rejected"
    : params.context === "claimed"
      ? "observation_in_progress"
      : STATUS_CHANNEL[params.newStatus];

  triggerPush(title, message, params.observationId, channel);
}

export async function sendAdminBroadcast(params: {
  title: string;
  message: string;
  createdBy: string;
  // Lets the composer flag a broadcast as a meeting or site-walk call so it
  // rings with its own sound instead of the generic broadcast/default one.
  category?: "meeting" | "site_walk" | "general";
}) {
  const { error } = await supabase.from("notifications").insert({
    type: "admin_broadcast",
    title: params.title,
    message: params.message,
    created_by: params.createdBy,
  });
  if (error) throw error;
  const channel: PushChannel | undefined =
    params.category === "meeting" ? "meeting" : params.category === "site_walk" ? "site_walk" : undefined;
  triggerPush(params.title, params.message, undefined, channel);
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
