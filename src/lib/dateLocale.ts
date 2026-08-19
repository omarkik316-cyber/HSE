"use client";

import { ar, zhCN, enUS, type Locale } from "date-fns/locale";
import { useSettings } from "@/lib/settings";

const LOCALES: Record<string, Locale> = { en: enUS, ar, zh: zhCN };

/** date-fns locale matching the current app language, for formatDistanceToNow/format calls. */
export function useDateLocale(): Locale {
  const { language } = useSettings();
  return LOCALES[language] ?? enUS;
}
