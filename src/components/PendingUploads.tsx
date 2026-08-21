"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  getPendingObservations,
  subscribeQueue,
  retryPendingObservation,
  retryAllPendingObservations,
  removePendingObservation,
  type PendingObservationRecord,
} from "@/lib/offlineQueue";
import { useT } from "@/lib/i18n";
import { useDateLocale } from "@/lib/dateLocale";

export default function PendingUploads() {
  const { t } = useT();
  const dateLocale = useDateLocale();
  const [items, setItems] = useState<PendingObservationRecord[]>([]);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getPendingObservations().then((records) => {
        if (!cancelled) setItems(records);
      });
    };
    load();
    const unsubscribe = subscribeQueue(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (items.length === 0) return null;

  async function handleRetryAll() {
    setRetryingAll(true);
    await retryAllPendingObservations();
    setRetryingAll(false);
  }

  async function handleRetryOne(id: string) {
    setRetryingId(id);
    await retryPendingObservation(id);
    setRetryingId(null);
  }

  async function handleDelete(id: string) {
    await removePendingObservation(id);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">
          {t("pending.title", { n: items.length })}
        </p>
        <button
          onClick={handleRetryAll}
          disabled={retryingAll}
          className="tap text-xs font-medium text-blue-600 dark:text-blue-400 disabled:opacity-50"
        >
          {retryingAll ? t("pending.retrying") : t("pending.retryAll")}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-card">
        {items.map((item) => (
          <div key={item.id} className="px-4 py-3.5 flex items-start gap-3">
            <div
              className={`mt-0.5 shrink-0 w-2.5 h-2.5 rounded-full ${
                item.status === "partial" ? "bg-blue-500" : "bg-amber-500"
              }`}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {item.title || t("pending.untitled")}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {item.status === "syncing" || retryingId === item.id
                  ? t("pending.sending")
                  : item.status === "partial"
                  ? t("pending.partial")
                  : t("pending.waitingToSend", {
                      time: formatDistanceToNow(new Date(item.createdAt), { locale: dateLocale }),
                    })}
              </p>
              {item.status === "failed" && item.lastError && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{item.lastError}</p>
              )}
              {item.status === "partial" && item.lastError && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{item.lastError}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <button
                onClick={() => handleRetryOne(item.id)}
                disabled={retryingId === item.id || item.status === "syncing"}
                className="tap text-xs font-medium text-blue-600 dark:text-blue-400 px-2 py-1 disabled:opacity-50"
              >
                {t("pending.retry")}
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="tap text-xs font-medium text-red-600 dark:text-red-400 px-2 py-1"
              >
                {item.status === "partial" ? t("pending.dismissPhoto") : t("pending.delete")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
