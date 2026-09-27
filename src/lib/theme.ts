/** 主题偏好与生效主题的纯规则。 */
export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export const DEFAULT_THEME: ThemePref = "system";

/** 解析偏好：system 时跟随系统外观 */
export function resolveTheme(
  pref: ThemePref,
  prefersDark: boolean,
): ResolvedTheme {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}
