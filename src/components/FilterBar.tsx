"use client";

import { useMemo, useRef, useState } from "react";
import type { Observation, ObservationStatus, ObservationPriority } from "@/types";
import { CATEGORIES } from "@/types";
import { useT, statusLabel, priorityLabel, categoryLabel } from "@/lib/i18n";

export interface Filters {
  statuses: Set<ObservationStatus>;
  priorities: Set<ObservationPriority>;
  // Empty set = no restriction ("All"), same convention as an Excel column
  // filter with every box checked.
  categories: Set<string>;
  zones: Set<string>;
}

export const ALL_STATUSES: ObservationStatus[] = ["open", "in_progress", "pending_review", "closed"];
export const ALL_PRIORITIES: ObservationPriority[] = ["low", "medium", "high", "critical"];

export function defaultFilters(): Filters {
  return {
    // Closed observations are done — nobody needs to act on them, so they
    // stay out of view until someone deliberately turns "Closed" back on.
    statuses: new Set(ALL_STATUSES.filter((s) => s !== "closed")),
    priorities: new Set(ALL_PRIORITIES),
    categories: new Set(),
    zones: new Set(),
  };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function isDefaultFilters(filters: Filters): boolean {
  const d = defaultFilters();
  return (
    setsEqual(filters.statuses, d.statuses) &&
    setsEqual(filters.priorities, d.priorities) &&
    filters.categories.size === 0 &&
    filters.zones.size === 0
  );
}

export function applyFilters(observations: Observation[], filters: Filters): Observation[] {
  return observations.filter((o) => {
    if (filters.statuses.size > 0 && !filters.statuses.has(o.status)) return false;
    if (filters.priorities.size > 0 && !filters.priorities.has(o.priority)) return false;
    if (filters.categories.size > 0 && !filters.categories.has(o.category)) return false;
    if (filters.zones.size > 0 && (!o.zone_name || !filters.zones.has(o.zone_name))) return false;
    return true;
  });
}

interface Option {
  value: string;
  label: string;
}

// A single Excel-style column filter: tap to expand, search box, a
// "Select All" master checkbox, and one checkbox per value. An empty
// `selected` set means "All" (nothing excluded) — exactly like a fresh
// Excel filter with every box ticked.
function ExcelFilterField({
  title,
  options,
  selected,
  onChange,
  expanded,
  onToggleExpanded,
}: {
  title: string;
  options: Option[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { t } = useT();
  const [search, setSearch] = useState("");
  const checkAllRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // "All" is represented as an empty set, so everything reads as checked.
  const isChecked = (value: string) => selected.size === 0 || selected.has(value);
  const checkedCount = options.filter((o) => isChecked(o.value)).length;
  const allChecked = checkedCount === options.length;
  const noneChecked = checkedCount === 0;

  if (checkAllRef.current) {
    checkAllRef.current.indeterminate = !allChecked && !noneChecked;
  }

  function toggleValue(value: string) {
    // Materialize the implicit "all selected" set the first time someone
    // unchecks a single box, same as Excel does under the hood.
    const base = selected.size === 0 ? new Set(options.map((o) => o.value)) : new Set(selected);
    if (base.has(value)) base.delete(value);
    else base.add(value);
    // If everything ends up checked again, collapse back to "All" (empty
    // set) so summaries read cleanly.
    onChange(base.size === options.length ? new Set() : base);
  }

  function setAll(checked: boolean) {
    if (checked) {
      onChange(new Set());
    } else {
      onChange(new Set(["__none_selected__"]));
    }
  }

  const summary = allChecked
    ? t("filters.all")
    : noneChecked
      ? t("filters.none")
      : t("filters.ofCount", { checked: checkedCount, total: options.length });

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="tap w-full flex items-center justify-between px-3.5 py-3 bg-slate-50 dark:bg-slate-800/70"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-slate-400">
            <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          {title}
        </span>
        <span className="flex items-center gap-2">
          <span className={`text-xs ${allChecked ? "text-slate-400 dark:text-slate-500" : "text-blue-600 dark:text-blue-400 font-semibold"}`}>
            {summary}
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {options.length > 6 && (
            <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("filters.searchPlaceholder", { field: title.toLowerCase() })}
                className="w-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5 text-xs"
              />
            </div>
          )}

          <label className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 cursor-pointer">
            <input
              ref={checkAllRef}
              type="checkbox"
              checked={allChecked}
              onChange={(e) => setAll(e.target.checked)}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {t("filters.selectAll")}
            </span>
          </label>

          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isChecked(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
              </label>
            ))}
            {filteredOptions.length === 0 && (
              <p className="px-3.5 py-3 text-xs text-slate-400">{t("common.noMatches")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface FilterBarProps {
  observations: Observation[]; // full unfiltered list, used to build the zone list
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export default function FilterBar({ observations, filters, onChange }: FilterBarProps) {
  const { t } = useT();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Draft state so the sheet can be dismissed without applying half-made
  // changes, mirroring the "Cancel / Apply" pattern of a native filter sheet.
  const [draft, setDraft] = useState<Filters>(filters);
  const [expandedField, setExpandedField] = useState<string | null>("status");

  const zoneOptions = useMemo(() => {
    const zones = new Set<string>();
    observations.forEach((o) => {
      if (o.zone_name) zones.add(o.zone_name);
    });
    return Array.from(zones).sort();
  }, [observations]);

  const statusOptions: Option[] = ALL_STATUSES.map((s) => ({ value: s, label: statusLabel(t, s) }));
  const priorityOptions: Option[] = ALL_PRIORITIES.map((p) => ({
    value: p,
    label: priorityLabel(t, p),
  }));
  const categoryOptions: Option[] = CATEGORIES.map((c) => ({ value: c, label: categoryLabel(t, c) }));
  const zoneOptionList: Option[] = zoneOptions.map((z) => ({ value: z, label: z }));

  const isDefault = isDefaultFilters(filters);
  const resultCount = useMemo(() => applyFilters(observations, filters).length, [observations, filters]);

  function openSheet() {
    setDraft(filters);
    setSheetOpen(true);
  }

  function applySheet() {
    onChange(draft);
    setSheetOpen(false);
  }

  function resetAll() {
    const d = defaultFilters();
    onChange(d);
    setDraft(d);
  }

  function toggle(field: string) {
    setExpandedField((cur) => (cur === field ? null : field));
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
        <button
          onClick={openSheet}
          className="tap flex-1 flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300"
        >
          <span className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
            {t("filters.filters")}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {resultCount === 1 ? t("filters.result", { n: resultCount }) : t("filters.results", { n: resultCount })}
          </span>
        </button>

        {!isDefault && (
          <button
            onClick={resetAll}
            className="tap shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500 px-1"
          >
            {t("filters.reset")}
          </button>
        )}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setSheetOpen(false)}
          />
          <div className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl shadow-sheet max-h-[88vh] flex flex-col animate-sheet-up">
            <div className="sheet-handle" />
            <div className="px-5 pb-1 flex items-center justify-between">
              <h3 className="text-base font-semibold">{t("filters.filters")}</h3>
              <button onClick={() => setSheetOpen(false)} className="tap text-slate-400 text-lg px-2">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
              <ExcelFilterField
                title={t("filters.status")}
                options={statusOptions}
                selected={draft.statuses as unknown as Set<string>}
                onChange={(next) =>
                  setDraft((d) => ({ ...d, statuses: next as unknown as Set<ObservationStatus> }))
                }
                expanded={expandedField === "status"}
                onToggleExpanded={() => toggle("status")}
              />
              <ExcelFilterField
                title={t("filters.priority")}
                options={priorityOptions}
                selected={draft.priorities as unknown as Set<string>}
                onChange={(next) =>
                  setDraft((d) => ({ ...d, priorities: next as unknown as Set<ObservationPriority> }))
                }
                expanded={expandedField === "priority"}
                onToggleExpanded={() => toggle("priority")}
              />
              <ExcelFilterField
                title={t("filters.category")}
                options={categoryOptions}
                selected={draft.categories}
                onChange={(next) => setDraft((d) => ({ ...d, categories: next }))}
                expanded={expandedField === "category"}
                onToggleExpanded={() => toggle("category")}
              />
              <ExcelFilterField
                title={t("filters.zone")}
                options={zoneOptionList}
                selected={draft.zones}
                onChange={(next) => setDraft((d) => ({ ...d, zones: next }))}
                expanded={expandedField === "zone"}
                onToggleExpanded={() => toggle("zone")}
              />
            </div>

            <div className="px-5 pt-3 pb-safe border-t border-slate-100 dark:border-slate-800 flex gap-2 mb-4">
              <button
                onClick={() => {
                  const d = defaultFilters();
                  setDraft(d);
                }}
                className="tap px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300"
              >
                {t("filters.reset")}
              </button>
              <button
                onClick={applySheet}
                className="tap flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold"
              >
                {t("filters.apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
