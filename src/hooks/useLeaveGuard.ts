import { useEffect } from "react";

/** active 期间关闭或刷新页面时，让浏览器弹出原生的离开确认。
 *  生成与保存还没结束时离开，已经付费的结果会丢；只在这个区间监听，结束即移除 */
export function useLeaveGuard(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // 部分浏览器要求设置 returnValue 才会弹出确认
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
