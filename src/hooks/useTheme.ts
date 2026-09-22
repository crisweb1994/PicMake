/** 主题接线：偏好（settings store）→ <html>.dark class 与 theme-color meta 同步。
 *  副作用（随 App 挂载、卸载清理）：matchMedia 监听，system 模式下实时跟随系统外观。 */
import { useCallback, useEffect, useState } from "react";
import { useSettings } from "../store/settings";
import { resolveTheme, type ResolvedTheme } from "../lib/theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function useTheme() {
  const pref = useSettings((s) => s.theme);
  const setPref = useSettings((s) => s.setTheme);
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: ResolvedTheme = resolveTheme(pref, prefersDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolved === "dark" ? "#0e0f11" : "#f7f8f9");
  }, [resolved]);

  /** 顶栏快捷钮：切到当前生效主题的反向（写入显式偏好） */
  const toggle = useCallback(() => {
    setPref(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPref]);

  return { pref, resolved, setPref, toggle };
}
