import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@heroui/react", () => ({ toast: vi.fn() }));
vi.mock("../lib/input-images", () => ({ readInputImage: vi.fn() }));

import { toast } from "@heroui/react";
import type { ImageRow } from "../db/schema";
import { readInputImage } from "../lib/input-images";
import { ApiError, MAX_INPUT_IMAGES, type InputImage } from "../lib/types";
import { initialWorkspace, useWorkspace } from "../store/workspace";
import { initializeDraft } from "../store/workspace/actions";
import { addFiles, removeInput, removeMask } from "./draft";

const state = () => useWorkspace.getState();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const file = (name: string) => new File(["x"], name);
const row = (id: string): ImageRow => ({
  id,
  blob: new Blob(),
  width: 64,
  height: 64,
  format: "png",
});
const input = (id: string): InputImage => ({ imageId: id, name: id });

beforeEach(() => {
  useWorkspace.setState(initialWorkspace(), true);
  vi.mocked(toast).mockClear();
  vi.mocked(readInputImage)
    .mockReset()
    .mockImplementation(async (f) => row(`img-${f.name}`));
});

describe("addFiles", () => {
  it("逐个读取并加入输入图，草稿标记为已修改", async () => {
    await addFiles([file("a.png"), file("b.png")]);
    expect(state().draft.inputs.map((i) => i.imageId)).toEqual([
      "img-a.png",
      "img-b.png",
    ]);
    expect(state().draft).toMatchObject({
      dirty: true,
      readId: null,
      uploadIssues: [],
    });
  });

  it("没有文件：忽略，不进入读取中", async () => {
    await addFiles([]);
    expect(state().draft.readId).toBeNull();
  });

  it("上一批还没读完：忽略新的一批", async () => {
    let finish: (r: ImageRow) => void = () => {};
    vi.mocked(readInputImage).mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const first = addFiles([file("a.png")]);
    await addFiles([file("b.png")]);
    expect(readInputImage).toHaveBeenCalledTimes(1);
    finish(row("img-a.png"));
    await first;
    expect(state().draft.inputs.map((i) => i.imageId)).toEqual(["img-a.png"]);
  });

  it("单个文件失败：其余照常加入，错误带文件名汇总", async () => {
    vi.mocked(readInputImage).mockImplementation(async (f) => {
      if (f.name === "bad.png") throw new ApiError("image-too-large", "");
      return row(`img-${f.name}`);
    });
    await addFiles([file("a.png"), file("bad.png"), file("c.png")]);
    expect(state().draft.inputs.map((i) => i.imageId)).toEqual([
      "img-a.png",
      "img-c.png",
    ]);
    expect(state().draft.uploadIssues).toEqual([
      { kind: "file", file: "bad.png", error: "image-too-large" },
    ]);
  });

  it("读取出现非 ApiError：按无效图片记录", async () => {
    vi.mocked(readInputImage).mockRejectedValue(new Error("decode"));
    await addFiles([file("x.png")]);
    expect(state().draft.uploadIssues).toEqual([
      { kind: "file", file: "x.png", error: "invalid-image" },
    ]);
    expect(state().draft.inputs).toEqual([]);
  });

  it("超过张数上限：只加入放得下的，并提示未添加数量", async () => {
    initializeDraft(
      undefined,
      Array.from({ length: MAX_INPUT_IMAGES - 1 }, (_, i) => input(`i${i}`)),
    );
    await addFiles([file("a.png"), file("b.png")]);
    expect(state().draft.inputs).toHaveLength(MAX_INPUT_IMAGES);
    expect(state().draft.uploadIssues).toEqual([
      { kind: "overflow", kept: 1, skipped: 1 },
    ]);
  });

  it("读取期间草稿被重置（如切换记录）：批次作废，结果丢弃", async () => {
    let finish: (r: ImageRow) => void = () => {};
    vi.mocked(readInputImage).mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const pending = addFiles([file("a.png"), file("b.png")]);
    initializeDraft(); // 新草稿让进行中的读取失效
    finish(row("img-a.png"));
    await pending;
    await flush();
    expect(state().draft.inputs).toEqual([]);
    expect(readInputImage).toHaveBeenCalledTimes(1); // 第二个文件不再读取
  });

  it("读取期间用户移除了图片：批次作废，不把结果加回来", async () => {
    initializeDraft(undefined, [input("old")]);
    let finish: (r: ImageRow) => void = () => {};
    vi.mocked(readInputImage).mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const pending = addFiles([file("a.png")]);
    removeInput("old");
    finish(row("img-a.png"));
    await pending;
    expect(state().draft.inputs).toEqual([]);
  });

  it("第一批输入图加入时比例改为 auto", async () => {
    await addFiles([file("a.png")]);
    expect(state().draft.form).toMatchObject({ ratio: "auto", cw: "", ch: "" });
  });
});

describe("removeInput / removeMask", () => {
  it("移除普通图：提示重新检查图序号", () => {
    initializeDraft(undefined, [input("a"), input("b")]);
    removeInput("a");
    expect(toast).toHaveBeenCalledWith("图片编号已更新，请检查描述中的图序号");
  });

  it("移除选区底图：连带移除选区并提示", () => {
    initializeDraft(undefined, [input("base"), input("b")]);
    useWorkspace.setState((s) => ({
      draft: {
        ...s.draft,
        inpaint: { mask: {} as never, original: undefined },
      },
    }));
    removeInput("base");
    expect(state().draft.inpaint).toBeNull();
    expect(toast).toHaveBeenCalledWith(
      "已移除底图与选区，剩余图片重新编号，请检查描述",
    );
  });

  it("removeMask：保留底图，切换为普通编辑", () => {
    initializeDraft(undefined, [input("base")]);
    useWorkspace.setState((s) => ({
      draft: {
        ...s.draft,
        inpaint: { mask: {} as never, original: undefined },
      },
    }));
    removeMask();
    expect(state().draft.inpaint).toBeNull();
    expect(state().draft.inputs).toHaveLength(1);
    expect(toast).toHaveBeenCalledWith(
      "已移除选区：保留底图与描述，切换为普通图片编辑",
    );
  });
});
