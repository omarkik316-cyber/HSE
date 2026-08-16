"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Profile, UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";
import type { Session } from "@supabase/supabase-js";
import BottomNav from "@/components/BottomNav";

const ROLES: UserRole[] = ["safety_officer", "consultant", "contractor", "manager", "admin"];

interface Draft {
  role: UserRole;
  company: string;
}

export default function AdminUsersPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
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
  }, [session]);

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Failed to load users: ${error.message}`);
      return;
    }

    setUsers(data ?? []);
    const nextDrafts: Record<string, Draft> = {};
    (data ?? []).forEach((u) => {
      nextDrafts[u.id] = { role: u.role, company: u.company ?? "" };
    });
    setDrafts(nextDrafts);
  }, []);

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
      setMessage(`Failed to save: ${error.message}`);
      return;
    }

    setMessage("Saved.");
    fetchUsers();
  }

  if (loadingProfile) {
    return <div className="h-dvh flex items-center justify-center text-slate-400">Loading...</div>;
  }

  if (!session) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">Please sign in</p>
          <a href="/login" className="text-blue-600 dark:text-blue-400 underline">Go to login page</a>
        </div>
      </div>
    );
  }

  if (profile?.role !== "admin") {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center space-y-3 max-w-sm px-4">
          <p className="text-lg font-medium">Admins only</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your account role is &quot;{profile?.role ?? "unknown"}&quot;. Ask an existing admin to
            upgrade your role from this same page once you have access.
          </p>
          <a href="/" className="text-blue-600 dark:text-blue-400 underline text-sm">Back to dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-slate-50 dark:bg-slate-950">
      <header className="shrink-0 bg-slate-900 dark:bg-black text-white px-4 pt-safe pb-3 pt-3">
        <h1 className="font-semibold text-[15px]">Manage Users &amp; Roles</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-4 space-y-4">
          {message && (
            <div className="text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-3 py-2 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300">
              {message}
            </div>
          )}

          <p className="text-sm text-slate-500 dark:text-slate-400">
            Every new sign-up defaults to <strong>Safety Officer / Contractor</strong>. Assign the
            correct role here so people can create or close the right observations. Everyone can see
            every observation regardless of company.
          </p>

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
                        <span className="ml-1.5 text-[10px] text-slate-400 font-normal">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500" dir="ltr">{u.phone ?? "—"}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`role-${u.id}`} className="block text-[11px] text-slate-400 mb-1">Role</label>
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
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`company-${u.id}`} className="block text-[11px] text-slate-400 mb-1">Company</label>
                      <input
                        id={`company-${u.id}`}
                        name={`company-${u.id}`}
                        value={draft.company}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [u.id]: { ...draft, company: e.target.value } }))
                        }
                        placeholder="Company"
                        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    disabled={!dirty || savingId === u.id}
                    onClick={() => saveUser(u.id)}
                    className="tap w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-30"
                  >
                    {savingId === u.id ? "Saving..." : "Save"}
                  </button>
                </div>
              );
            })}
            {users.length === 0 && (
              <p className="text-center text-slate-400 py-8">No users yet.</p>
            )}
          </div>

          {/* Desktop / tablet: a compact table */}
          <div className="hidden sm:block bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Phone</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-left px-4 py-2">Company</th>
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
                          <span className="ml-1.5 text-[10px] text-slate-400">(you)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500 dark:text-slate-400" dir="ltr">{u.phone ?? "—"}</td>
                      <td className="px-4 py-2">
                        <select
                          id={`role-desktop-${u.id}`}
                          name={`role-desktop-${u.id}`}
                          aria-label="Role"
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
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          id={`company-desktop-${u.id}`}
                          name={`company-desktop-${u.id}`}
                          aria-label="Company"
                          value={draft.company}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [u.id]: { ...draft, company: e.target.value } }))
                          }
                          placeholder="Company name"
                          className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1 text-sm w-40"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <button
                          disabled={!dirty || savingId === u.id}
                          onClick={() => saveUser(u.id)}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-30"
                        >
                          {savingId === u.id ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No users yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
