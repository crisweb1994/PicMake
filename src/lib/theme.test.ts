import { describe, expect, it } from "vitest";
import {
  applyTheme,
  isThemePref,
  readStoredTheme,
  resolveTheme,
} from "./theme";

describe("resolveTheme", () => {
  it("显式偏好直接返回", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("system 跟随系统外观", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("isThemePref", () => {
  it("只认三态偏好", () => {
    expect(isThemePref("light")).toBe(true);
    expect(isThemePref("dark")).toBe(true);
    expect(isThemePref("system")).toBe(true);
    expect(isThemePref("blue")).toBe(false);
    expect(isThemePref(42)).toBe(false);
    expect(isThemePref(undefined)).toBe(false);
  });
});

describe("readStoredTheme", () => {
  it("从 zustand persist 格式读出偏好", () => {
    expect(readStoredTheme('{"state":{"theme":"dark"},"version":0}')).toBe(
      "dark",
    );
    expect(readStoredTheme('{"state":{"baseUrl":"x"},"version":0}')).toBeNull();
  });

  it("缺失 / 坏 JSON / 非法值返回 null", () => {
    expect(readStoredTheme(null)).toBeNull();
    expect(readStoredTheme("")).toBeNull();
    expect(readStoredTheme("{oops")).toBeNull();
    expect(readStoredTheme('{"state":{"theme":"blue"}}')).toBeNull();
    expect(readStoredTheme('{"state":{}}')).toBeNull();
  });
});

describe("applyTheme", () => {
  it("按解析结果切换 .dark class", () => {
    const toggled: Array<[string, boolean]> = [];
    const root = {
      classList: {
        toggle: (cls: string, on: boolean) => toggled.push([cls, on]),
      },
    };
    applyTheme(root, "dark");
    applyTheme(root, "light");
    expect(toggled).toEqual([
      ["dark", true],
      ["dark", false],
    ]);
  });
});
