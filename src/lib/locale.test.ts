import { describe, expect, it } from "vitest";
import { resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("固定语言直接生效，不看系统语言", () => {
    expect(resolveLocale("en", ["zh-CN"])).toBe("en");
    expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
  });

  it("跟随系统：按顺序取第一个能匹配的语言", () => {
    expect(resolveLocale("system", ["en-US", "zh-CN"])).toBe("en");
    expect(resolveLocale("system", ["fr-FR", "zh-CN"])).toBe("zh-CN");
    expect(resolveLocale("system", ["ja", "ko", "en-GB"])).toBe("en");
  });

  it("中文的各种地区变体都解析为简体中文", () => {
    for (const tag of ["zh", "zh-CN", "zh-Hans", "zh-TW", "zh-HK", "ZH-cn"])
      expect(resolveLocale("system", [tag])).toBe("zh-CN");
  });

  it("下划线写法与大小写也能匹配", () => {
    expect(resolveLocale("system", ["zh_CN"])).toBe("zh-CN");
    expect(resolveLocale("system", ["EN_us"])).toBe("en");
  });

  it("都不支持或没有语言信息时回落英文", () => {
    expect(resolveLocale("system", ["fr", "de"])).toBe("en");
    expect(resolveLocale("system", [])).toBe("en");
  });

  it("偏好是未知值（坏数据）时按跟随系统处理", () => {
    expect(resolveLocale("klingon", ["zh-CN"])).toBe("zh-CN");
    expect(resolveLocale(undefined, ["en"])).toBe("en");
    expect(resolveLocale(null, [])).toBe("en");
    expect(resolveLocale(42, ["zh"])).toBe("zh-CN");
  });
});
