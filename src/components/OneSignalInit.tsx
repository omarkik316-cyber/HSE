"use client";

// Loads the OneSignal Web Push SDK (v16) and initializes it with our App ID.
// This is what lets a *browser visitor* (not just the Android app) subscribe
// to push notifications. Without this, the site has no web subscribers at
// all, so any broadcast sent by the `send-push` Edge Function only ever
// reaches the Android app's registered devices.
//
// The service worker file this depends on lives at
// public/OneSignalSDKWorker.js (served from the site root, which OneSignal
// requires).

import Script from "next/script";
import { listenForPushClicks } from "@/lib/push/onesignal";

const ONESIGNAL_APP_ID = "9be42027-eb2b-4027-8610-8ddb96cbaf10";

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: unknown) => void>;
  }
}

export default function OneSignalInit() {
  return (
    <Script
      src="https://cdn.onesignal.com/sdks/OneSignalSDK.page.js"
      strategy="afterInteractive"
      onLoad={() => {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async (OneSignal: any) => {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            // The site's own service worker (from @ducanh2912/next-pwa) is
            // registered at the root scope "/" for offline caching. If
            // OneSignal's worker also registers at "/", whichever one
            // registers last silently evicts the other — this is a
            // documented OneSignal/PWA conflict, not a one-off bug. Moving
            // OneSignal's worker to its own subdirectory scope lets both
            // coexist. The file was moved to
            // public/push/onesignal/OneSignalSDKWorker.js to match.
            serviceWorkerPath: "push/onesignal/OneSignalSDKWorker.js",
            serviceWorkerParam: { scope: "/push/onesignal/" },
            // The timer-based auto-prompt (autoPrompt: true + delay) fires
            // from a setTimeout, not a direct user tap — iOS Safari
            // requires permission requests to originate from a real
            // synchronous user gesture and otherwise just declines to show
            // anything, native dialog included. That's why "السماح" never
            // appeared. Permission is now requested explicitly when the
            // person taps the notification bell instead (see
            // requestPushPermissionOnUserGesture in lib/push/onesignal.ts),
            // so autoPrompt is off here — this slidedown config is kept
            // only in case it's turned back on for non-iOS visitors later.
            promptOptions: {
              slidedown: {
                prompts: [
                  {
                    type: "push",
                    autoPrompt: false,
                    text: {
                      actionMessage:
                        "نود إرسال إشعارات لك عند وجود بلاغات أو تحديثات جديدة في نظام الملاحظات.",
                      acceptButton: "السماح",
                      cancelButton: "لاحقاً",
                    },
                    delay: {
                      pageViews: 1,
                      timeDelay: 5,
                    },
                  },
                ],
              },
            },
          });
          listenForPushClicks();
        });
      }}
    />
  );
}
