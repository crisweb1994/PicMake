import { describe, expect, it } from "vitest";
import { historySources, imageFormat } from "./input-images";
import type { HistoryRow } from "../db/schema";
import { prepareGeneration } from "./generation";
import { formToParams, DEFAULT_FORM } from "./params";

describe("多图输入边界与来源", () => {
  it("按真实文件头判断格式，拒绝改后缀的文本和 SVG", () => {
    expect(imageFormat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(
      "png",
    );
    expect(imageFormat(new Uint8Array([255, 216, 255]))).toBe("jpeg");
    expect(imageFormat(new TextEncoder().encode("RIFF1234WEBP"))).toBe("webp");
    for (const text of ["", "<svg></svg>", "not a photo", "RIFF"])
      expect(imageFormat(new TextEncoder().encode(text))).toBeNull();
  });
  it("旧来源按单项读取，新来源按提交顺序保存，Blob 不写进历史元信息", () => {
    const legacy = {
      editSource: {
        imageId: "old",
        generationId: "parent",
        inputFidelity: "low",
      },
    } as HistoryRow;
    expect(historySources(legacy)).toEqual([
      { imageId: "old", generationId: "parent" },
    ]);
    expect(historySources({} as HistoryRow)).toEqual([]);
    const params = formToParams(DEFAULT_FORM);
    const sources = ["b", "a"].map((id) => ({
      source: { imageId: id, name: id + ".png" },
      image: { id, blob: new Blob([id]), format: "png", width: 10, height: 20 },
    }));
    const prepared = prepareGeneration(
      params,
      { images: [{ b64: "AQ==" }], usage: null },
      { params, sources, inputFidelity: "high" },
      Date.now(),
    );
    expect(
      historySources(prepared.row).map((source) => source.imageId),
    ).toEqual(["b", "a"]);
    expect(prepared.sources).toEqual(sources.map((source) => source.image));
    expect(prepared.row.inputFidelity).toBe("high");
    expect(JSON.stringify(prepared.row)).not.toMatch(/blob|upload/);
  });
});
