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
    <div className="h-dvh flex items-center justify-center bg-slate-100 px-4">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold text-center">HSE Observation System</h1>
        <p className="text-sm text-gray-500 text-center">
          {mode === "signin" ? "Sign in to continue" : "Create your account"}
        </p>

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
              className="w-full border rounded-lg px-3 py-2 text-sm"
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
            className="w-full border rounded-lg px-3 py-2 text-sm"
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
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Sign Up"}
        </button>

        <p className="text-xs text-center text-gray-500">
          {mode === "signin" ? (
            <>
              No account?{" "}
              <button type="button" className="text-blue-600 underline" onClick={() => setMode("signup")}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button type="button" className="text-blue-600 underline" onClick={() => setMode("signin")}>
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="text-[11px] text-center text-gray-400 pt-2">
          New accounts default to &quot;Safety Officer / Contractor&quot;. An admin can change your
          role from the &quot;Manage Users&quot; page after you sign up.
        </p>
      </form>
    </div>
  );
}
