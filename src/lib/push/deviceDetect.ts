"use client";

// آيفون يسمح بإشعارات الويب فقط بعد تثبيت الموقع على الشاشة الرئيسية (وضع
// standalone)، وليس من داخل تبويب Safari مباشرة - قيد من آبل نفسها.
export function isRunningAsInstalledApp(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

// يكتشف تحديدًا آيفون/آيباد داخل متصفح Safari الحقيقي (يستثني المتصفحات
// الأخرى اللي تستخدم نفس محرك WebKit على iOS مثل Chrome/Firefox، لأن خطوات
// "إضافة للشاشة الرئيسية" تختلف بينها).
export function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIphoneOrIpod = /iPhone|iPod/.test(ua);
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  const isSafariEngine = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(ua);
  return (isIphoneOrIpod || isIpad) && isSafariEngine;
}

// يكتشف تحديدًا آيفون (يستثني آيباد وآيبود) داخل Safari الحقيقي. يُستخدم
// للميزات اللي نبي نقصرها على آيفون فقط، مثل خانة "تنبيهات البلاغات" في
// الإعدادات.
export function isIphone(): boolean {
  const ua = navigator.userAgent;
  const isIphoneDevice = /iPhone/.test(ua);
  const isSafariEngine = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/.test(ua);
  return isIphoneDevice && isSafariEngine;
}
