import { afterEach, describe, expect, it } from "vitest";
import { fmtTime } from "./format";
import { i18n } from "./index";

afterEach(async () => {
  await i18n.changeLanguage("zh-CN");
});

/** 改造前 lib/format.ts 里的实现，用来证明中文输出逐字不变 */
function legacyFmtTime(ts: number, now: number): string {
  const d = new Date(ts);
  const current = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (now - ts < 60_000) return "刚刚";
  if (d.toDateString() === current.toDateString()) return `今天 ${hm}`;
  if (d.getFullYear() === current.getFullYear())
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).getTime();
const NOW = at(2026, 10, 12, 14, 30);

describe("fmtTime", () => {
  const cases: Array<[string, number]> = [
    ["刚刚", NOW - 10_000],
    ["今天（早上）", at(2026, 10, 12, 9, 5)],
    ["今天（午夜刚过）", at(2026, 10, 12, 0, 0, 30)],
    ["今年（上个月）", at(2026, 9, 3, 18, 45)],
    ["今年（年初）", at(2026, 1, 1, 0, 0)],
    ["去年", at(2025, 12, 31, 23, 59)],
    ["很久以前", at(2020, 2, 29, 12, 0)],
  ];

  for (const [name, ts] of cases)
    it(`中文输出与改造前逐字一致：${name}`, () => {
      expect(fmtTime(ts, i18n, NOW)).toBe(legacyFmtTime(ts, NOW));
    });

  it("英文：相对词与日期写法", async () => {
    await i18n.changeLanguage("en");
    expect(fmtTime(NOW - 10_000, i18n, NOW)).toBe("Just now");
    expect(fmtTime(at(2026, 10, 12, 9, 5), i18n, NOW)).toBe("Today 09:05");
    expect(fmtTime(at(2026, 9, 3, 18, 45), i18n, NOW)).toBe("Sep 3, 18:45");
    expect(fmtTime(at(2025, 12, 31, 23, 59), i18n, NOW)).toBe("Dec 31, 2025");
  });

  it("时分固定 24 小时制，午夜显示 00 而不是 24", async () => {
    await i18n.changeLanguage("en");
    expect(fmtTime(at(2026, 10, 12, 0, 5), i18n, NOW)).toBe("Today 00:05");
    expect(fmtTime(at(2026, 3, 2, 0, 5), i18n, NOW)).toBe("Mar 2, 00:05");
  });

  it("不认识的语言回落到源语言的写法", () => {
    const stub = { language: "xx", t: i18n.t.bind(i18n) };
    expect(fmtTime(at(2026, 9, 3, 18, 45), stub, NOW)).toBe("9月3日 18:45");
  });
});
