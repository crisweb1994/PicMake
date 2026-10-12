/** 语言根：把语言偏好接到 i18next 与 <html lang>，并让组件库（React Aria / HeroUI）的内置文案、
 *  日期组件使用同一语言 */
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { useLocale } from "../hooks/useLocale";

export function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = useLocale();
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
