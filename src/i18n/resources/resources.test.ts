import { describe, expect, it } from "vitest";
import { LOCALES } from "../../lib/locale";
import { resources } from "./index";

/** 叶子 key → 文案；复数 key 保留 _one / _other 后缀 */
function flatten(obj: object, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const texts = Object.fromEntries(
  LOCALES.map((locale) => [locale, flatten(resources[locale].translation)]),
);
const source = texts["zh-CN"];

describe("翻译资源", () => {
  it("每种受支持的语言都有资源，反之亦然", () => {
    expect(Object.keys(resources).sort()).toEqual([...LOCALES].sort());
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const own = texts[locale];

      it("key 与源语言完全一致", () => {
        expect([...own.keys()].sort()).toEqual([...source.keys()].sort());
      });

      it("同一条文案的插值变量与源语言一致", () => {
        for (const [key, text] of source)
          expect(placeholders(own.get(key) ?? ""), key).toEqual(
            placeholders(text),
          );
      });

      it("没有空文案", () => {
        for (const [key, text] of own) expect(text.trim(), key).not.toBe("");
      });

      it("带复数后缀的 key 成对出现，且都带 count 变量", () => {
        for (const [key, text] of own) {
          const m = key.match(/^(.*)_(one|other)$/);
          if (!m) continue;
          const sibling = `${m[1]}_${m[2] === "one" ? "other" : "one"}`;
          expect(own.has(sibling), `${key} 缺少 ${sibling}`).toBe(true);
          expect(placeholders(text), key).toContain("count");
        }
      });
    });
  }
});
