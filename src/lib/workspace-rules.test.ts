import { describe, expect, it } from "vitest";
import { DEFAULT_FORM, type GenForm } from "./params";
import type { InpaintDraft } from "./types";
import {
  draftToParams,
  inpaintBarInfo,
  nextSelection,
} from "./workspace-rules";

const rows = (...ids: string[]) => ids.map((id) => ({ id }));

/** 指定底图尺寸的选区附件 */
function inpaintOf(width: number, height: number): InpaintDraft {
  return {
    mask: {
      id: "mask",
      blob: new Blob(),
      width,
      height,
      format: "png",
      mask: { version: 1, width, height, baseImageId: "base", commands: [] },
    },
  };
}

const form = (patch: Partial<GenForm> = {}): GenForm => ({
  ...DEFAULT_FORM,
  prompt: "一只猫",
  ...patch,
});

describe("nextSelection", () => {
  it("首次加载选最近一条", () => {
    expect(nextSelection(undefined, rows("a", "b"), null)).toBe("a");
  });

  it("首次加载且没有记录时为 null", () => {
    expect(nextSelection(undefined, [], null)).toBeNull();
  });

  it("当前选中项被删除时回退到第一条", () => {
    expect(nextSelection(rows("a", "b", "c"), rows("a", "c"), "b")).toBe("a");
    expect(nextSelection(rows("a"), [], "a")).toBeNull();
  });

  it("写入早于回推：选中项不在旧列表里时保持不动", () => {
    expect(nextSelection(rows("a"), rows("a"), "new")).toBe("new");
    expect(nextSelection(rows("a"), rows("new", "a"), "new")).toBe("new");
  });

  it("删除的不是选中项时保持不动", () => {
    expect(nextSelection(rows("a", "b"), rows("a"), "a")).toBe("a");
  });

  it("没有选中项时保持 null", () => {
    expect(nextSelection(rows("a"), rows("b"), null)).toBeNull();
  });
});

describe("inpaintBarInfo", () => {
  it("没有选区时为 null", () => {
    expect(inpaintBarInfo(null, false)).toBeNull();
  });

  it("原尺寸合法：无需接受", () => {
    expect(inpaintBarInfo(inpaintOf(1024, 1024), false)).toMatchObject({
      tw: 1024,
      th: 1024,
      suggested: false,
      accepted: true,
    });
  });

  it("需要建议尺寸：接受状态取 sizeAccepted", () => {
    const info = inpaintBarInfo(inpaintOf(1000, 1000), false);
    expect(info).toMatchObject({ tw: 992, th: 992, suggested: true });
    expect(info?.accepted).toBe(false);
    expect(inpaintBarInfo(inpaintOf(1000, 1000), true)?.accepted).toBe(true);
  });
});

describe("draftToParams", () => {
  const base = {
    form: form(),
    inpaint: null,
    sizeAccepted: false,
    reading: false,
  };

  it("正常草稿得到参数", () => {
    const r = draftToParams(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params.prompt).toBe("一只猫");
  });

  it("重绘建议尺寸未接受时最先拦截", () => {
    const r = draftToParams({
      ...base,
      inpaint: inpaintOf(1000, 1000),
      reading: true,
    });
    expect(r).toMatchObject({ ok: false, reason: "size-not-accepted" });
  });

  it("读取中静默拦截", () => {
    const r = draftToParams({ ...base, reading: true });
    expect(r).toEqual({ ok: false, reason: "reading" });
  });

  it("自定义尺寸非法", () => {
    const r = draftToParams({
      ...base,
      form: form({ cw: "1000", ch: "1000" }),
    });
    expect(r).toMatchObject({ ok: false, reason: "custom-size" });
  });

  it("局部重绘不检查自定义尺寸，输出尺寸取目标尺寸", () => {
    const r = draftToParams({
      ...base,
      form: form({ cw: "1000", ch: "1000" }),
      inpaint: inpaintOf(1000, 1000),
      sizeAccepted: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params.size).toEqual({ w: 992, h: 992 });
  });

  it("描述为空：返回首条错误并要求聚焦描述框", () => {
    const r = draftToParams({ ...base, form: form({ prompt: "  " }) });
    expect(r).toEqual({
      ok: false,
      reason: "invalid",
      message: "先写一句画面描述",
      focusPrompt: true,
    });
  });
});
