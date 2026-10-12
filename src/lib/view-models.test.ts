import { describe, expect, it } from "vitest";
import { inputNaming, workIndexOf } from "./view-models";

const ctx = { sketch: false, base: false };

describe("inputNaming", () => {
  it("用户上传：文件名", () => {
    expect(inputNaming({ name: "cat.png" }, ctx)).toEqual({
      kind: "file",
      fileName: "cat.png",
    });
  });

  it("草图优先于一切（记录里保存的旧名字不再使用）", () => {
    expect(
      inputNaming({ name: "草图" }, { ...ctx, sketch: true, base: true }),
    ).toEqual({ kind: "sketch" });
  });

  it("局部重绘底图：忽略保存的名字与来源", () => {
    expect(
      inputNaming({ name: "底图", generationId: "g" }, { ...ctx, base: true }),
    ).toEqual({ kind: "base" });
  });

  it("已有作品：带序号；来源记录已删除时序号未知，旧记录里保存的名字被忽略", () => {
    expect(
      inputNaming(
        { name: "已有作品 · 第 2 张", generationId: "g" },
        { ...ctx, workIndex: 2 },
      ),
    ).toEqual({ kind: "work", workIndex: 2 });
    expect(inputNaming({ generationId: "g" }, ctx)).toEqual({
      kind: "work",
      workIndex: undefined,
    });
  });

  it("什么都没有（旧数据）：按已有作品", () => {
    expect(inputNaming({}, ctx)).toEqual({ kind: "work" });
  });
});

describe("workIndexOf", () => {
  const rows = [
    { id: "a", imageIds: ["a-1"] },
    { id: "b", imageIds: ["b-1", "b-2"] },
  ];

  it("图片在来源记录里的序号（从 1 起）", () => {
    expect(workIndexOf(rows, "b", "b-2")).toBe(2);
    expect(workIndexOf(rows, "a", "a-1")).toBe(1);
  });

  it("记录或图片不存在：undefined", () => {
    expect(workIndexOf(rows, "gone", "x")).toBeUndefined();
    expect(workIndexOf(rows, "b", "x")).toBeUndefined();
    expect(workIndexOf(rows, undefined, "b-1")).toBeUndefined();
  });
});
