import { describe, expect, it } from "vitest";
import { prepareGeneration, prepareMultiGeneration } from "./generation";
import type { GenParams } from "./types";

describe("prepareGeneration", () => {
  it("为一批结果生成稳定图片和历史行", () => {
    const result = prepareGeneration(
      {
        model: "flare",
        prompt: "p",
        size: { w: 1024, h: 1024 },
        quality: "high",
        n: 2,
        background: "auto",
        outputFormat: "png",
      },
      {
        images: ["/9j/", "Ag=="],
        usage: null,
      },
      undefined,
      Date.now() - 10,
      (() => {
        let next = 0;
        return () => `id-${next++}`;
      })(),
    );

    expect(result.images.map((image) => image.id)).toEqual(["id-0", "id-1"]);
    expect(result.row.id).toBe("id-2");
    expect(result.row.imageIds).toEqual(["id-0", "id-1"]);
    // 逐张使用真实格式；无法识别的头部回退请求格式。
    expect(
      result.images.map((image) => [image.format, image.blob.type]),
    ).toEqual([
      ["jpeg", "image/jpeg"],
      ["png", "image/png"],
    ]);
  });
});

describe("prepareMultiGeneration", () => {
  const params: GenParams = {
    model: "flare",
    prompt: "p",
    size: { w: 1024, h: 1024 },
    quality: "high",
    n: 1,
    background: "auto",
    outputFormat: "png",
    sizes: [
      { w: 1024, h: 1024 },
      { w: 1792, h: 1008 },
      { w: 1008, h: 1792 },
    ],
  };
  const slot = (
    w: number,
    h: number,
    usage: Record<string, unknown> | null,
  ) => ({
    blob: new Blob(["x"], { type: "image/png" }),
    format: "png",
    width: w,
    height: h,
    usage,
  });
  const ids = () => {
    let next = 0;
    return () => `id-${next++}`;
  };

  it("成功的请求按顺序合并为一条记录：宽高取实际尺寸，usage 按请求分别保存", () => {
    const result = prepareMultiGeneration(
      params,
      [slot(1024, 1024, { total_tokens: 1 }), slot(1008, 1792, null)],
      undefined,
      Date.now() - 10,
      ids(),
    );
    expect(result.images.map((i) => [i.id, i.width, i.height])).toEqual([
      ["id-0", 1024, 1024],
      ["id-1", 1008, 1792],
    ]);
    expect(result.row.id).toBe("id-2");
    expect(result.row.imageIds).toEqual(["id-0", "id-1"]);
    // 提交时的全部尺寸原样保存，包括没有出图的那个
    expect(result.row.params.sizes).toHaveLength(3);
    expect(result.row.usage).toBeNull();
    expect(result.row.usages).toEqual([{ total_tokens: 1 }, null]);
    expect(result.sources).toEqual([]);
  });

  it("带参考图时保存输入来源与原始描述", () => {
    const image = {
      id: "src",
      blob: new Blob(),
      width: 10,
      height: 10,
      format: "png",
    };
    const result = prepareMultiGeneration(
      params,
      [slot(1024, 1024, null), slot(1792, 1008, null)],
      {
        sources: [{ source: { imageId: "src", name: "a.png" }, image }],
        inputFidelity: "auto",
      },
      Date.now(),
      ids(),
      "原始描述",
    );
    expect(result.row.inputSources).toEqual([
      { imageId: "src", name: "a.png" },
    ]);
    expect(result.row.originPrompt).toBe("原始描述");
    expect(result.sources).toEqual([image]);
  });
});
