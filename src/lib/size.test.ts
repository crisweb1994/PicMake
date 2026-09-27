import { describe, expect, it } from "vitest";
import { validateSize } from "./size";

describe("validateSize", () => {
  it("接受合法尺寸", () => {
    expect(validateSize(1024, 1024)).toEqual([]);
    expect(validateSize(1536, 1024)).toEqual([]);
    expect(validateSize(1280, 768)).toEqual([]);
    expect(validateSize(3840, 2160)).toEqual([]);
    expect(validateSize(2160, 3840)).toEqual([]); // 竖版 4K 同样合法（D4 旋转归一）
  });

  it("拒绝不能被 16 整除的宽高", () => {
    expect(validateSize(1000, 1000)).toContain("宽高须能被 16 整除");
    expect(validateSize(1024, 1080)).toContain("宽高须能被 16 整除");
  });

  it("拒绝超比例", () => {
    expect(validateSize(3072, 1024)).toEqual([]); // 3:1 恰好合法
    expect(validateSize(4096, 1024).length).toBeGreaterThan(0); // 4:1 且超上限
  });

  it("按 D4 旋转归一 4K 框拒绝超上限（旧实现 3840×3840 误通过）", () => {
    expect(validateSize(3840, 3840)).toContain("长宽上限 3840 × 2160");
    expect(validateSize(2560, 2560)).toContain("长宽上限 3840 × 2160");
    expect(validateSize(3856, 2160)).toContain("长宽上限 3840 × 2160");
    expect(validateSize(2160, 3856)).toContain("长宽上限 3840 × 2160");
  });
});
