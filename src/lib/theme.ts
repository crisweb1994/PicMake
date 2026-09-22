/** 主题纯函数：偏好三态 → 解析 / 持久化读取 / DOM 应用。
 *  接线层（useTheme）与 index.html 防闪烁脚本共用同一套规则；组件不感知。 */

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const DEFAULT_THEME: ThemePref = "system";

const THEME_PREFS: readonly string[] = ["light", "dark", "system"];

export function isThemePref(v: unknown): v is ThemePref {
  return typeof v === "string" && THEME_PREFS.includes(v);
}

/** 解析偏好：system 时跟随系统外观 */
export function resolveTheme(
  pref: ThemePref,
  prefersDark: boolean,
): ResolvedTheme {
  if (pref === "system") return prefersDark ? "dark" : "light";
  return pref;
}

/** 从 PicMake-settings（zustand persist 格式）的原始 JSON 读主题偏好，坏数据返回 null */
export function readStoredTheme(raw: string | null): ThemePref | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { theme?: unknown } };
    const theme = parsed.state?.theme;
    return isThemePref(theme) ? theme : null;
  } catch {
    return null;
  }
}

/** 把解析结果落到 <html> 的 .dark class（HeroUI v3 与 pm 令牌共用的主题开关） */
export function applyTheme(
  root: { classList: { toggle(cls: string, force: boolean): void } },
  resolved: ResolvedTheme,
): void {
  root.classList.toggle("dark", resolved === "dark");
}
