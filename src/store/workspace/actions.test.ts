import { beforeEach, describe, expect, it } from "vitest";
import { initialWorkspace, useWorkspace } from "./index";
import {
  clearDone,
  closeConfirm,
  initWorkspace,
  openBar,
  openLightbox,
  requestPromptFocus,
  resetView,
  selectRecord,
  setConfirm,
  setFocusIdx,
  setLastDoneId,
  setPreviewId,
  openDrawer,
} from "./actions";

const state = () => useWorkspace.getState();

beforeEach(() => {
  useWorkspace.setState(initialWorkspace(), true);
});

describe("view", () => {
  it("openBar：展开创作条，每次调用都让 focusSeq 加 1", () => {
    openBar();
    expect(state().view).toMatchObject({ barMode: "full", focusSeq: 1 });
    openBar();
    expect(state().view.focusSeq).toBe(2);
  });

  it("requestPromptFocus：只增加 focusSeq，不改创作条形态", () => {
    requestPromptFocus();
    expect(state().view).toMatchObject({ barMode: "mini", focusSeq: 1 });
  });

  it("resetView：只清空轮播、灯箱、预览", () => {
    openDrawer();
    setFocusIdx(2);
    openLightbox("img");
    setPreviewId("src");
    resetView();
    expect(state().view).toMatchObject({
      focusIdx: null,
      lightboxId: null,
      previewId: null,
      drawerOpen: true,
    });
  });

  it("initWorkspace：只设置是否打开设置弹窗", () => {
    initWorkspace({ settingsOpen: true });
    expect(state()).toEqual({
      ...initialWorkspace(),
      view: { ...initialWorkspace().view, settingsOpen: true },
    });
  });
});

describe("nav 与 confirm", () => {
  it("选中、完成标记互不影响", () => {
    selectRecord("a");
    setLastDoneId("a");
    clearDone();
    expect(state().nav).toEqual({
      selectedId: "a",
      returnId: null,
      lastDoneId: null,
    });
  });

  it("确认框打开与关闭", () => {
    const onOk = () => {};
    setConfirm({ title: "t", desc: "d", onOk });
    expect(state().confirm?.onOk).toBe(onOk);
    closeConfirm();
    expect(state().confirm).toBeNull();
  });
});
