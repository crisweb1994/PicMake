import { beforeEach, describe, expect, it } from "vitest";
import type { HistoryRow, ImageRow } from "../../db/schema";
import { blankSketch } from "../../lib/sketch";
import { initialWorkspace, useWorkspace } from "./index";
import {
  beginRun,
  closeConfirm,
  closeViewMask,
  expandBar,
  initializeDraft,
  openDrawer,
  openSettings,
  openSketch,
  patchForm,
  rowsLoaded,
  setConfirm,
  setFocusIdx,
  setLastDoneId,
  setReturnId,
  showViewMask,
} from "./actions";
import { selectCanWheelSwitch, selectShouldCollapseBar } from "./selectors";

const state = () => useWorkspace.getState();

beforeEach(() => {
  useWorkspace.setState(initialWorkspace(), true);
});

describe("expandBar", () => {
  it("展开创作条、请求聚焦，并离开 complete 态", () => {
    setLastDoneId("a");
    setReturnId("r");
    expandBar();
    expect(state().view).toMatchObject({ barMode: "full", focusSeq: 1 });
    expect(state().nav).toEqual({
      selectedId: null,
      returnId: "r",
      lastDoneId: null,
    });
    expandBar();
    expect(state().view.focusSeq).toBe(2);
  });
});

describe("selectCanWheelSwitch", () => {
  it("空闲、草稿未改动、没有弹层时响应", () => {
    expect(selectCanWheelSwitch(state())).toBe(true);
  });

  it("草稿改过、有输入图、上传读取中都不响应", () => {
    patchForm({ prompt: "猫" });
    expect(selectCanWheelSwitch(state())).toBe(false);
    initializeDraft(undefined, [{ imageId: "x" }]);
    expect(selectCanWheelSwitch(state())).toBe(false);
    initializeDraft();
    expect(selectCanWheelSwitch(state())).toBe(true);
    useWorkspace.setState((s) => ({ draft: { ...s.draft, readId: "r1" } }));
    expect(selectCanWheelSwitch(state())).toBe(false);
  });

  it("生成中、确认框、画板、各弹层、轮播打开时都不响应", () => {
    beginRun({ n: 1, size: "auto" });
    expect(selectCanWheelSwitch(state())).toBe(false);
    useWorkspace.setState(initialWorkspace(), true);

    setConfirm({ title: "t", desc: "d", onOk: () => {} });
    expect(selectCanWheelSwitch(state())).toBe(false);
    closeConfirm();

    openSketch(blankSketch(10, 10), { kind: "new" }, null);
    expect(selectCanWheelSwitch(state())).toBe(false);
    useWorkspace.setState(initialWorkspace(), true);

    for (const open of [openDrawer, openSettings, () => setFocusIdx(0)]) {
      open();
      expect(selectCanWheelSwitch(state())).toBe(false);
      useWorkspace.setState(initialWorkspace(), true);
    }

    const base = { id: "b", blob: new Blob(), width: 1, height: 1 } as ImageRow;
    showViewMask({ base, commands: [], rowId: "r" });
    expect(selectCanWheelSwitch(state())).toBe(false);
    closeViewMask();
    expect(selectCanWheelSwitch(state())).toBe(true);
  });
});

describe("selectShouldCollapseBar", () => {
  it("草稿未改动、没有输入图、也没有可返回的结果时收起", () => {
    expect(selectShouldCollapseBar(state())).toBe(true);
  });

  it("草稿改过、读取中、有输入图、有可返回的结果时都不收起", () => {
    patchForm({ prompt: "猫" });
    expect(selectShouldCollapseBar(state())).toBe(false);
    initializeDraft(undefined, [{ imageId: "x" }]);
    expect(selectShouldCollapseBar(state())).toBe(false);
    initializeDraft();
    useWorkspace.setState((s) => ({ draft: { ...s.draft, readId: "r1" } }));
    expect(selectShouldCollapseBar(state())).toBe(false);
    initializeDraft();
    expect(selectShouldCollapseBar(state())).toBe(true);
    rowsLoaded([{ id: "r" } as HistoryRow]);
    setReturnId("r");
    expect(selectShouldCollapseBar(state())).toBe(false);
  });
});
