"use client";

import { useEffect, useState } from "react";
import { isIosSafari, isRunningAsInstalledApp } from "@/lib/push/deviceDetect";

const DISMISS_KEY = "hse-a2hs-dismissed";

/**
 * بانر إرشادي يظهر فقط لمستخدمي آيفون اللي يفتحون الموقع من Safari مباشرة
 * (مو مثبّتين التطبيق أصلًا) - لأن آيفون **لا يدعم إشعارات الويب إطلاقًا
 * إلا بعد تثبيت الموقع على الشاشة الرئيسية**، وما فيه أي API برمجي يفتح هذا
 * الحوار تلقائيًا (قيد متعمّد من آبل). مركّب مرة وحدة بأعلى التطبيق
 * (layout.tsx) ويشتغل تلقائيًا في كل الصفحات.
 */
export default function AddToHomeScreenBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alreadyDismissed = localStorage.getItem(DISMISS_KEY) === "1";
    if (!alreadyDismissed && isIosSafari() && !isRunningAsInstalledApp()) {
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-start gap-3 rounded-2xl border border-orange-500/30 bg-neutral-900 p-4 text-white shadow-xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-w-sm">
      <div className="flex-1 text-sm">
        <p className="mb-1 font-semibold">ثبّت التطبيق على جهازك</p>
        <p className="leading-relaxed text-white/70">
          الإشعارات على آيفون تعمل فقط بعد التثبيت: اضغط زر المشاركة (المربع
          وفوقه سهم) بالأسفل، ثم اختر &quot;إضافة إلى الشاشة الرئيسية&quot;.
        </p>
        <button onClick={dismiss} className="mt-2 text-xs font-medium text-orange-400 hover:underline">
          لاحقًا
        </button>
      </div>
      <button onClick={dismiss} aria-label="dismiss" className="shrink-0 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white">
        ✕
      </button>
    </div>
  );
}
