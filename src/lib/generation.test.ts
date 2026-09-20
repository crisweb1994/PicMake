import { describe, expect, it } from "vitest";
import { prepareGeneration } from "./generation";

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
        images: [{ b64: "AQ==" }, { b64: "Ag==" }],
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
    expect(
      result.images.every((image) => image.blob.type === "image/png"),
    ).toBe(true);
  });
});
