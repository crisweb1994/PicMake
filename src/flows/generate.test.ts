import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@heroui/react", () => ({ toast: vi.fn() }));
vi.mock("../api/client", () => ({ requestImages: vi.fn() }));
vi.mock("../db/history", () => ({ saveGeneration: vi.fn() }));
vi.mock("../store/settings", () => ({
  useSettings: { getState: () => ({ baseUrl: "http://mock", apiKey: "k" }) },
}));

import { toast } from "@heroui/react";
import { requestImages } from "../api/client";
import type { PreparedGeneration } from "../lib/generation";
import { initialWorkspace, useWorkspace } from "../store/workspace";
import {
  beginRun,
  beginSave,
  closeConfirm,
  discardUnsaved,
  markUnsaved,
  patchForm,
} from "../store/workspace/actions";
import { generate } from "./generate";

const state = () => useWorkspace.getState();
const plan = { n: 1, size: "auto" } as const;
const prepared = {
  row: { id: "u1" },
  images: [],
  sources: [],
} as unknown as PreparedGeneration;

beforeEach(() => {
  useWorkspace.setState(initialWorkspace(), true);
  vi.mocked(toast).mockClear();
  // 请求一直不返回：只关心有没有发起
  vi.mocked(requestImages)
    .mockReset()
    .mockReturnValue(new Promise(() => {}));
});

/** 把状态推到"保存失败，结果留在内存" */
function toUnsaved() {
  beginRun(plan);
  beginSave(prepared);
  markUnsaved();
}

describe("generate", () => {
  it("空闲：直接发起一次生成请求", () => {
    patchForm({ prompt: "猫" });
    generate();
    expect(requestImages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestImages).mock.calls[0][0]).toMatchObject({
      prompt: "猫",
    });
    expect(state().run.phase).toBe("generating");
    expect(state().confirm).toBeNull();
  });

  it("生成中、保存中：忽略，不弹确认也不发请求", () => {
    patchForm({ prompt: "猫" });
    beginRun(plan);
    generate();
    beginSave(prepared);
    generate();
    expect(requestImages).not.toHaveBeenCalled();
    expect(state().confirm).toBeNull();
    expect(state().run.phase).toBe("saving");
  });

  it("有未保存结果：先弹确认，不发请求；取消后结果仍在", () => {
    patchForm({ prompt: "猫" });
    toUnsaved();
    generate();
    expect(state().confirm).toMatchObject({ title: "放弃未保存结果？" });
    expect(requestImages).not.toHaveBeenCalled();
    closeConfirm();
    expect(state().run).toEqual({ phase: "unsaved", prepared });
    expect(requestImages).not.toHaveBeenCalled();
  });

  it("确认后：丢弃未保存结果，用点击时的草稿发起一次新的生成", () => {
    patchForm({ prompt: "猫" });
    toUnsaved();
    generate();
    // 确认框弹出后草稿又被改动：提交的仍是点击时的内容
    patchForm({ prompt: "狗" });
    const { onOk } = state().confirm!;
    closeConfirm();
    onOk();
    expect(requestImages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestImages).mock.calls[0][0]).toMatchObject({
      prompt: "猫",
    });
    expect(state().run.phase).toBe("generating");
  });

  it("确认期间未保存结果已被处理：确认后不重复发起", () => {
    patchForm({ prompt: "猫" });
    toUnsaved();
    generate();
    const { onOk } = state().confirm!;
    closeConfirm();
    discardUnsaved();
    beginRun(plan);
    onOk();
    expect(requestImages).not.toHaveBeenCalled();
    expect(state().run.phase).toBe("generating");
  });

  it("草稿不合法：照常提示并聚焦描述框，不弹确认", () => {
    toUnsaved();
    generate();
    expect(state().confirm).toBeNull();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(state().view.focusSeq).toBe(1);
    expect(requestImages).not.toHaveBeenCalled();
    expect(state().run.phase).toBe("unsaved");
  });
});
