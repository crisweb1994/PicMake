/** 工作区 selector：返回原始值或 store 内已有的引用，避免 zustand v5 因新引用反复渲染 */
import type { HistoryRow } from "../../db/schema";
import type { WorkspaceState } from "./index";

const EMPTY_ROWS: HistoryRow[] = [];

/** 历史列表；尚未加载时为固定的空数组 */
export const selectRows = (s: WorkspaceState) => s.history.rows ?? EMPTY_ROWS;

/** "返回结果"的目标记录仍在列表中 */
export const selectCanReturn = (s: WorkspaceState) =>
  !!s.nav.returnId &&
  (s.history.rows ?? EMPTY_ROWS).some((row) => row.id === s.nav.returnId);
