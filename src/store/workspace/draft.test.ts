import { beforeEach, describe, expect, it } from "vitest";
import type { ImageRow } from "../../db/schema";
import { paramsToForm } from "../../lib/params";
import type { GenParams, InputImage, MaskImage } from "../../lib/types";
import { initialWorkspace, useWorkspace } from "./index";
import {
  acceptSize,
  appendExisting,
  applyInpaintToDraft,
  applySketchAttachment,
  beginRead,
  finishRead,
  initializeDraft,
  patchForm,
  removeDraftInput,
  removeDraftMask,
  setInputFidelity,
} from "./actions";

const draft = () => useWorkspace.getState().draft;

const image = (id: string, width = 1024, height = 1024): ImageRow => ({
  id,
  blob: new Blob(),
  width,
  height,
  format: "png",
});
const sketchImage = (id: string, width = 800, height = 600): ImageRow => ({
  ...image(id, width, height),
  sketch: { version: 1, width, height, commands: [] },
});
const maskOf = (base: ImageRow): MaskImage => ({
  ...image(`mask-${base.id}`, base.width, base.height),
  mask: {
    version: 1,
    width: base.width,
    height: base.height,
    baseImageId: base.id,
    commands: [],
  },
});
const input = (row: ImageRow, name = row.id): InputImage => ({
  imageId: row.id,
  name,
  upload: row,
});
const inputs = (count: number) =>
  Array.from({ length: count }, (_, i) => input(image(`i${i}`)));

beforeEach(() => {
  useWorkspace.setState(initialWorkspace(), true);
});

describe("修改与初始化", () => {
  it("patchForm、保真度修改都会标记 dirty", () => {
    patchForm({ prompt: "猫" });
    expect(draft()).toMatchObject({ dirty: true });
    expect(draft().form.prompt).toBe("猫");
    initializeDraft();
    setInputFidelity("high");
    expect(draft()).toMatchObject({ inputFidelity: "high", dirty: true });
  });

  it("不给参数：保留参数只清空描述，并让进行中的读取失效", () => {
    patchForm({ prompt: "猫", quality: "low" });
    beginRead("r1");
    initializeDraft();
    expect(draft()).toMatchObject({ dirty: false, readId: null, inputs: [] });
    expect(draft().form).toMatchObject({ prompt: "", quality: "low" });
  });

  it("给参数：整体替换", () => {
    const params: GenParams = {
      model: "flare",
      prompt: "海边",
      size: { w: 1024, h: 1024 },
      quality: "low",
      n: 2,
      background: "auto",
      outputFormat: "png",
    };
    initializeDraft(params, [input(image("a"))]);
    expect(draft().form).toEqual(paramsToForm(params));
    expect(draft().inputs).toHaveLength(1);
  });
});

describe("上传读取", () => {
  it("批次已失效时忽略结果", () => {
    beginRead("r1");
    initializeDraft();
    expect(finishRead("r1", [input(image("a"))], [])).toBe(false);
    expect(draft().inputs).toEqual([]);
  });

  it("第一批图片：追加、比例改为 auto、标记 dirty、结束读取", () => {
    beginRead("r1");
    expect(finishRead("r1", [input(image("a"))], [])).toBe(true);
    expect(draft()).toMatchObject({
      readId: null,
      dirty: true,
      uploadError: "",
    });
    expect(draft().inputs.map((i) => i.imageId)).toEqual(["a"]);
    expect(draft().form).toMatchObject({ ratio: "auto", cw: "", ch: "" });
  });

  it("超过 16 张只加到上限，失败原因在前、超出提示在后", () => {
    initializeDraft(undefined, inputs(15));
    patchForm({ ratio: "16:9" });
    beginRead("r1");
    finishRead(
      "r1",
      [input(image("x")), input(image("y")), input(image("z"))],
      ["bad.png：请选择有效的 PNG、JPEG 或 WebP 图片。"],
    );
    expect(draft().inputs).toHaveLength(16);
    expect(draft().form.ratio).toBe("16:9");
    expect(draft().uploadError).toBe(
      "bad.png：请选择有效的 PNG、JPEG 或 WebP 图片。\n最多添加 16 张输入图片。本次添加 1 张，2 张未添加。",
    );
  });
});

describe("移除", () => {
  const base = image("base");
  const ref = image("ref");

  it("移除底图时连带移除选区", () => {
    initializeDraft(undefined, [input(base), input(ref)]);
    applyInpaintToDraft({ base, mask: maskOf(base), entry: "reedit" });
    acceptSize();
    expect(removeDraftInput("base")).toBe("base-and-mask");
    expect(draft()).toMatchObject({ inpaint: null, sizeAccepted: false });
    expect(draft().inputs.map((i) => i.imageId)).toEqual(["ref"]);
  });

  it("移除普通图只重新编号，并让读取失效", () => {
    initializeDraft(undefined, [input(base), input(ref)]);
    applyInpaintToDraft({ base, mask: maskOf(base), entry: "reedit" });
    beginRead("r1");
    expect(removeDraftInput("ref")).toBe("renumbered");
    expect(draft().inpaint).not.toBeNull();
    expect(draft().readId).toBeNull();
  });

  it("移除选区：保留底图", () => {
    initializeDraft(undefined, [input(base)]);
    applyInpaintToDraft({ base, mask: maskOf(base), entry: "reedit" });
    removeDraftMask();
    expect(draft()).toMatchObject({ inpaint: null, dirty: true });
    expect(draft().inputs).toHaveLength(1);
  });
});

describe("局部重绘落草稿", () => {
  it("draft-input：底图重排为图1，并移除被选中的原图", () => {
    const newBase = image("normalized", 1000, 1000);
    initializeDraft(undefined, [
      input(image("a")),
      input(image("b")),
      input(image("c")),
    ]);
    applyInpaintToDraft(
      { base: newBase, mask: maskOf(newBase), entry: "draft-input" },
      "b",
    );
    expect(draft().inputs.map((i) => i.imageId)).toEqual([
      "normalized",
      "a",
      "c",
    ]);
    // 1000 × 1000 需要建议尺寸，尚未接受
    expect(draft().sizeAccepted).toBe(false);
  });

  it("result：原尺寸合法时视为已接受", () => {
    const base = image("base");
    initializeDraft(undefined, [input(base)]);
    applyInpaintToDraft({ base, mask: maskOf(base), entry: "result" });
    expect(draft().sizeAccepted).toBe(true);
  });

  it("reedit：不改输入图与接受状态", () => {
    const base = image("base", 1000, 1000);
    initializeDraft(undefined, [input(base)]);
    acceptSize();
    applyInpaintToDraft({ base, mask: maskOf(base), entry: "reedit" });
    expect(draft().sizeAccepted).toBe(true);
    expect(draft().inputs.map((i) => i.imageId)).toEqual(["base"]);
  });
});

describe("设为参考图", () => {
  it("第一张时比例改为 auto；重复与超限不添加", () => {
    expect(appendExisting("x", "g1", "已有作品 · 第 1 张")).toBe("added");
    expect(draft().form.ratio).toBe("auto");
    expect(appendExisting("x", "g1", "已有作品 · 第 1 张")).toBe("duplicate");
    initializeDraft(undefined, inputs(16));
    expect(appendExisting("y", "g2", "已有作品 · 第 1 张")).toBe("too-many");
    expect(draft().inputs).toHaveLength(16);
  });
});

describe("草图附件", () => {
  it("第一次加草图：尺寸为 auto 时改为草图尺寸，描述为空时填入起始文字，并展开创作条", () => {
    patchForm({ ratio: "auto" });
    const result = applySketchAttachment(sketchImage("s1"), null);
    expect(result).toEqual({ ok: true, sizeSetTo: { w: 800, h: 600 } });
    expect(draft().form).toMatchObject({ cw: "800", ch: "600" });
    expect(draft().form.prompt.startsWith("以图1的草图为构图参考")).toBe(true);
    expect(useWorkspace.getState().view).toMatchObject({
      barMode: "full",
      focusSeq: 1,
    });
  });

  it("已有草图时原位替换，描述不为空不覆盖", () => {
    initializeDraft(undefined, [input(image("a")), input(sketchImage("s1"))]);
    patchForm({ prompt: "保留这句" });
    const result = applySketchAttachment(sketchImage("s2"), null);
    expect(result).toEqual({ ok: true, sizeSetTo: null });
    expect(draft().inputs.map((i) => i.imageId)).toEqual(["a", "s2"]);
    expect(draft().form.prompt).toBe("保留这句");
  });

  it("已满 16 张且没有可替换的草图时拒绝", () => {
    initializeDraft(undefined, inputs(16));
    expect(applySketchAttachment(sketchImage("s1"), null)).toEqual({
      ok: false,
    });
    expect(draft().inputs).toHaveLength(16);
  });
});
