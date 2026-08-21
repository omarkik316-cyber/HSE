"use client";

// Small shared helper around the OneSignal Web SDK (loaded globally by
// OneSignalInit.tsx). Kept separate from OneSignalInit so any component
// (e.g. the notification bell) can request permission or listen for clicks
// without re-implementing the OneSignalDeferred plumbing.

declare global {
  interface Window {
    OneSignalDeferred?: Array<(oneSignal: any) => void>;
  }
}

/**
 * Requests push permission, but only if the visitor hasn't already
 * answered (granted/denied) or already has a subscription. Must be called
 * directly inside a click handler — no `await` before this runs, and no
 * wrapping in a `setTimeout`/promise chain — otherwise iOS Safari silently
 * drops the request instead of showing its native "Allow" dialog, since it
 * only honors permission prompts fired synchronously from a real user tap.
 *
 * Once a browser has denied permission, no amount of retrying from code can
 * bring the native dialog back — the person has to re-enable notifications
 * for the site/app from their device Settings.
 */
export function requestPushPermissionOnUserGesture() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (OneSignal: any) => {
    try {
      if (OneSignal.Notifications.permission) return; // already granted
      await OneSignal.Notifications.requestPermission();
    } catch (err) {
      console.error("OneSignal permission request failed:", err);
    }
  });
}

/**
 * Resolves once with the current permission state (true = granted). Safe to
 * call anytime, even before the SDK script has finished loading — it just
 * queues onto OneSignalDeferred like everything else here.
 */
export function getPushPermission(): Promise<boolean> {
  return new Promise((resolve) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push((OneSignal: any) => {
      resolve(Boolean(OneSignal.Notifications.permission));
    });
  });
}

export type PushClickPayload = {
  title: string;
  message: string;
  observationId: string | null;
};

const CLICK_EVENT_NAME = "hse:push-notification-click";

/**
 * Registers a listener that fires whenever the visitor taps a delivered
 * push notification — whether the app was already open in the foreground,
 * or was closed and this tap is what launched it (OneSignal queues the
 * click and replays it once the SDK finishes initializing).
 *
 * Re-broadcasts as a plain window CustomEvent so page.tsx (which owns the
 * toast + observation-opening logic) doesn't need to know anything about
 * OneSignal directly.
 */
export function listenForPushClicks() {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push((OneSignal: any) => {
    OneSignal.Notifications.addEventListener("click", (event: any) => {
      const data = event?.notification?.additionalData ?? {};
      const payload: PushClickPayload = {
        title: event?.notification?.title ?? "",
        message: event?.notification?.body ?? "",
        observationId: typeof data.observationId === "string" ? data.observationId : null,
      };
      window.dispatchEvent(new CustomEvent<PushClickPayload>(CLICK_EVENT_NAME, { detail: payload }));
    });
  });
}

export function onPushClick(handler: (payload: PushClickPayload) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<PushClickPayload>).detail);
  window.addEventListener(CLICK_EVENT_NAME, listener);
  return () => window.removeEventListener(CLICK_EVENT_NAME, listener);
}
