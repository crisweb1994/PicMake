/** i18next 实例与初始化。资源随包内置、同步初始化：首帧就是正确的语言，不发任何请求，
 *  也不用语言检测插件（它会往 localStorage 写 i18nextLng，违反持久化只有两处的约束）。
 *  非 React 代码（flows）直接用这里导出的 t；组件用 react-i18next 的 useTranslation。 */
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { SOURCE_LOCALE, type Locale } from "../lib/locale";
import { resources } from "./resources";

export { i18next as i18n };
export { t } from "i18next";
export type { TFunction } from "i18next";

/** 初始化一次；重复调用只切换语言 */
export function initI18n(locale: Locale): void {
  if (i18next.isInitialized) {
    void i18next.changeLanguage(locale);
    return;
  }
  void i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: SOURCE_LOCALE,
    initAsync: false,
    interpolation: { escapeValue: false },
  });
}
