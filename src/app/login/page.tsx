"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Normalizes a Saudi-style local number into E.164 format that Supabase
// requires, e.g. "0512345678" or "512345678" -> "+966512345678".
// If the user already typed a "+" international number, it's left as-is.
function toE164(raw: string): string {
  const trimmed = raw.trim().replace(/[\s-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  const digitsOnly = trimmed.replace(/^0+/, ""); // strip leading 0
  return `+966${digitsOnly}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const e164Phone = toE164(phone);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          phone: e164Phone,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          phone: e164Phone,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4 pt-safe pb-safe">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 p-7 rounded-3xl shadow-xl w-full max-w-sm space-y-5"
      >
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-blue-600 text-white flex items-center justify-center text-2xl font-bold">
            🦺
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold">HSE Observation System</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              {mode === "signin" ? "Sign in to continue" : "Create your account"}
            </p>
          </div>
        </div>

        {/* iOS-style segmented control instead of a plain text toggle */}
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`tap flex-1 text-sm font-medium py-2 rounded-lg ${
              mode === "signin"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`tap flex-1 text-sm font-medium py-2 rounded-lg ${
              mode === "signup"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            Sign Up
          </button>
        </div>

        <div className="space-y-3">
          {mode === "signup" && (
            <div>
              <label htmlFor="full-name" className="sr-only">Full name</label>
              <input
                id="full-name"
                name="full_name"
                required
                autoComplete="name"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 text-sm"
              />
            </div>
          )}

          <div>
            <label htmlFor="phone" className="sr-only">Phone number</label>
            <input
              id="phone"
              name="phone"
              required
              type="tel"
              autoComplete="tel"
              placeholder="Phone number (e.g. 05xxxxxxxx or +9665xxxxxxxx)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="sr-only">Password</label>
            <input
              id="password"
              name="password"
              required
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Sign Up"}
        </button>

        <p className="text-[11px] text-center text-gray-400 dark:text-slate-500">
          New accounts default to &quot;Safety Officer / Contractor&quot;. An admin can change your
          role from the &quot;Users&quot; tab after you sign up.
        </p>
      </form>
    </div>
  );
}
