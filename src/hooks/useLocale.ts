/** 语言接线：偏好 → 实际语言 → i18next 与 <html lang>。
 *  副作用：偏好为「跟随系统」期间监听 languagechange（系统语言变化即重新解析），切到固定语言即移除 */
import { useEffect, useReducer } from "react";
import { i18n } from "../i18n";
import { resolveLocale, type Locale } from "../lib/locale";
import { useSettings } from "../store/settings";

export function useLocale(): Locale {
  const pref = useSettings((s) => s.locale);
  // 每次渲染都读最新的 navigator.languages；监听只负责在它变化时触发重渲染
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (pref !== "system") return;
    window.addEventListener("languagechange", refresh);
    return () => window.removeEventListener("languagechange", refresh);
  }, [pref]);

  const locale = resolveLocale(pref, navigator.languages);
  useEffect(() => {
    document.documentElement.lang = locale;
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [locale]);
  return locale;
}
