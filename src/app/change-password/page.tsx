"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useT } from "@/lib/i18n";
import type { Session } from "@supabase/supabase-js";

const MIN_PASSWORD_LENGTH = 6;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { t } = useT();
  const [session, setSession] = useState<Session | null>(null);
  // false until the very first supabase.auth.getSession() resolves — avoids
  // briefly treating "haven't checked yet" as "signed out" and bouncing a
  // signed-in person straight back to /login.
  const [authChecked, setAuthChecked] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // This page only makes sense for someone already signed in (with a
  // temporary password) — no session means straight to /login, same as
  // every other protected page.
  useEffect(() => {
    if (authChecked && !session) router.replace("/login");
  }, [authChecked, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("changePassword.tooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("changePassword.mismatch"));
      return;
    }

    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) throw updateErr;

      // Clears the flag on their own profile row — profiles_update_own
      // already lets a signed-in user update their own row.
      if (session?.user) {
        await supabase.from("profiles").update({ force_password_change: false }).eq("id", session.user.id);
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("changePassword.updateFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (!session) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <a
          href="/login"
          className="tap bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-6 py-3 rounded-xl shadow-sm"
        >
          {t("login.signIn")}
        </a>
      </div>
    );
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4 pt-safe pb-safe">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 p-7 rounded-3xl shadow-xl w-full max-w-sm space-y-5"
      >
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
            🔒
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">{t("changePassword.title")}</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{t("changePassword.subtitle")}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="new-password" className="sr-only">{t("changePassword.newPassword")}</label>
            <input
              id="new-password"
              name="new_password"
              required
              type="password"
              autoComplete="new-password"
              placeholder={t("changePassword.newPassword")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="sr-only">{t("changePassword.confirmPassword")}</label>
            <input
              id="confirm-password"
              name="confirm_password"
              required
              type="password"
              autoComplete="new-password"
              placeholder={t("changePassword.confirmPassword")}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
            {error}
          </div>
        )}

        <button
          disabled={loading}
          className="tap w-full bg-blue-600 text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? t("common.pleaseWait") : t("changePassword.submit")}
        </button>
      </form>
    </div>
  );
}
