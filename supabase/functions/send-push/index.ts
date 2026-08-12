// Supabase Edge Function: send-push
//
// Sends a real push notification (shows up in the phone's notification
// tray even if the app is closed) via OneSignal's REST API. Called by the
// web app right after a row is inserted into the `notifications` table —
// see src/lib/notifications.ts.
//
// Deploy with:
//   supabase functions deploy send-push
//
// Then set the two secrets (from OneSignal Dashboard -> Settings -> Keys & IDs):
//   supabase secrets set ONESIGNAL_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
//   supabase secrets set ONESIGNAL_REST_API_KEY=os_v2_app_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//
// The REST API key is a secret — it must only ever live here (server side),
// never in the Android app or the website's client-side code.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { title, message } = await req.json();

    if (!title || !message) {
      return new Response(JSON.stringify({ error: "title and message are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appId = Deno.env.get("ONESIGNAL_APP_ID");
    const restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

    if (!appId || !restApiKey) {
      console.error("Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY secret");
      return new Response(JSON.stringify({ error: "Push not configured on the server yet" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Broadcasts to everyone who has the app installed and notifications
    // enabled — every notification type in this app (new observation,
    // status change, admin broadcast) is meant for the whole team, so
    // there's no per-user targeting to do here.
    //
    // NOTE: newer OneSignal apps (on the "User Model") use "Total
    // Subscriptions" as the default all-subscribers segment instead of the
    // legacy "Subscribed Users" name. Using the wrong name here sends to an
    // empty/non-existent segment and OneSignal returns
    // "All included players are not subscribed" even when real devices are
    // subscribed under the correct segment.
    const oneSignalResponse = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ["Total Subscriptions"],
        headings: { en: title },
        contents: { en: message },
      }),
    });

    const result = await oneSignalResponse.json();

    if (!oneSignalResponse.ok) {
      console.error("OneSignal error:", result);
      return new Response(JSON.stringify({ error: result }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
