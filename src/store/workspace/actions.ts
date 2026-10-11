/** 工作区迁移函数：按事件命名，可跨切片、一次 set 完成；组件、hooks 与 flows 只通过这里写入 */
import type { HistoryRow } from "../../db/schema";
import type { ConfirmState } from "../../lib/view-models";
import { nextSelection } from "../../lib/workspace-rules";
import { useWorkspace, type ViewMask, type WorkspaceState } from "./index";

const set = useWorkspace.setState;
const setNav = (patch: Partial<WorkspaceState["nav"]>) =>
  set((s) => ({ nav: { ...s.nav, ...patch } }));
const setView = (patch: Partial<WorkspaceState["view"]>) =>
  set((s) => ({ view: { ...s.view, ...patch } }));

/** 启动时调用：未配置 apiKey 则打开设置 */
export const initWorkspace = (opts: { settingsOpen: boolean }) =>
  setView({ settingsOpen: opts.settingsOpen });

/* ── history ── */

/** liveQuery 回推：更新列表，并在同一次 set 里处理首次自动选中与删除回退 */
export const rowsLoaded = (rows: HistoryRow[]) =>
  set((s) => ({
    history: { rows },
    nav: {
      ...s.nav,
      selectedId: nextSelection(
        s.history.rows ?? undefined,
        rows,
        s.nav.selectedId,
      ),
    },
  }));

/* ── nav ── */

export const selectRecord = (id: string | null) => setNav({ selectedId: id });
export const setReturnId = (id: string | null) => setNav({ returnId: id });
export const setLastDoneId = (id: string | null) => setNav({ lastDoneId: id });
export const clearDone = () => setNav({ lastDoneId: null });

/* ── view ── */

/** 查看状态复位：轮播、灯箱、预览 */
export const resetView = () =>
  setView({ focusIdx: null, lightboxId: null, previewId: null });

/** 展开创作条并请求聚焦描述框 */
export const openBar = () =>
  set((s) => ({
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
