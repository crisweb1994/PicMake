import { describe, expect, it } from "vitest";
import type { HistoryRow } from "../db/schema";
import type { GenParams } from "./types";
import {
  DEFAULT_HISTORY_FILTER,
  filterHistoryRows,
  isHistoryFilterActive,
  type HistoryFilter,
} from "./history-filter";

/** 2026-09-23 12:00（本地时区），供日界与滚动窗口断言 */
const NOW = new Date("2026-09-23T12:00:00").getTime();
const HOUR = 3_600_000;
const DAY = 86_400_000;

const PARAMS: GenParams = {
  model: "flare",
  prompt: "",
  size: "auto",
  quality: "high",
  n: 1,
  background: "auto",
  outputFormat: "png",
};

function row(over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id: "r",
    prompt: "山间小屋，清晨薄雾",
    params: PARAMS,
    usage: null,
    imageIds: ["i1"],
    createdAt: NOW,
    durationMs: 30_000,
    ...over,
  };
}

const f = (over: Partial<HistoryFilter> = {}): HistoryFilter => ({
  ...DEFAULT_HISTORY_FILTER,
  ...over,
});

describe("filterHistoryRows · 描述搜索", () => {
  it("默认条件返回全部行", () => {
    const rows = [row({ id: "a" }), row({ id: "b", prompt: "城市夜景" })];
    expect(filterHistoryRows(rows, f(), NOW)).toHaveLength(2);
  });

  it("关键词命中 prompt，大小写不敏感", () => {
    const rows = [
      row({ id: "a", prompt: "Cyberpunk City, neon" }),
      row({ id: "b", prompt: "水彩风格的小镇" }),
    ];
    const out = filterHistoryRows(rows, f({ query: "CYBERPUNK" }), NOW);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("关键词命中编辑链 originPrompt（原始描述可搜到编辑结果）", () => {
    const rows = [
      row({ id: "a", prompt: "把天空调成晚霞色调", originPrompt: "山间小屋，清晨薄雾" }),
      row({ id: "b", prompt: "完全不相关的描述" }),
    ];
    const out = filterHistoryRows(rows, f({ query: "山间小屋" }), NOW);
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("首尾空白被忽略；空串等价于不过滤", () => {
    const rows = [row()];
    expect(filterHistoryRows(rows, f({ query: "  山间小屋  " }), NOW)).toHaveLength(1);
    expect(filterHistoryRows(rows, f({ query: "   " }), NOW)).toHaveLength(1);
  });

  it("不命中时返回空", () => {
    expect(filterHistoryRows([row()], f({ query: "不存在的词" }), NOW)).toEqual([]);
  });
});

describe("filterHistoryRows · 日期预设档", () => {
  it("今天：同日命中、昨日不命中（按本地日界）", () => {
    const rows = [
      row({ id: "today", createdAt: NOW }),
      row({ id: "yesterday", createdAt: NOW - 13 * HOUR }),
    ];
    const out = filterHistoryRows(rows, f({ range: "today" }), NOW);
    expect(out.map((r) => r.id)).toEqual(["today"]);
  });

  it("近7天：滚动窗口边界（7 天内命中、恰好超界不命中）", () => {
    const rows = [
      row({ id: "in", createdAt: NOW - 7 * DAY + HOUR }),
      row({ id: "out", createdAt: NOW - 7 * DAY - HOUR }),
    ];
    const out = filterHistoryRows(rows, f({ range: "7d" }), NOW);
    expect(out.map((r) => r.id)).toEqual(["in"]);
  });

  it("近30天：滚动窗口", () => {
    const rows = [
      row({ id: "in", createdAt: NOW - 29 * DAY }),
      row({ id: "out", createdAt: NOW - 31 * DAY }),
    ];
    const out = filterHistoryRows(rows, f({ range: "30d" }), NOW);
    expect(out.map((r) => r.id)).toEqual(["in"]);
  });
});

describe("filterHistoryRows · 收藏与组合", () => {
  it("只看收藏：仅 starred 行命中，未标星与缺字段行都排除", () => {
    const rows = [
      row({ id: "starred", starred: true }),
      row({ id: "plain" }),
    ];
    const out = filterHistoryRows(rows, f({ starredOnly: true }), NOW);
    expect(out.map((r) => r.id)).toEqual(["starred"]);
  });

  it("多条件 AND 叠加：搜索 × 日期 × 收藏", () => {
    const rows = [
      row({ id: "hit", prompt: "海边日落", createdAt: NOW, starred: true }),
      row({ id: "no-star", prompt: "海边日出", createdAt: NOW }),
      row({ id: "old", prompt: "海边栈桥", createdAt: NOW - 40 * DAY, starred: true }),
      row({ id: "no-word", prompt: "雪山", createdAt: NOW, starred: true }),
    ];
    const out = filterHistoryRows(
      rows,
      f({ query: "海边", range: "30d", starredOnly: true }),
      NOW,
    );
    expect(out.map((r) => r.id)).toEqual(["hit"]);
  });
});

describe("isHistoryFilterActive", () => {
  it("默认条件未激活", () => {
    expect(isHistoryFilterActive(DEFAULT_HISTORY_FILTER)).toBe(false);
  });

  it("任一非默认条件即激活", () => {
    expect(isHistoryFilterActive(f({ query: "x" }))).toBe(true);
    expect(isHistoryFilterActive(f({ range: "today" }))).toBe(true);
    expect(isHistoryFilterActive(f({ starredOnly: true }))).toBe(true);
    expect(isHistoryFilterActive(f({ query: "  " }))).toBe(false);
  });
});
