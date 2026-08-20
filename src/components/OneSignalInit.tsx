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
            // Shows OneSignal's built-in slide-down prompt automatically a
            // few seconds after the page loads, asking the visitor to allow
            // notifications. You can further tune timing/copy from the
            // OneSignal Dashboard under Settings -> Web Push -> Permission
            // Prompts -> Slide Prompt.
            promptOptions: {
              slidedown: {
                prompts: [
                  {
                    type: "push",
                    autoPrompt: true,
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
        });
      }}
    />
  );
}
