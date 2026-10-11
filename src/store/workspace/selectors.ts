/** 工作区 selector：返回原始值或 store 内已有的引用，避免 zustand v5 因新引用反复渲染 */
import type { HistoryRow } from "../../db/schema";
import type { PreparedGeneration } from "../../lib/generation";
import type { WorkspaceState } from "./index";

const EMPTY_ROWS: HistoryRow[] = [];

/** 历史列表；尚未加载时为固定的空数组 */
export const selectRows = (s: WorkspaceState) => s.history.rows ?? EMPTY_ROWS;

/** "返回结果"的目标记录仍在列表中 */
export const selectCanReturn = (s: WorkspaceState) =>
  !!s.nav.returnId &&
  (s.history.rows ?? EMPTY_ROWS).some((row) => row.id === s.nav.returnId);

/** 只在内存里的结果：保存中、保存失败 */
export const selectPending = (s: WorkspaceState): PreparedGeneration | null =>
  s.run.phase === "saving" || s.run.phase === "unsaved" ? s.run.prepared : null;

/** 按 id 找记录：列表里的，或只在内存里的（保存中、保存失败、刚保存还没回推） */
export const findRow = (s: WorkspaceState, id: string): HistoryRow | null =>
  s.history.rows?.find((row) => row.id === id) ??
  [selectPending(s)?.row, s.history.recent?.row].find(
    (row) => row?.id === id,
  ) ??
  null;

/** 舞台展示的记录（数据层，不等图片 URL）：内存结果优先；列表还没回推刚保存的记录时用 recent 过渡 */
export const selectDisplayRow = (s: WorkspaceState): HistoryRow | null => {
  const pending = selectPending(s);
  if (pending) return pending.row;
  return s.nav.selectedId ? findRow(s, s.nav.selectedId) : null;
};

/** 当前选中的图片：单张取那张，多张取轮播所在的那张 */
export const selectSelectedImageId = (s: WorkspaceState): string | null => {
  const row = selectDisplayRow(s);
  if (!row) return null;
  if (row.imageIds.length === 1) return row.imageIds[0];
  return s.view.focusIdx !== null
    ? (row.imageIds[s.view.focusIdx] ?? null)
    : null;
};
