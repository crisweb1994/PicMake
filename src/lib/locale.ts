/** 界面语言：受支持的语言、偏好与解析（纯函数）。语言码同时用作 <html lang> 与 i18next 的语言。 */
export const LOCALES = ["zh-CN", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** 偏好：跟随系统，或固定为某一种语言 */
export type LocalePref = "system" | Locale;
export const DEFAULT_LOCALE_PREF: LocalePref = "system";

/** 源语言：资源以它为基准（缺失文案回落到它），测试环境也用它 */
export const SOURCE_LOCALE: Locale = "zh-CN";

/** 系统语言一个都不支持时的语言 */
export const FALLBACK_LOCALE: Locale = "en";

const primaryTag = (tag: string) => tag.split(/[-_]/)[0].toLowerCase();

/** 偏好 → 实际语言。固定语言直接生效；跟随系统时按 languages 顺序取第一个能匹配的：
 *  主语言子标签相同即匹配（zh-TW / zh-HK 解析为 zh-CN，en-GB 解析为 en）；都不匹配回落英文。
 *  偏好是未知值（localStorage 里的坏数据）时按跟随系统处理。 */
export function resolveLocale(
  pref: unknown,
  languages: readonly string[],
): Locale {
  const fixed = LOCALES.find((locale) => locale === pref);
  if (fixed) return fixed;
  for (const language of languages) {
    const primary = primaryTag(language);
    const matched = LOCALES.find((locale) => primaryTag(locale) === primary);
    if (matched) return matched;
  }
  return FALLBACK_LOCALE;
}
