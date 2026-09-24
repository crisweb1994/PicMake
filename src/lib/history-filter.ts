/** 历史抽屉筛选（PRD FR-6，2026-09-23）：纯函数，行集合 + 筛选条件 → 行集合。
 *  维度为描述搜索（prompt / originPrompt）+ 日期预设档 + 只看收藏；不做模型筛选（用户决策 2026-09-23）。 */
import type { HistoryRow } from "../db/schema";

export type HistoryRange = "all" | "today" | "7d" | "30d";

export interface HistoryFilter {
  /** 描述关键词：命中 prompt 或编辑链 originPrompt，大小写不敏感，首尾空白忽略 */
  query: string;
  range: HistoryRange;
  starredOnly: boolean;
}

export const DEFAULT_HISTORY_FILTER: HistoryFilter = {
  query: "",
  range: "all",
  starredOnly: false,
};

const DAY = 86_400_000;

export function isHistoryFilterActive(filter: HistoryFilter): boolean {
  return (
    filter.query.trim() !== "" ||
    filter.range !== "all" ||
    filter.starredOnly
  );
}

export function filterHistoryRows(
  rows: HistoryRow[],
  filter: HistoryFilter,
  now: number = Date.now(),
): HistoryRow[] {
  const q = filter.query.trim().toLowerCase();
  const todayRef = new Date(now).toDateString();
  return rows.filter((row) => {
    if (
      q &&
      !row.prompt.toLowerCase().includes(q) &&
      !(row.originPrompt ?? "").toLowerCase().includes(q)
    ) {
      return false;
    }
    if (filter.range === "today") {
      if (new Date(row.createdAt).toDateString() !== todayRef) return false;
    } else if (filter.range === "7d") {
      if (row.createdAt < now - 7 * DAY) return false;
    } else if (filter.range === "30d") {
      if (row.createdAt < now - 30 * DAY) return false;
    }
    if (filter.starredOnly && !row.starred) return false;
    return true;
  });
}
