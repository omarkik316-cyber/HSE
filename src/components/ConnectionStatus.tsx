"use client";

import { useEffect, useState } from "react";

type Quality = "checking" | "offline" | "weak" | "strong";

// Round-trip time thresholds for classifying an online connection as
// "strong" vs "weak" — a small same-origin fetch under ~1.2s reads as a
// normal connection; slower (but still succeeding) reads as weak.
const WEAK_THRESHOLD_MS = 1200;
const CHECK_INTERVAL_MS = 15000;
const FETCH_TIMEOUT_MS = 6000;

function useConnectionQuality(): Quality {
  const [quality, setQuality] = useState<Quality>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) setQuality("offline");
        return;
      }

      const start = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        // A tiny same-origin file, fetched fresh every time (no-store) so
        // the timing reflects an actual round trip, not a cached hit.
        await fetch(`/manifest.json?_=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const elapsed = performance.now() - start;
        if (!cancelled) setQuality(elapsed > WEAK_THRESHOLD_MS ? "weak" : "strong");
      } catch {
        if (!cancelled) setQuality("offline");
      } finally {
        clearTimeout(timeout);
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);

  return quality;
}

const CONFIG: Record<Exclude<Quality, "checking">, { label: string; dot: string; bg: string }> = {
  strong: { label: "Online", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" },
  weak: { label: "Weak connection", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" },
  offline: { label: "No connection", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300" },
};

export default function ConnectionStatus() {
  const quality = useConnectionQuality();

  // Nothing to show yet on the very first render (still running the first
  // check).
  if (quality === "checking") return null;

  const { label, dot, bg } = CONFIG[quality];

  return (
    <div
      className={`fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-1.5 py-1 text-[11px] font-medium pt-safe ${bg}`}
      role="status"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </div>
  );
}
