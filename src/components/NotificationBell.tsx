"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { NotificationRecord, NotificationTemplate, Profile } from "@/types";
import {
  fetchNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  sendAdminBroadcast,
  fetchTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/notifications";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/dateLocale";
import { requestPushPermissionOnUserGesture } from "@/lib/push/onesignal";

interface NotificationBellProps {
  profile: Profile;
  onOpenObservation?: (observationId: string) => void;
}

const TYPE_ICON: Record<NotificationRecord["type"], string> = {
  observation_created: "🆕",
  status_changed: "🔄",
  admin_broadcast: "📢",
};

type View = "list" | "compose" | "templates";

export default function NotificationBell({ profile, onOpenObservation }: NotificationBellProps) {
  const { t } = useT();
  const dateLocale = useDateLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  // Ids currently mid fade-out after a tap. Kept separate from the real
  // `notifications` state so we can show a brief "acknowledged" animation
  // instead of the item just vanishing instantly — broadcast notifications
  // (meeting/site_walk/general) have no observation to navigate to, so
  // without this the only visible effect of tapping them was the row
  // disappearing, which read as an accidental delete.
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  // Compose state
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [composeCategory, setComposeCategory] = useState<"general" | "meeting" | "site_walk">("general");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  // Template editor state
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [templateDraftTitle, setTemplateDraftTitle] = useState("");
  const [templateDraftMessage, setTemplateDraftMessage] = useState("");
  const [addingTemplate, setAddingTemplate] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function reload() {
    setLoading(true);
    const data = await fetchNotificationsForUser(profile.id);
    setNotifications(data);
    setLoading(false);
  }

  // Poll every 30s so the badge stays roughly current without needing
  // realtime infrastructure.
  useEffect(() => {
    reload();
    const interval = setInterval(reload, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  useEffect(() => {
    if (open && profile.role === "admin") {
      fetchTemplates().then(setTemplates);
    }
  }, [open, profile.role]);

  function openPanel() {
    // Must be the first thing in this handler — iOS only shows its native
    // permission dialog when the request happens synchronously inside a
    // real tap. No-ops instantly if permission was already granted.
    requestPushPermissionOnUserGesture();
    setView("list");
    setOpen(true);
    reload();
  }

  async function handleTapNotification(n: NotificationRecord) {
    if (removingIds.has(n.id)) return; // already mid-dismiss, ignore double-tap

    markNotificationRead(n.id, profile.id);

    if (n.observation_id && onOpenObservation) {
      // There's somewhere to navigate to, so that navigation itself is the
      // feedback — remove immediately and close the sheet like before.
      setNotifications((cur) => cur.filter((x) => x.id !== n.id));
      onOpenObservation(n.observation_id);
      setOpen(false);
      return;
    }

    // No observation to open (meeting / site walk / general broadcasts).
    // Play a short "acknowledged" fade instead of yanking the row out
    // instantly, so tapping clearly reads as "marked read", not "deleted".
    setRemovingIds((cur) => new Set(cur).add(n.id));
    setTimeout(() => {
      setNotifications((cur) => cur.filter((x) => x.id !== n.id));
      setRemovingIds((cur) => {
        const next = new Set(cur);
        next.delete(n.id);
        return next;
      });
    }, 320);
  }

  async function handleMarkAllRead() {
    const unreadIds = notifications.map((n) => n.id);
    setNotifications([]);
    await markAllNotificationsRead(unreadIds, profile.id);
  }

  function startCompose(fromTemplate?: NotificationTemplate) {
    setComposeError(null);
    setComposeTitle(fromTemplate?.title ?? "");
    setComposeMessage(fromTemplate?.message ?? "");
    setComposeCategory("general");
    setSaveAsTemplate(false);
    setView("compose");
  }

  async function handleSend() {
    if (!composeTitle.trim() || !composeMessage.trim()) {
      setComposeError(t("notif.validationError"));
      return;
    }
    setSending(true);
    setComposeError(null);
    try {
      await sendAdminBroadcast({
        title: composeTitle.trim(),
        message: composeMessage.trim(),
        createdBy: profile.id,
        category: composeCategory,
      });
      if (saveAsTemplate) {
        await createTemplate(composeTitle.trim(), composeMessage.trim(), profile.id);
        setTemplates(await fetchTemplates());
      }
      setComposeTitle("");
      setComposeMessage("");
      setComposeCategory("general");
      setView("list");
      reload();
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : t("notif.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  function startEditTemplate(tpl: NotificationTemplate | null) {
    setEditingTemplate(tpl);
    setTemplateDraftTitle(tpl?.title ?? "");
    setTemplateDraftMessage(tpl?.message ?? "");
    setAddingTemplate(!tpl);
  }

  async function saveTemplateDraft() {
    if (!templateDraftTitle.trim() || !templateDraftMessage.trim()) return;
    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, templateDraftTitle.trim(), templateDraftMessage.trim());
    } else {
      await createTemplate(templateDraftTitle.trim(), templateDraftMessage.trim(), profile.id);
    }
    setTemplates(await fetchTemplates());
    setEditingTemplate(null);
    setAddingTemplate(false);
  }

  async function removeTemplate(id: string) {
    await deleteTemplate(id);
    setTemplates(await fetchTemplates());
  }

  return (
    <>
      <button
        onClick={openPanel}
        className="tap relative w-8 h-8 rounded-full bg-slate-700/70 flex items-center justify-center shrink-0"
        aria-label={t("notif.aria")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 13.5 6 9Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            className="text-white"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-white" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl shadow-sheet max-h-[85vh] flex flex-col animate-sheet-up">
            <div className="sheet-handle" />

            {view === "list" && (
              <>
                <div className="px-5 pb-1 flex items-center justify-between">
                  <h3 className="text-base font-semibold">{t("notif.title")}</h3>
                  <div className="flex items-center gap-3">
                    {profile.role === "admin" && (
                      <button
                        onClick={() => startCompose()}
                        className="tap text-xs font-semibold text-blue-600 dark:text-blue-400"
                      >
                        {t("notif.new")}
                      </button>
                    )}
                    <button onClick={() => setOpen(false)} className="tap text-slate-400 text-lg px-1">
                      ✕
                    </button>
                  </div>
                </div>

                {unreadCount > 0 && (
                  <div className="px-5 py-1.5">
                    <button onClick={handleMarkAllRead} className="tap text-xs text-slate-500 dark:text-slate-400 underline">
                      {t("notif.clearAll")}
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {loading && notifications.length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-8">{t("notif.loading")}</p>
                  )}
                  {!loading && notifications.length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-8">{t("notif.none")}</p>
                  )}
                  {notifications.map((n) => {
                    const isRemoving = removingIds.has(n.id);
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleTapNotification(n)}
                        disabled={isRemoving}
                        className={`tap w-full text-left flex items-start gap-2.5 px-3.5 py-3 rounded-xl mb-1 transition-all duration-300 ease-out ${
                          isRemoving
                            ? "opacity-0 scale-[0.98] bg-emerald-50 dark:bg-emerald-900/20"
                            : n.read
                            ? "bg-transparent"
                            : "bg-blue-50 dark:bg-blue-900/20"
                        }`}
                      >
                        <span className="text-lg shrink-0 leading-none mt-0.5">
                          {isRemoving ? "✅" : TYPE_ICON[n.type]}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                              {n.title}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                              {formatDistanceToNow(new Date(n.created_at), { locale: dateLocale, addSuffix: true })}
                            </span>
                          </span>
                          <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                            {n.message}
                          </span>
                          {n.profiles?.full_name && n.type === "admin_broadcast" && (
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                              — {n.profiles.full_name}
                            </span>
                          )}
                        </span>
                        {!n.read && !isRemoving && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="pb-safe" />
              </>
            )}

            {view === "compose" && (
              <div className="flex flex-col max-h-[80vh]">
                <div className="px-5 pb-1 flex items-center justify-between">
                  <button onClick={() => setView("list")} className="tap text-sm text-blue-600 dark:text-blue-400">
                    {t("common.back")}
                  </button>
                  <h3 className="text-base font-semibold">{t("notif.newNotification")}</h3>
                  <button
                    onClick={() => setView("templates")}
                    className="tap text-xs font-medium text-slate-500 dark:text-slate-400"
                  >
                    {t("notif.templates")}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
                  {templates.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase mb-2">{t("notif.quickTemplates")}</p>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {templates.map((tpl) => (
                          <button
                            key={tpl.id}
                            onClick={() => startCompose(tpl)}
                            className="tap shrink-0 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300"
                          >
                            {tpl.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="broadcast-title" className="block text-sm font-medium mb-1">{t("notif.broadcastTitle")}</label>
                    <input
                      id="broadcast-title"
                      name="broadcast_title"
                      value={composeTitle}
                      onChange={(e) => setComposeTitle(e.target.value)}
                      placeholder={t("notif.broadcastTitlePlaceholder")}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="broadcast-category" className="block text-sm font-medium mb-1">
                      {t("notif.category")}
                    </label>
                    <select
                      id="broadcast-category"
                      name="broadcast_category"
                      value={composeCategory}
                      onChange={(e) => setComposeCategory(e.target.value as "general" | "meeting" | "site_walk")}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
                    >
                      <option value="general">{t("notif.categoryGeneral")}</option>
                      <option value="meeting">{t("notif.categoryMeeting")}</option>
                      <option value="site_walk">{t("notif.categorySiteWalk")}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="broadcast-message" className="block text-sm font-medium mb-1">{t("notif.message")}</label>
                    <textarea
                      id="broadcast-message"
                      name="broadcast_message"
                      value={composeMessage}
                      onChange={(e) => setComposeMessage(e.target.value)}
                      rows={4}
                      placeholder={t("notif.messagePlaceholder")}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={saveAsTemplate}
                      onChange={(e) => setSaveAsTemplate(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    {t("notif.saveAsTemplate")}
                  </label>

                  {composeError && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                      {composeError}
                    </div>
                  )}
                </div>

                <div className="px-5 pt-3 pb-safe border-t border-slate-100 dark:border-slate-800 mb-4">
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="tap w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
                  >
                    {sending ? t("notif.sending") : t("notif.sendToEveryone")}
                  </button>
                </div>
              </div>
            )}

            {view === "templates" && (
              <div className="flex flex-col max-h-[80vh]">
                <div className="px-5 pb-1 flex items-center justify-between">
                  <button onClick={() => setView("compose")} className="tap text-sm text-blue-600 dark:text-blue-400">
                    {t("common.back")}
                  </button>
                  <h3 className="text-base font-semibold">{t("notif.manageTemplates")}</h3>
                  <button
                    onClick={() => startEditTemplate(null)}
                    className="tap text-xs font-semibold text-blue-600 dark:text-blue-400"
                  >
                    {t("notif.add")}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
                  {(addingTemplate || editingTemplate) && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2 bg-slate-50 dark:bg-slate-800/60">
                      <label htmlFor="template-title" className="sr-only">{t("notif.templateTitlePlaceholder")}</label>
                      <input
                        id="template-title"
                        name="template_title"
                        value={templateDraftTitle}
                        onChange={(e) => setTemplateDraftTitle(e.target.value)}
                        placeholder={t("notif.templateTitlePlaceholder")}
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-2 text-sm"
                      />
                      <label htmlFor="template-message" className="sr-only">{t("notif.templateMessagePlaceholder")}</label>
                      <textarea
                        id="template-message"
                        name="template_message"
                        value={templateDraftMessage}
                        onChange={(e) => setTemplateDraftMessage(e.target.value)}
                        rows={3}
                        placeholder={t("notif.templateMessagePlaceholder")}
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveTemplateDraft}
                          className="tap flex-1 bg-blue-600 text-white rounded-lg py-2 text-xs font-semibold"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          onClick={() => {
                            setEditingTemplate(null);
                            setAddingTemplate(false);
                          }}
                          className="tap px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  )}

                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="border border-slate-100 dark:border-slate-800 rounded-xl p-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{tpl.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{tpl.message}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => startEditTemplate(tpl)}
                          className="tap text-xs px-2 py-1 text-slate-500 dark:text-slate-400"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          onClick={() => removeTemplate(tpl.id)}
                          className="tap text-xs px-2 py-1 text-red-600 dark:text-red-400"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  ))}
                  {templates.length === 0 && !addingTemplate && (
                    <p className="text-center text-sm text-slate-400 py-8">{t("notif.noTemplates")}</p>
                  )}
                </div>
                <div className="pb-safe" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
