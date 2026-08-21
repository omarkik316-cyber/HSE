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
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Belt-and-suspenders: the ordering fix in OneSignalInit.tsx means the
    // SDK should always initialize before this ever queues up, but the SDK
    // still depends on a third-party CDN script (blocked by some ad/privacy
    // blockers, or just slow/unreachable on a bad connection). If OneSignal
    // never becomes available, this timeout keeps the Settings screen from
    // showing a dead spot forever — it falls back to "not granted", which
    // simply re-shows the enable button instead of leaving nothing tappable.
    const timeout = setTimeout(() => settle(false), 8000);

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push((OneSignal: any) => {
      clearTimeout(timeout);
      settle(Boolean(OneSignal.Notifications.permission));
    });
  });
}

/**
 * Fires whenever push permission changes (granted or revoked) — used by the
 * Settings page to hide the "enable" button the instant the person answers
 * the native iOS dialog, without needing to poll.
 */
export function onPushPermissionChange(handler: (granted: boolean) => void) {
  let cleanup: (() => void) | undefined;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push((OneSignal: any) => {
    const listener = (granted: boolean) => handler(Boolean(granted));
    OneSignal.Notifications.addEventListener("permissionChange", listener);
    cleanup = () => OneSignal.Notifications.removeEventListener("permissionChange", listener);
  });
  return () => cleanup?.();
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
