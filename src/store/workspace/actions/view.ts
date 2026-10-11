/** 查看状态与全局弹层迁移函数 */
import type { ConfirmState } from "../../../lib/view-models";
import { type ViewMask } from "../index";
import { set, setView } from "./internal";

/** 启动时调用：未配置 apiKey 则打开设置 */
export const initWorkspace = (opts: { settingsOpen: boolean }) =>
  setView({ settingsOpen: opts.settingsOpen });

/** 查看状态复位：轮播、灯箱、预览 */
export const resetView = () =>
  setView({ focusIdx: null, lightboxId: null, previewId: null });

/** 展开创作条并请求聚焦描述框 */
export const openBar = () =>
  set((s) => ({
    view: { ...s.view, barMode: "full", focusSeq: s.view.focusSeq + 1 },
  }));

/** 展开创作条并离开 complete 态：请求聚焦描述框 */
export const expandBar = () =>
  set((s) => ({
    nav: { ...s.nav, lastDoneId: null },
    view: { ...s.view, barMode: "full", focusSeq: s.view.focusSeq + 1 },
  }));

export const setBarMode = (barMode: "mini" | "full") => setView({ barMode });

export const requestPromptFocus = () =>
  set((s) => ({ view: { ...s.view, focusSeq: s.view.focusSeq + 1 } }));

export const setFocusIdx = (focusIdx: number | null) => setView({ focusIdx });
export const openLightbox = (id: string) => setView({ lightboxId: id });
export const closeLightbox = () => setView({ lightboxId: null });
export const setPreviewId = (previewId: string | null) =>
  setView({ previewId });
export const openDrawer = () => setView({ drawerOpen: true });
export const closeDrawer = () => setView({ drawerOpen: false });
export const openSettings = () => setView({ settingsOpen: true });
export const closeSettings = () => setView({ settingsOpen: false });
export const showViewMask = (viewMask: ViewMask) => setView({ viewMask });
export const closeViewMask = () => setView({ viewMask: null });

/* ── confirm ── */

export const setConfirm = (confirm: ConfirmState) => set({ confirm });
export const closeConfirm = () => set({ confirm: null });
