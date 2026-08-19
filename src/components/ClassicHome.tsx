"use client";

import ObservationsList from "./ObservationsList";
import type { Observation } from "@/types";
import { useT } from "@/lib/i18n";

interface ClassicHomeProps {
  observations: Observation[];
  canCreate: boolean;
  locating: boolean;
  onQuickReport: () => void;
  onSelect: (observation: Observation) => void;
}

export default function ClassicHome({
  observations,
  canCreate,
  locating,
  onQuickReport,
  onSelect,
}: ClassicHomeProps) {
  const { t } = useT();

  return (
    <div className="h-full flex flex-col">
      {canCreate && (
        <div className="shrink-0 px-4 pt-4 pb-2">
          <button
            onClick={onQuickReport}
            disabled={locating}
            className="tap w-full relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-orange-600 text-white px-4 py-4 flex items-center gap-3.5 shadow-lg shadow-orange-600/20 disabled:opacity-90"
          >
            <span className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-2xl shrink-0">
              {locating ? (
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="white" strokeOpacity="0.35" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : (
                "⚡"
              )}
            </span>
            <span className="min-w-0 text-left flex-1">
              <span className="block text-[15px] font-bold leading-tight">
                {locating ? t("dashboard.quickReportLocating") : t("dashboard.quickReportTitle")}
              </span>
              {!locating && (
                <span className="block text-[11.5px] text-white/85 mt-0.5 leading-snug">
                  {t("dashboard.quickReportSubtitle")}
                </span>
              )}
            </span>
            {!locating && (
              <span className="shrink-0 text-xs font-semibold bg-white/20 px-3 py-1.5 rounded-full">
                {t("dashboard.quickReportCta")}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 px-4 pb-4">
        <div className="h-full rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-card">
          <ObservationsList observations={observations} onSelect={onSelect} />
        </div>
      </div>

      {/* Reachable while scrolled deep into a long list — the hero card
          above may have scrolled out of view, this never does. */}
      {canCreate && (
        <button
          onClick={onQuickReport}
          disabled={locating}
          aria-label={t("dashboard.quickReportCta")}
          className="tap absolute bottom-4 right-4 z-20 w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-xl shadow-orange-600/30 flex items-center justify-center text-2xl"
        >
          {locating ? (
            <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeOpacity="0.35" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            "＋"
          )}
        </button>
      )}
    </div>
  );
}
