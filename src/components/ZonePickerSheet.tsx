"use client";

import type { ZoneOption } from "@/lib/zoneDetect";
import { useT } from "@/lib/i18n";

interface ZonePickerSheetProps {
  zones: ZoneOption[];
  reason: "denied" | "unsupported" | "timeout";
  defaultCenter: { lng: number; lat: number };
  onPick: (pin: { lng: number; lat: number; zoneName: string | null }) => void;
  onRetryGps: () => void;
  onClose: () => void;
}

export default function ZonePickerSheet({
  zones,
  reason,
  defaultCenter,
  onPick,
  onRetryGps,
  onClose,
}: ZonePickerSheetProps) {
  const { t } = useT();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl overflow-hidden flex flex-col animate-sheet-up max-h-[80vh]">
        <div className="sheet-handle shrink-0" />
        <div className="px-5 pt-1 pb-3 shrink-0 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {t("dashboard.pickZoneTitle")}
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {t("dashboard.pickZoneSubtitle")}
          </p>
          {reason !== "unsupported" && (
            <button
              onClick={onRetryGps}
              className="tap mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400"
            >
              📍 {t("dashboard.pickZoneRetryGps")}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          <button
            onClick={() =>
              onPick({ lng: defaultCenter.lng, lat: defaultCenter.lat, zoneName: null })
            }
            className="tap w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 active:bg-slate-50 dark:active:bg-slate-800/70"
          >
            <span className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-base shrink-0">
              🧭
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                {t("dashboard.pickZoneGeneral")}
              </span>
              <span className="block text-xs text-slate-400 dark:text-slate-500">
                {t("dashboard.pickZoneGeneralDesc")}
              </span>
            </span>
          </button>

          {zones.map((zone) => (
            <button
              key={zone.name}
              onClick={() => onPick({ lng: zone.lng, lat: zone.lat, zoneName: zone.name })}
              className="tap w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 active:bg-slate-50 dark:active:bg-slate-800/70"
            >
              <span className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold shrink-0">
                📍
              </span>
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                {zone.name}
              </span>
            </button>
          ))}
        </div>

        <div className="shrink-0 px-5 pt-2 pb-safe mb-3">
          <button
            onClick={onClose}
            className="tap w-full text-sm font-medium py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
