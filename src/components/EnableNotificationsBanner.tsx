"use client";

import { useEffect, useState } from "react";
import { getPushPermission, requestPushPermissionOnUserGesture } from "@/lib/push/onesignal";
import { isIosSafari, isRunningAsInstalledApp } from "@/lib/push/deviceDetect";

const DISMISS_KEY = "hse-enable-push-dismissed";

/**
 * زر/بانر واضح "فعّل الإشعارات" — بديل مرئي لطلب الإذن اللي مربوط بالجرس،
 * عشان المستخدم ما يحتاج يحزر إن الجرس هو اللي يطلب الإذن.
 *
 * على آيفون: ما يظهر إلا بعد التثبيت (AddToHomeScreenBanner يتكفّل بالحالة
 * اللي قبل التثبيت)، لأن طلب الإذن قبل التثبيت غير مدعوم أصلاً من آبل.
 * على باقي المتصفحات: يظهر مباشرة بدون شرط التثبيت.
 */
export default function EnableNotificationsBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      if (isIosSafari() && !isRunningAsInstalledApp()) return; // handled by the install banner instead
      const granted = await getPushPermission();
      if (!cancelled && !granted) setVisible(true);
    }

    const timer = setTimeout(check, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  function handleEnable() {
    // First thing in the handler — required so iOS still treats this as a
    // direct user gesture and shows its native permission dialog.
    requestPushPermissionOnUserGesture();
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-2xl border border-blue-500/30 bg-slate-900 p-4 text-white shadow-xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-w-sm">
      <div className="flex-1 text-sm">
        <p className="mb-1 font-semibold">فعّل الإشعارات</p>
        <p className="leading-relaxed text-white/70">
          عشان توصلك البلاغات والتحديثات الجديدة أول بأول، حتى لو التطبيق مقفول.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleEnable}
            className="tap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            فعّل الآن
          </button>
          <button onClick={dismiss} className="tap text-xs font-medium text-white/50 hover:underline">
            لاحقًا
          </button>
        </div>
      </div>
    </div>
  );
}
