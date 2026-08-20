"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { isLoginStale, hasLoginMark, markLoginNow, clearLoginMark } from "@/lib/sessionExpiry";

const CHECK_INTERVAL_MS = 60 * 1000; // re-check every minute while the app is open

/**
 * Mounted once at the app root. Forces a sign-out + redirect to /login once
 * 24h have passed since the person last logged in — entirely from the
 * local clock, so it also fires while offline (no request needed to know a
 * local timestamp is 24h old).
 *
 * signOut uses { scope: "local" } specifically so this works with no
 * connection: the default scope also tries to invalidate the session on
 * Supabase's server first, which would otherwise hang/fail offline instead
 * of just clearing the local session and moving on.
 */
export default function SessionGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") return;

    async function checkExpiry() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return; // nothing to expire

      // Sessions that predate this feature (or were restored without ever
      // recording a login time) get grandfathered with a fresh timestamp
      // instead of being force-logged-out the instant this code ships.
      if (!hasLoginMark()) {
        markLoginNow();
        return;
      }

      if (isLoginStale()) {
        clearLoginMark();
        await supabase.auth.signOut({ scope: "local" });
        router.push("/login");
      }
    }

    checkExpiry();
    const interval = setInterval(checkExpiry, CHECK_INTERVAL_MS);

    // A phone can sit locked/backgrounded for well over 24h — setInterval
    // pauses along with it, so also re-check the instant the app comes back
    // to the foreground, not just on the next scheduled tick.
    function onVisibilityChange() {
      if (document.visibilityState === "visible") checkExpiry();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [pathname, router]);

  return null;
}
