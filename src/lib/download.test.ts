import { describe, expect, it } from "vitest";
import { downloadName } from "./download";

describe("downloadName", () => {
  const id = "3f2a9c1e-7b4d-4e8a-9f00-123456789abc";

  it("记录 id 前 8 位 + 从 1 开始的序号", () => {
    expect(downloadName(id, 0, "png")).toBe("PicMake-3f2a9c1e-1.png");
    expect(downloadName(id, 3, "png")).toBe("PicMake-3f2a9c1e-4.png");
  });

  it("扩展名取实际格式，jpeg 写作 jpg", () => {
    expect(downloadName(id, 0, "jpeg")).toBe("PicMake-3f2a9c1e-1.jpg");
    expect(downloadName(id, 0, "webp")).toBe("PicMake-3f2a9c1e-1.webp");
  });

  it("同一记录的多张图文件名互不相同", () => {
    const names = [0, 1, 2, 3].map((i) => downloadName(id, i, "png"));
    expect(new Set(names).size).toBe(4);
  });

  it("多尺寸记录带上图片的实际像素", () => {
    expect(downloadName(id, 1, "png", { w: 1792, h: 1008 })).toBe(
      "PicMake-3f2a9c1e-2-1792x1008.png",
    );
    expect(downloadName(id, 0, "jpeg", { w: 1008, h: 1792 })).toBe(
      "PicMake-3f2a9c1e-1-1008x1792.jpg",
    );
  });

  it("宽高未知（0）时不带像素", () => {
    expect(downloadName(id, 0, "png", { w: 0, h: 0 })).toBe(
      "PicMake-3f2a9c1e-1.png",
    );
  });
});
