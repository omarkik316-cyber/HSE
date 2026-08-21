"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { Profile, UserRole } from "@/types";
import type { Session } from "@supabase/supabase-js";
import BottomNav from "@/components/BottomNav";
import { useT, roleLabel } from "@/lib/i18n";

const ROLES: UserRole[] = ["safety_officer", "consultant", "contractor", "manager", "admin"];

interface Draft {
  role: UserRole;
  company: string;
}

export default function AdminUsersPage() {
  const { t } = useT();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  // false until the very first supabase.auth.getSession() resolves. session
  // itself starts out null, same as "signed out" — without this flag we'd
  // briefly treat "haven't checked yet" as "not signed in" and flash the
  // sign-in redirect for people who actually are signed in.
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  // Holds the just-generated temporary password so it can be shown once in
  // a modal — never persisted anywhere, never shown again after closing.
  const [resetResult, setResetResult] = useState<{ userId: string; name: string; tempPassword: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

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

  // No session once the check is done — go straight to the login page
  // instead of showing a "please sign in" screen the person has to tap
  // through.
  useEffect(() => {
    if (authChecked && !session) router.replace("/login");
  }, [authChecked, session, router]);

  useEffect(() => {
    if (!authChecked) return;
    if (!session?.user) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setProfile(data);
        setLoadingProfile(false);
      });
  }, [session, authChecked]);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(t("admin.loadFailed", { msg: error.message }));
      return;
    }

    setUsers(data ?? []);
    const nextDrafts: Record<string, Draft> = {};
    (data ?? []).forEach((u) => {
      nextDrafts[u.id] = { role: u.role, company: u.company ?? "" };
    });
    setDrafts(nextDrafts);
  }, [t]);

  useEffect(() => {
    if (profile?.role === "admin") fetchUsers();
  }, [profile, fetchUsers]);

  async function saveUser(userId: string) {
    const draft = drafts[userId];
    if (!draft) return;
    setSavingId(userId);
    setMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({ role: draft.role, company: draft.company || null })
      .eq("id", userId);

    setSavingId(null);

    if (error) {
      setMessage(t("admin.saveFailed", { msg: error.message }));
      return;
    }

    setMessage(t("admin.saved"));
    fetchUsers();
  }

  async function resetPassword(u: Profile) {
    if (!confirm(t("admin.resetPasswordConfirm", { name: u.full_name }))) return;
    setResettingId(u.id);
    setMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke<{ tempPassword?: string; error?: string }>(
        "admin-reset-password",
        { body: { userId: u.id } }
      );
      if (error) throw error;
      if (!data?.tempPassword) throw new Error(data?.error || "no password returned");

      setResetResult({ userId: u.id, name: u.full_name, tempPassword: data.tempPassword });
      setCopied(false);
    } catch (err) {
      setMessage(t("admin.resetPasswordFailed", { msg: err instanceof Error ? err.message : String(err) }));
    } finally {
      setResettingId(null);
    }
  }

  async function copyTempPassword() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.tempPassword);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable (older WebViews, no HTTPS, etc.) —
      // the password is still shown on screen and can be copied manually,
      // so this failure is silent rather than blocking anything.
    }
  }

  if (loadingProfile) {
    return <div className="h-dvh flex items-center justify-center text-slate-400">{t("common.loading")}</div>;
  }

  if (!session) {
    // authChecked is true and there's no session, so the redirect effect
    // above is already sending them to /login — this link is just a
    // fallback in case that navigation is ever slow to kick in.
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

  if (profile?.role !== "admin") {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center space-y-3 max-w-sm px-4">
          <p className="text-lg font-medium">{t("admin.adminsOnly")}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("admin.adminsOnlyDesc", { role: profile?.role ?? t("common.unknown") })}
          </p>
          <a href="/" className="text-blue-600 dark:text-blue-400 underline text-sm">{t("common.backToDashboard")}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 bg-slate-900 dark:bg-black text-white px-4 pt-safe pb-3 pt-3">
        <h1 className="font-semibold text-[15px]">{t("admin.header")}</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          {message && (
            <div className="text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-3 py-2 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300">
              {message}
            </div>
          )}

          <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin.intro")}</p>

          {/* Mobile: a stacked card per user (spreadsheet-style tables don't
              fit a phone screen without horizontal scrolling). */}
          <div className="space-y-3 sm:hidden">
            {users.map((u) => {
              const draft = drafts[u.id] ?? { role: u.role, company: u.company ?? "" };
              const dirty = draft.role !== u.role || (draft.company || "") !== (u.company ?? "");
              return (
                <div key={u.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-3 shadow-card">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {u.full_name}
                      {u.id === profile.id && (
                        <span className="ml-1.5 text-[10px] text-slate-400 font-normal">{t("common.you")}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500" dir="ltr">{u.phone ?? "—"}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`role-${u.id}`} className="block text-[11px] text-slate-400 mb-1">{t("admin.role")}</label>
                      <select
                        id={`role-${u.id}`}
                        name={`role-${u.id}`}
                        value={draft.role}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [u.id]: { ...draft, role: e.target.value as UserRole },
                          }))
                        }
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-2 text-sm"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{roleLabel(t, r)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`company-${u.id}`} className="block text-[11px] text-slate-400 mb-1">{t("admin.company")}</label>
                      <input
                        id={`company-${u.id}`}
                        name={`company-${u.id}`}
                        value={draft.company}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [u.id]: { ...draft, company: e.target.value } }))
                        }
                        placeholder={t("admin.companyPlaceholder")}
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={!dirty || savingId === u.id}
                      onClick={() => saveUser(u.id)}
                      className="tap flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-30"
                    >
                      {savingId === u.id ? t("common.saving") : t("common.save")}
                    </button>
                    <button
                      disabled={resettingId === u.id}
                      onClick={() => resetPassword(u)}
                      className="tap flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium disabled:opacity-30"
                    >
                      {resettingId === u.id ? t("admin.resetPasswordWorking") : t("admin.resetPassword")}
                    </button>
                  </div>
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="text-center text-slate-400 py-8">{t("admin.noUsers")}</p>
            )}
          </div>

          {/* Desktop / tablet: a compact table */}
          <div className="hidden sm:block bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">{t("admin.name")}</th>
                  <th className="text-left px-4 py-2">{t("admin.phone")}</th>
                  <th className="text-left px-4 py-2">{t("admin.role")}</th>
                  <th className="text-left px-4 py-2">{t("admin.company")}</th>
                  <th className="text-left px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const draft = drafts[u.id] ?? { role: u.role, company: u.company ?? "" };
                  const dirty = draft.role !== u.role || (draft.company || "") !== (u.company ?? "");
                  return (
                    <tr key={u.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2">
                        {u.full_name}
                        {u.id === profile.id && (
                          <span className="ml-1.5 text-[10px] text-slate-400">{t("common.you")}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400" dir="ltr">{u.phone ?? "—"}</td>
                      <td className="px-4 py-2">
                        <select
                          id={`role-desktop-${u.id}`}
                          name={`role-desktop-${u.id}`}
                          aria-label={t("admin.role")}
                          value={draft.role}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [u.id]: { ...draft, role: e.target.value as UserRole },
                            }))
                          }
                          className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1 text-sm"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{roleLabel(t, r)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          id={`company-desktop-${u.id}`}
                          name={`company-desktop-${u.id}`}
                          aria-label={t("admin.company")}
                          value={draft.company}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [u.id]: { ...draft, company: e.target.value } }))
                          }
                          placeholder={t("admin.companyPlaceholderDesktop")}
                          className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1 text-sm w-40"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1.5">
                          <button
                            disabled={!dirty || savingId === u.id}
                            onClick={() => saveUser(u.id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-30"
                          >
                            {savingId === u.id ? t("common.saving") : t("common.save")}
                          </button>
                          <button
                            disabled={resettingId === u.id}
                            onClick={() => resetPassword(u)}
                            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium disabled:opacity-30 whitespace-nowrap"
                          >
                            {resettingId === u.id ? t("admin.resetPasswordWorking") : t("admin.resetPassword")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      {t("admin.noUsers")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                {t("admin.resetPasswordSuccessTitle", { name: resetResult.name })}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {t("admin.resetPasswordSuccessDesc")}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3">
              <span className="text-lg font-mono font-semibold tracking-wide text-slate-900 dark:text-slate-50" dir="ltr">
                {resetResult.tempPassword}
              </span>
              <button
                onClick={copyTempPassword}
                className="tap shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 px-2 py-1"
              >
                {copied ? t("admin.resetPasswordCopied") : t("admin.resetPasswordCopy")}
              </button>
            </div>

            <button
              onClick={() => setResetResult(null)}
              className="tap w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold"
            >
              {t("admin.resetPasswordDone")}
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
