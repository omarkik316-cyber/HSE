"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Profile, UserRole } from "@/types";
import { ROLE_LABELS } from "@/types";
import type { Session } from "@supabase/supabase-js";

const ROLES: UserRole[] = ["safety_officer", "consultant", "contractor", "admin"];

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
      <div className="h-dvh flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-3">
          <p className="text-lg font-medium">Please sign in</p>
          <a href="/login" className="text-blue-600 underline">Go to login page</a>
        </div>
      </div>
    );
  }

  if (profile?.role !== "admin") {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-3 max-w-sm px-4">
          <p className="text-lg font-medium">Admins only</p>
          <p className="text-sm text-slate-500">
            Your account role is &quot;{profile?.role ?? "unknown"}&quot;. Ask an existing admin to
            upgrade your role from this same page once you have access.
          </p>
          <a href="/" className="text-blue-600 underline text-sm">Back to dashboard</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="font-semibold">Manage Users &amp; Roles</h1>
        <a href="/" className="text-sm text-slate-300 hover:text-white underline">
          ← Back to dashboard
        </a>
      </header>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {message && (
          <div className="text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2">
            {message}
          </div>
        )}

        <p className="text-sm text-slate-500">
          Every new sign-up defaults to <strong>Safety Officer / Contractor</strong>. Assign the
          correct role here so people can create or close the right observations. Everyone can see
          every observation regardless of company.
        </p>

        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
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
                  <tr key={u.id} className="border-t">
                    <td className="px-4 py-2">
                      {u.full_name}
                      {u.id === profile.id && (
                        <span className="ml-1.5 text-[10px] text-slate-400">(you)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500" dir="ltr">{u.phone ?? "—"}</td>
                    <td className="px-4 py-2">
                      <select
                        id={`role-${u.id}`}
                        name={`role-${u.id}`}
                        aria-label="Role"
                        value={draft.role}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [u.id]: { ...draft, role: e.target.value as UserRole },
                          }))
                        }
                        className="border rounded-lg px-2 py-1 text-sm"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        id={`company-${u.id}`}
                        name={`company-${u.id}`}
                        aria-label="Company"
                        value={draft.company}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [u.id]: { ...draft, company: e.target.value } }))
                        }
                        placeholder="Company name"
                        className="border rounded-lg px-2 py-1 text-sm w-40"
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
  );
}
