// Supabase Edge Function: admin-reset-password
//
// Lets an admin reset a forgotten password for someone else. Called from
// the admin/users page ("Reset password" button next to each user) — see
// src/app/admin/users/page.tsx.
//
// What it does:
//   1. Confirms the CALLER (via their own auth token) is signed in and has
//      role = 'admin' in profiles. Anyone else gets 403.
//   2. Generates a random temporary password.
//   3. Sets it on the target user's auth account using the Supabase Admin
//      API (service-role key — never exposed to the browser).
//   4. Flips profiles.force_password_change on for that user, so the app
//      sends them straight to /change-password the moment they sign in
//      with it, before they can do anything else.
//   5. Returns the temporary password so the admin can read it out to the
//      person (over a call, in person, etc. — there's no email/SMS step
//      here since this app authenticates by phone number only).
//
// Deploy with:
//   supabase functions deploy admin-reset-password
//
// No extra secrets to set — SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY are already provided automatically to every
// Edge Function by the platform (unlike send-push's ONESIGNAL_* secrets,
// which do need to be set by hand).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Avoids visually-ambiguous characters (0/O, 1/l/I) since this is meant to
// be read aloud over a phone call and typed back in by hand.
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length];
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identifies the CALLER using their own token — never trust a userId
    // claim from the request body for "who am I", only for "who's the
    // target".
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();

    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Not signed in" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile, error: callerProfileErr } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (callerProfileErr || callerProfile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admins only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tempPassword = generateTempPassword();

    // Service-role client — bypasses RLS, can call the Admin API. Only
    // ever runs here, server-side.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (updateAuthErr) {
      console.error("admin-reset-password: updateUserById failed:", updateAuthErr);
      return new Response(JSON.stringify({ error: updateAuthErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateProfileErr } = await adminClient
      .from("profiles")
      .update({ force_password_change: true })
      .eq("id", userId);

    if (updateProfileErr) {
      // The auth password is already reset at this point — this second
      // failure just means force_password_change didn't get set, so the
      // person can still sign in with the temp password, just without the
      // forced-change prompt. Log it and still return the password rather
      // than pretending the whole operation failed.
      console.error("admin-reset-password: profiles update failed:", updateProfileErr);
    }

    return new Response(JSON.stringify({ ok: true, tempPassword }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-reset-password failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
