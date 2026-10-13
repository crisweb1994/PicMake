import { useMemo, useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  window.addEventListener("resize", notify);
  return () => window.removeEventListener("resize", notify);
};
const noSubscribe = () => () => {};
const width = () => window.innerWidth;
const height = () => window.innerHeight;

/** 视口尺寸。只在 active 期间监听 resize（多尺寸舞台显示期间），离开即移除；不监听时仍返回当前值 */
export function useViewportSize(active: boolean): { w: number; h: number } {
  const w = useSyncExternalStore(
    active ? subscribe : noSubscribe,
    width,
    () => 1280,
  );
  const h = useSyncExternalStore(
    active ? subscribe : noSubscribe,
    height,
    () => 800,
  );
  return useMemo(() => ({ w, h }), [w, h]);
}
